import { eq, sql } from 'drizzle-orm';
import {
  apiTokens,
  priceSnapshots,
  requestLogs,
  routeAttempts
} from '../../db/schema/index.js';
import { applyBudgetSettlement } from '../billing/settlement.js';
import { computeSettlementPriceUsd, formatUsdAmount } from '../billing/pricing.js';
import type { AppDb } from '../auth/repository.js';

export class RequestLogService {
  constructor(private readonly db: AppDb) {}

  async createStartedLog(input: {
    userId: string;
    apiTokenId: string;
    endpointType: 'chat_completions' | 'embeddings' | 'responses';
    logicalModelAlias: string;
    rawRequestSummary: unknown;
  }) {
    const [log] = await this.db
      .insert(requestLogs)
      .values({
        userId: input.userId,
        apiTokenId: input.apiTokenId,
        endpointType: input.endpointType,
        logicalModelAlias: input.logicalModelAlias,
        requestStatus: 'in_progress',
        rawRequestSummary: input.rawRequestSummary,
        startedAt: new Date()
      })
      .returning();

    return log;
  }

  async recordAttempt(input: {
    requestLogId: string;
    channelId: string;
    routeId: string;
    attemptIndex: number;
    attemptStatus: 'failed' | 'succeeded';
    failureStage?: 'connect' | 'handshake' | 'upstream_error' | 'timeout' | 'protocol_parse' | null;
    errorSummary?: string | null;
    startedAt: Date;
    finishedAt: Date;
  }) {
    const [attempt] = await this.db
      .insert(routeAttempts)
      .values({
        requestLogId: input.requestLogId,
        channelId: input.channelId,
        routeId: input.routeId,
        attemptIndex: input.attemptIndex,
        attemptStatus: input.attemptStatus,
        failureStage: input.failureStage ?? null,
        errorSummary: input.errorSummary ?? null,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt
      })
      .returning();

    return attempt;
  }

