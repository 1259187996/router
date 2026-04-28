import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { channelModels, channelRoutes, channels, logicalModels } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';
import type {
  ChannelModelInput,
  CreateChannelInput,
  CreateLogicalModelInput,
  PreparedLogicalModelRouteInput,
  UpdateChannelInput,
  UpdateLogicalModelInput
} from './schema.js';

export type ChannelRecord = typeof channels.$inferSelect;
export type ChannelModelRecord = typeof channelModels.$inferSelect;
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

  async updateChannelByIdAndUserId(
    channelId: string,
    userId: string,
    input: UpdateChannelInput & { apiKeyEncrypted?: string }
  ) {
    const updateValues: Partial<typeof channels.$inferInsert> = {
      updatedAt: new Date()
    };

    if (input.name !== undefined) {
      updateValues.name = input.name;
    }

    if (input.baseUrl !== undefined) {
      updateValues.baseUrl = input.baseUrl;
    }

    if (input.apiKeyEncrypted !== undefined) {
      updateValues.apiKeyEncrypted = input.apiKeyEncrypted;
    }

    if (input.defaultModelId !== undefined) {
      updateValues.defaultModelId = input.defaultModelId;
    }

    if (input.status !== undefined) {
      updateValues.status = input.status;
    }

    const [channel] = await this.db
      .update(channels)
      .set(updateValues)
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .returning();

    return channel ?? null;
  }

  async disableChannelByIdAndUserId(channelId: string, userId: string) {
    const [channel] = await this.db
      .update(channels)
      .set({
        status: 'disabled',
        updatedAt: new Date()
      })
      .where(and(eq(channels.id, channelId), eq(channels.userId, userId)))
      .returning();

    return channel ?? null;
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

  async createChannelModel(userId: string, channelId: string, input: ChannelModelInput) {
    const [model] = await this.db
      .insert(channelModels)
      .values({
        userId,
        channelId,
        upstreamModelId: input.upstreamModelId,
        inputPricePer1m: input.inputPricePer1m,
        outputPricePer1m: input.outputPricePer1m,
        currency: input.currency,
        status: 'active'
      })
      .returning();

    return model;
  }

  async updateChannelModelByIdAndUserId(
    userId: string,
    channelId: string,
    modelId: string,
    input: Partial<ChannelModelInput> & { status?: 'active' | 'disabled' }
  ) {
    const updateValues: Partial<typeof channelModels.$inferInsert> = {
      updatedAt: new Date()
    };

    if (input.upstreamModelId !== undefined) {
      updateValues.upstreamModelId = input.upstreamModelId;
    }

    if (input.inputPricePer1m !== undefined) {
      updateValues.inputPricePer1m = input.inputPricePer1m;
    }

    if (input.outputPricePer1m !== undefined) {
      updateValues.outputPricePer1m = input.outputPricePer1m;
    }

    if (input.currency !== undefined) {
      updateValues.currency = input.currency;
    }

    if (input.status !== undefined) {
      updateValues.status = input.status;
    }

    const [model] = await this.db
      .update(channelModels)
      .set(updateValues)
      .where(
        and(
          eq(channelModels.id, modelId),
          eq(channelModels.channelId, channelId),
          eq(channelModels.userId, userId)
        )
      )
      .returning();

    return model ?? null;
  }

  async disableChannelModelByIdAndUserId(userId: string, channelId: string, modelId: string) {
    const [model] = await this.db
      .update(channelModels)
      .set({
        status: 'disabled',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(channelModels.id, modelId),
          eq(channelModels.channelId, channelId),
          eq(channelModels.userId, userId)
        )
      )
      .returning();

    return model ?? null;
  }

  async findActiveChannelModelByIdAndUserId(userId: string, channelId: string, modelId: string) {
    const [model] = await this.db
      .select()
      .from(channelModels)
      .where(
        and(
          eq(channelModels.id, modelId),
          eq(channelModels.channelId, channelId),
          eq(channelModels.userId, userId),
          eq(channelModels.status, 'active')
        )
      )
      .limit(1);

    return model ?? null;
  }

  async listChannelModelsByChannelIdAndUserId(userId: string, channelId: string) {
    return this.db
      .select()
      .from(channelModels)
      .where(and(eq(channelModels.userId, userId), eq(channelModels.channelId, channelId)))
      .orderBy(asc(channelModels.upstreamModelId), asc(channelModels.id));
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
        routeChannelModelId: channelRoutes.channelModelId,
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

  async listLogicalModelsByChannelIdAndUserId(userId: string, channelId: string) {
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
        routeChannelModelId: channelRoutes.channelModelId,
        routeUpstreamModelId: channelRoutes.upstreamModelId,
        routeInputPricePer1m: channelRoutes.inputPricePer1m,
        routeOutputPricePer1m: channelRoutes.outputPricePer1m,
        routeCurrency: channelRoutes.currency,
        routePriority: channelRoutes.priority,
        routeStatus: channelRoutes.status,
        routeChannelName: channels.name
      })
      .from(logicalModels)
      .innerJoin(
        channelRoutes,
        and(
          eq(channelRoutes.logicalModelId, logicalModels.id),
          eq(channelRoutes.userId, userId),
          eq(channelRoutes.channelId, channelId),
          eq(channelRoutes.status, 'active')
        )
      )
      .innerJoin(channels, eq(channels.id, channelRoutes.channelId))
      .where(eq(logicalModels.userId, userId))
      .orderBy(
        desc(logicalModels.createdAt),
        desc(logicalModels.id),
        asc(channelRoutes.priority),
        asc(channelRoutes.createdAt),
        asc(channelRoutes.id)
      );
  }

  async findLogicalModelByIdAndUserId(userId: string, logicalModelId: string) {
    const [logicalModel] = await this.db
      .select()
      .from(logicalModels)
      .where(and(eq(logicalModels.userId, userId), eq(logicalModels.id, logicalModelId)))
      .limit(1);

    return logicalModel ?? null;
  }

  isActiveLogicalModelAliasConflict(error: unknown) {
    const pgError = error as PgError;

    return (
      pgError.code === '23505' &&
      pgError.constraint === 'logical_models_user_alias_active_unique_idx'
    );
  }

  async createLogicalModelWithRoutes(
    userId: string,
    input: Omit<CreateLogicalModelInput, 'routes'> & { routes: PreparedLogicalModelRouteInput[] }
  ) {
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
            channelModelId: route.channelModelId ?? null,
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

  async updateLogicalModelWithRoutes(
    userId: string,
    logicalModelId: string,
    input: Omit<UpdateLogicalModelInput, 'routes'> & {
      routes?: PreparedLogicalModelRouteInput[];
    }
  ) {
    return this.db.transaction(async (tx) => {
      const updateValues: Partial<typeof logicalModels.$inferInsert> = {
        updatedAt: new Date()
      };

      if (input.alias !== undefined) {
        updateValues.alias = input.alias;
      }

      if (input.description !== undefined) {
        updateValues.description = input.description;
      }

      if (input.status !== undefined) {
        updateValues.status = input.status;
      }

      const [logicalModel] = await tx
        .update(logicalModels)
        .set(updateValues)
        .where(and(eq(logicalModels.id, logicalModelId), eq(logicalModels.userId, userId)))
        .returning();

      if (!logicalModel) {
        return null;
      }

      if (!input.routes) {
        const routes = await tx
          .select()
          .from(channelRoutes)
          .where(and(eq(channelRoutes.logicalModelId, logicalModel.id), eq(channelRoutes.userId, userId)))
          .orderBy(asc(channelRoutes.priority), asc(channelRoutes.createdAt), asc(channelRoutes.id));

        return {
          logicalModel,
          routes
        };
      }

      await tx
        .update(channelRoutes)
        .set({
          status: 'disabled',
          updatedAt: new Date()
        })
        .where(and(eq(channelRoutes.logicalModelId, logicalModel.id), eq(channelRoutes.userId, userId)));

      const routes = await tx
        .insert(channelRoutes)
        .values(
          input.routes.map((route) => ({
            userId,
            logicalModelId: logicalModel.id,
            channelId: route.channelId,
            channelModelId: route.channelModelId ?? null,
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

  async disableLogicalModelByIdAndUserId(userId: string, logicalModelId: string) {
    return this.db.transaction(async (tx) => {
      const [logicalModel] = await tx
        .update(logicalModels)
        .set({
          status: 'disabled',
          updatedAt: new Date()
        })
        .where(and(eq(logicalModels.id, logicalModelId), eq(logicalModels.userId, userId)))
        .returning();

      if (!logicalModel) {
        return null;
      }

      await tx
        .update(channelRoutes)
        .set({
          status: 'disabled',
          updatedAt: new Date()
        })
        .where(and(eq(channelRoutes.logicalModelId, logicalModel.id), eq(channelRoutes.userId, userId)));

      return logicalModel;
    });
  }
}
