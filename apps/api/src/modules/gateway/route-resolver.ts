import { and, asc, eq } from 'drizzle-orm';
import { channelRoutes, channels, logicalModels } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';

export async function resolveRoutesForAlias(
  db: AppDb,
  input: { userId: string; alias: string }
) {
  return db
    .select({
      routeId: channelRoutes.id,
      channelId: channels.id,
      baseUrl: channels.baseUrl,
      apiKeyEncrypted: channels.apiKeyEncrypted,
      upstreamModelId: channelRoutes.upstreamModelId,
      inputPricePer1m: channelRoutes.inputPricePer1m,
      outputPricePer1m: channelRoutes.outputPricePer1m,
      currency: channelRoutes.currency,
      priority: channelRoutes.priority
    })
    .from(channelRoutes)
    .innerJoin(logicalModels, eq(channelRoutes.logicalModelId, logicalModels.id))
    .innerJoin(channels, eq(channelRoutes.channelId, channels.id))
    .where(
      and(
        eq(channelRoutes.userId, input.userId),
        eq(channelRoutes.status, 'active'),
        eq(logicalModels.userId, input.userId),
        eq(logicalModels.alias, input.alias),
        eq(logicalModels.status, 'active'),
        eq(channels.userId, input.userId),
        eq(channels.status, 'active')
      )
    )
    .orderBy(asc(channelRoutes.priority), asc(channelRoutes.id));
}
