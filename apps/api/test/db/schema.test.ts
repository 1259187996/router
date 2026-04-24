import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/test-db.js';
import {
  apiTokens,
  channelRoutes,
  channels,
  logicalModels,
  requestLogs,
  routeAttempts,
  users
} from '../../src/db/schema/index.js';

describe('database schema', () => {
  const ctx = createTestDb();

  beforeAll(ctx.start);
  afterAll(ctx.stop);

  it('persists a user owned routing graph and request log', async () => {
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: 'alice@example.com',
        displayName: 'Alice',
        passwordHash: 'hash',
        role: 'user',
        status: 'active'
      })
      .returning();

    const [channel] = await ctx.db
      .insert(channels)
      .values({
        userId: user.id,
        name: 'openai-main',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyEncrypted: 'encrypted',
        defaultModelId: 'gpt-4o',
        status: 'active'
      })
      .returning();

    const [logicalModel] = await ctx.db
      .insert(logicalModels)
      .values({
        userId: user.id,
        alias: 'gpt-4o',
        description: 'primary chat model',
        status: 'active'
      })
      .returning();

    const [route] = await ctx.db
      .insert(channelRoutes)
      .values({
        userId: user.id,
        logicalModelId: logicalModel.id,
        channelId: channel.id,
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        priority: 1,
        status: 'active'
      })
      .returning();

    const [token] = await ctx.db
      .insert(apiTokens)
      .values({
        userId: user.id,
        name: 'sdk',
        tokenHash: 'hash',
        logicalModelId: logicalModel.id,
        budgetLimitUsd: '25.00',
        budgetUsedUsd: '0.00',
        status: 'active'
      })
      .returning();

    const [log] = await ctx.db
      .insert(requestLogs)
      .values({
        userId: user.id,
        apiTokenId: token.id,
        endpointType: 'responses',
        logicalModelAlias: 'gpt-4o',
        requestStatus: 'in_progress',
        startedAt: new Date()
      })
      .returning();

    await ctx.db.insert(routeAttempts).values({
      requestLogId: log.id,
      channelId: channel.id,
      routeId: route.id,
      attemptIndex: 1,
      attemptStatus: 'succeeded',
      startedAt: new Date(),
      finishedAt: new Date()
    });

    const rows = await ctx.db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.id, log.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].logicalModelAlias).toBe('gpt-4o');
  });
});
