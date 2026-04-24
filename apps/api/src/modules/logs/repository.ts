import { and, asc, desc, eq } from 'drizzle-orm';
import { channelRoutes, channels, requestLogs, routeAttempts } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';

export class LogsRepository {
  constructor(private readonly db: AppDb) {}

  async listLogsByUserId(userId: string) {
    return this.db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.userId, userId))
      .orderBy(desc(requestLogs.startedAt), desc(requestLogs.id));
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
