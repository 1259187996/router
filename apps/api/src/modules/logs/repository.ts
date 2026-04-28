import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { channelRoutes, channels, requestLogs, routeAttempts } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';

export class LogsRepository {
  constructor(private readonly db: AppDb) {}

  async listLogsByUserId(
    userId: string,
    input: {
      apiTokenId?: string;
      page: number;
      pageSize: number;
    }
  ) {
    const whereClause = input.apiTokenId
      ? and(eq(requestLogs.userId, userId), eq(requestLogs.apiTokenId, input.apiTokenId))
      : eq(requestLogs.userId, userId);
    const [totalRow] = await this.db
      .select({ total: count() })
      .from(requestLogs)
      .where(whereClause);
    const total = totalRow?.total ?? 0;
    const [summary] = await this.db
      .select({
        successfulRequests: sql<number>`coalesce(sum(case when ${requestLogs.requestStatus} = 'success' then 1 else 0 end), 0)::int`,
        attentionRequests: sql<number>`coalesce(sum(case when ${requestLogs.requestStatus} <> 'success' then 1 else 0 end), 0)::int`,
        inputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)::int`,
        cachedInputTokens: sql<number>`coalesce(sum(${requestLogs.cachedInputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)::int`,
        settlementPriceUsd: sql<string>`coalesce(sum(${requestLogs.settlementPriceUsd}), 0)::numeric(12, 4)::text`
      })
      .from(requestLogs)
      .where(whereClause);
    const logs = await this.db
      .select()
      .from(requestLogs)
      .where(whereClause)
      .orderBy(desc(requestLogs.startedAt), desc(requestLogs.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const inputTokens = summary?.inputTokens ?? 0;
    const cachedInputTokens = summary?.cachedInputTokens ?? 0;
    const outputTokens = summary?.outputTokens ?? 0;

    return {
      logs,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize))
      },
      summary: {
        totalRequests: total,
        successfulRequests: summary?.successfulRequests ?? 0,
        attentionRequests: summary?.attentionRequests ?? 0,
        totalTokens: inputTokens + outputTokens,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        settlementPriceUsd: summary?.settlementPriceUsd ?? '0.0000'
      }
    };
  }

  async getOverviewByUserId(userId: string) {
    const [summary] = await this.db
      .select({
        totalRequests: count(),
        successfulRequests: sql<number>`coalesce(sum(case when ${requestLogs.requestStatus} = 'success' then 1 else 0 end), 0)::int`,
        reviewRequiredRequests: sql<number>`coalesce(sum(case when ${requestLogs.requestStatus} = 'review_required' then 1 else 0 end), 0)::int`,
        inputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)::int`,
        cachedInputTokens: sql<number>`coalesce(sum(${requestLogs.cachedInputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)::int`,
        settlementPriceUsd: sql<string>`coalesce(sum(${requestLogs.settlementPriceUsd}), 0)::numeric(12, 4)::text`
      })
      .from(requestLogs)
      .where(eq(requestLogs.userId, userId));

    const inputTokens = summary?.inputTokens ?? 0;
    const cachedInputTokens = summary?.cachedInputTokens ?? 0;
    const outputTokens = summary?.outputTokens ?? 0;

    return {
      totalRequests: summary?.totalRequests ?? 0,
      successfulRequests: summary?.successfulRequests ?? 0,
      reviewRequiredRequests: summary?.reviewRequiredRequests ?? 0,
      totalTokens: inputTokens + outputTokens,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      settlementPriceUsd: summary?.settlementPriceUsd ?? '0.0000'
    };
  }

  async findLogDetailByIdAndUserId(userId: string, logId: string) {
    const [record] = await this.db
      .select({
        log: requestLogs,
        finalChannel: {
          id: channels.id,
          name: channels.name,
          baseUrl: channels.baseUrl,
          defaultModelId: channels.defaultModelId,
          status: channels.status
        },
        finalRoute: {
          id: channelRoutes.id,
          upstreamModelId: channelRoutes.upstreamModelId,
          inputPricePer1m: channelRoutes.inputPricePer1m,
          cachedInputPricePer1m: channelRoutes.cachedInputPricePer1m,
          outputPricePer1m: channelRoutes.outputPricePer1m,
          currency: channelRoutes.currency,
          priority: channelRoutes.priority,
          status: channelRoutes.status
        }
      })
      .from(requestLogs)
      .leftJoin(channels, eq(requestLogs.finalChannelId, channels.id))
      .leftJoin(channelRoutes, eq(requestLogs.finalRouteId, channelRoutes.id))
      .where(and(eq(requestLogs.userId, userId), eq(requestLogs.id, logId)))
      .limit(1);

    if (!record) {
      return null;
    }

    const attempts = await this.db
      .select({
        id: routeAttempts.id,
        requestLogId: routeAttempts.requestLogId,
        attemptIndex: routeAttempts.attemptIndex,
        attemptStatus: routeAttempts.attemptStatus,
        failureStage: routeAttempts.failureStage,
        errorSummary: routeAttempts.errorSummary,
        startedAt: routeAttempts.startedAt,
        finishedAt: routeAttempts.finishedAt,
        channel: {
          id: channels.id,
          name: channels.name,
          baseUrl: channels.baseUrl,
          defaultModelId: channels.defaultModelId,
          status: channels.status
        },
        route: {
          id: channelRoutes.id,
          upstreamModelId: channelRoutes.upstreamModelId,
          inputPricePer1m: channelRoutes.inputPricePer1m,
          cachedInputPricePer1m: channelRoutes.cachedInputPricePer1m,
          outputPricePer1m: channelRoutes.outputPricePer1m,
          currency: channelRoutes.currency,
          priority: channelRoutes.priority,
          status: channelRoutes.status
        }
      })
      .from(routeAttempts)
      .innerJoin(channels, eq(routeAttempts.channelId, channels.id))
      .innerJoin(channelRoutes, eq(routeAttempts.routeId, channelRoutes.id))
      .where(eq(routeAttempts.requestLogId, logId))
      .orderBy(asc(routeAttempts.attemptIndex), asc(routeAttempts.id));

    return {
      log: record.log,
      finalChannel: record.finalChannel?.id ? record.finalChannel : null,
      finalRoute: record.finalRoute?.id ? record.finalRoute : null,
      attempts
    };
  }
}
