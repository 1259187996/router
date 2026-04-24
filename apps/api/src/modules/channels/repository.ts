import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { channelRoutes, channels, logicalModels } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';
import type { CreateChannelInput, CreateLogicalModelInput } from './schema.js';

export type ChannelRecord = typeof channels.$inferSelect;
export type LogicalModelRecord = typeof logicalModels.$inferSelect;
export type ChannelRouteRecord = typeof channelRoutes.$inferSelect;
type PgError = Error & {
  code?: string;
  constraint?: string;
};

export class ChannelsRepository {
  constructor(private readonly db: AppDb) {}

  async createChannel(userId: string, input: CreateChannelInput) {
    const [channel] = await this.db
      .insert(channels)
      .values({
        userId,
        name: input.name,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: input.apiKey,
        defaultModelId: input.defaultModelId,
        status: 'active'
      })
      .returning();

    return channel;
  }

  async findChannelByIdAndUserId(channelId: string, userId: string) {
    const [channel] = await this.db
      .select()
      .from(channels)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .limit(1);

    return channel ?? null;
  }

  async listChannelsByUserId(userId: string) {
    return this.db
      .select({
        id: channels.id,
        name: channels.name,
        baseUrl: channels.baseUrl,
        defaultModelId: channels.defaultModelId,
        status: channels.status,
        lastTestStatus: channels.lastTestStatus,
        lastTestError: channels.lastTestError,
        lastTestedAt: channels.lastTestedAt,
        createdAt: channels.createdAt,
        updatedAt: channels.updatedAt
      })
      .from(channels)
      .where(eq(channels.userId, userId))
      .orderBy(desc(channels.createdAt), desc(channels.id));
  }

  async updateChannelTestResult(
    channelId: string,
    userId: string,
    input: {
      lastTestStatus: string;
      lastTestError: string | null;
      lastTestedAt: Date;
    }
  ) {
    const [channel] = await this.db
      .update(channels)
      .set({
        lastTestStatus: input.lastTestStatus,
        lastTestError: input.lastTestError,
        lastTestedAt: input.lastTestedAt,
        updatedAt: new Date()
      })
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .returning();

    return channel ?? null;
  }

  async findOwnedChannelIds(userId: string, channelIds: string[]) {
    if (channelIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.userId, userId), inArray(channels.id, channelIds)));

    return rows.map((row) => row.id);
  }

  async findActiveLogicalModelByAlias(userId: string, alias: string) {
    const [logicalModel] = await this.db
      .select()
      .from(logicalModels)
      .where(
        and(
          eq(logicalModels.userId, userId),
          eq(logicalModels.alias, alias),
          eq(logicalModels.status, 'active')
        )
      )
      .limit(1);

    return logicalModel ?? null;
  }

  async listLogicalModelsByUserId(userId: string) {
    return this.db
      .select({
        logicalModelId: logicalModels.id,
        logicalModelAlias: logicalModels.alias,
        logicalModelDescription: logicalModels.description,
        logicalModelStatus: logicalModels.status,
        logicalModelCreatedAt: logicalModels.createdAt,
        logicalModelUpdatedAt: logicalModels.updatedAt,
        routeId: channelRoutes.id,
        routeChannelId: channelRoutes.channelId,
        routeUpstreamModelId: channelRoutes.upstreamModelId,
        routeInputPricePer1m: channelRoutes.inputPricePer1m,
        routeOutputPricePer1m: channelRoutes.outputPricePer1m,
        routeCurrency: channelRoutes.currency,
        routePriority: channelRoutes.priority,
        routeStatus: channelRoutes.status,
        routeChannelName: channels.name
      })
      .from(logicalModels)
      .leftJoin(
        channelRoutes,
        and(
          eq(channelRoutes.logicalModelId, logicalModels.id),
          eq(channelRoutes.userId, userId)
        )
      )
      .leftJoin(channels, eq(channels.id, channelRoutes.channelId))
      .where(eq(logicalModels.userId, userId))
      .orderBy(
        desc(logicalModels.createdAt),
        desc(logicalModels.id),
        asc(channelRoutes.priority),
        asc(channelRoutes.createdAt),
        asc(channelRoutes.id)
      );
  }

  isActiveLogicalModelAliasConflict(error: unknown) {
    const pgError = error as PgError;

    return (
      pgError.code === '23505' &&
      pgError.constraint === 'logical_models_user_alias_active_unique_idx'
    );
  }

  async createLogicalModelWithRoutes(userId: string, input: CreateLogicalModelInput) {
    return this.db.transaction(async (tx) => {
      const [logicalModel] = await tx
        .insert(logicalModels)
        .values({
          userId,
          alias: input.alias,
          description: input.description,
          status: 'active'
        })
        .returning();

      const routes = await tx
        .insert(channelRoutes)
        .values(
          input.routes.map((route) => ({
            userId,
            logicalModelId: logicalModel.id,
            channelId: route.channelId,
            upstreamModelId: route.upstreamModelId,
            inputPricePer1m: route.inputPricePer1m,
            outputPricePer1m: route.outputPricePer1m,
            currency: route.currency,
            priority: route.priority,
            status: 'active' as const
          }))
        )
        .returning();

      return {
        logicalModel,
        routes
      };
    });
  }
}