  async markSuccess(input: {
    requestLogId: string;
    apiTokenId?: string | null;
    startedAt: Date;
    statusCode: number;
    finalChannelId: string;
    finalRouteId: string;
    finalUpstreamModelId: string;
    eventSummaryJson: unknown;
    isUsageSettleable: boolean;
    rawUsageJson?: unknown;
    rawUpstreamPriceUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    inputPricePer1m: string;
    outputPricePer1m: string;
    currency: string;
  }) {
    const finishedAt = new Date();
    const durationMs = this.calculateDurationMs(input.startedAt, finishedAt);
    const hasRawUsagePayload = input.rawUsageJson !== null && input.rawUsageJson !== undefined;
    const shouldReviewRequired = !input.isUsageSettleable && input.statusCode >= 200 && input.statusCode < 300;

    await this.db.transaction(async (tx) => {
      await tx.insert(priceSnapshots).values({
        requestLogId: input.requestLogId,
        pricingSource: 'local_table',
        inputPricePer1m: input.inputPricePer1m,
        outputPricePer1m: input.outputPricePer1m,
        currency: input.currency
      });

      if (!input.isUsageSettleable) {
        await tx
          .update(requestLogs)
          .set({
            requestStatus: shouldReviewRequired ? 'review_required' : 'success',
            httpStatusCode: input.statusCode,
            finalChannelId: input.finalChannelId,
            finalRouteId: input.finalRouteId,
            finalUpstreamModelId: input.finalUpstreamModelId,
            rawUsageJson: hasRawUsagePayload ? input.rawUsageJson ?? null : null,
            eventSummaryJson: input.eventSummaryJson,
            rawUpstreamPriceUsd:
              input.rawUpstreamPriceUsd === null || input.rawUpstreamPriceUsd === undefined
                ? null
                : formatUsdAmount(input.rawUpstreamPriceUsd, 4),
            settlementPriceUsd: null,
            inputTokens: null,
            outputTokens: null,
            finishedAt,
            durationMs
          })
          .where(eq(requestLogs.id, input.requestLogId));

        return;
      }

      const settlementPriceUsd = computeSettlementPriceUsd({
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        inputPricePer1m: input.inputPricePer1m,
        outputPricePer1m: input.outputPricePer1m
      });

      await tx
        .update(requestLogs)
        .set({
          requestStatus: 'success',
          httpStatusCode: input.statusCode,
          finalChannelId: input.finalChannelId,
          finalRouteId: input.finalRouteId,
          finalUpstreamModelId: input.finalUpstreamModelId,
          rawUsageJson: input.rawUsageJson ?? null,
          eventSummaryJson: input.eventSummaryJson,
          rawUpstreamPriceUsd:
            input.rawUpstreamPriceUsd === null || input.rawUpstreamPriceUsd === undefined
              ? null
              : formatUsdAmount(input.rawUpstreamPriceUsd, 4),
          settlementPriceUsd: formatUsdAmount(settlementPriceUsd, 4),
          inputTokens: input.inputTokens ?? 0,
          outputTokens: input.outputTokens ?? 0,
          finishedAt,
          durationMs
        })
        .where(eq(requestLogs.id, input.requestLogId));

      if (!input.apiTokenId) {
        return;
      }

      await tx.execute(sql`select id from api_tokens where id = ${input.apiTokenId} for update`);

      const [token] = await tx
        .select({
          id: apiTokens.id,
          budgetLimitUsd: apiTokens.budgetLimitUsd,
          budgetUsedUsd: apiTokens.budgetUsedUsd
        })
        .from(apiTokens)
        .where(eq(apiTokens.id, input.apiTokenId))
        .limit(1);

      if (!token) {
        return;
      }

      const budgetSettlement = applyBudgetSettlement({
        budgetLimitUsd: token.budgetLimitUsd,
        budgetUsedUsd: token.budgetUsedUsd,
        settlementPriceUsd
      });

      await tx
        .update(apiTokens)
        .set({
          budgetUsedUsd: budgetSettlement.budgetUsedUsd,
          status: budgetSettlement.status,
          lastUsedAt: finishedAt,
          updatedAt: finishedAt
        })
        .where(eq(apiTokens.id, token.id));
    });
  }

  async markUpstreamError(input: {
    requestLogId: string;
    startedAt: Date;
    errorSummary: string;
    statusCode?: number;
  }) {
    const finishedAt = new Date();
    const [updatedLog] = await this.db
      .update(requestLogs)
      .set({
        requestStatus: 'upstream_error',
        httpStatusCode: input.statusCode ?? 502,
        errorSummary: input.errorSummary,
        finishedAt,
        durationMs: this.calculateDurationMs(input.startedAt, finishedAt)
      })
      .where(eq(requestLogs.id, input.requestLogId))
      .returning();

    return updatedLog;
  }

  async markStreamFailed(input: {
    requestLogId: string;
    startedAt: Date;
    errorSummary: string;
    statusCode?: number;
    finalChannelId?: string;
    finalRouteId?: string;
    finalUpstreamModelId?: string;
    eventSummaryJson?: unknown;
    rawUsageJson?: unknown;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }) {
    const finishedAt = new Date();
    const [updatedLog] = await this.db
      .update(requestLogs)
      .set({
        requestStatus: 'stream_failed',
        httpStatusCode: input.statusCode ?? 502,
        errorSummary: input.errorSummary,
        finalChannelId: input.finalChannelId ?? null,
        finalRouteId: input.finalRouteId ?? null,
        finalUpstreamModelId: input.finalUpstreamModelId ?? null,
        eventSummaryJson: input.eventSummaryJson ?? null,
        rawUsageJson: input.rawUsageJson ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        finishedAt,
        durationMs: this.calculateDurationMs(input.startedAt, finishedAt)
      })
      .where(eq(requestLogs.id, input.requestLogId))
      .returning();

    return updatedLog;
  }

  private calculateDurationMs(startedAt: Date, finishedAt: Date) {
    return Math.max(0, finishedAt.getTime() - startedAt.getTime());
  }
}
