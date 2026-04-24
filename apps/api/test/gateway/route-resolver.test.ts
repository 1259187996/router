import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { channelRoutes, channels, logicalModels, users } from '../../src/db/schema/index.js';
import { resolveRoutesForAlias } from '../../src/modules/gateway/route-resolver.js';
import { createTestDb } from '../helpers/test-db.js';

describe('route resolver', () => {
  const ctx = createTestDb();

  beforeAll(ctx.start);
  afterAll(ctx.stop);

  it('returns active routes for a user alias ordered by ascending priority', async () => {
    const [owner] = await ctx.db
      .insert(users)
      .values({
        email: 'owner@example.com',
        displayName: 'Owner',
        passwordHash: 'hash',
        role: 'user',
        status: 'active'
      })
      .returning();
    const [otherUser] = await ctx.db
      .insert(users)
      .values({
        email: 'other@example.com',
        displayName: 'Other',
        passwordHash: 'hash',
        role: 'user',
        status: 'active'
      })
      .returning();

    const [primaryChannel] = await ctx.db
      .insert(channels)
      .values({
        userId: owner.id,
        name: 'primary',
        baseUrl: 'https://primary.example.com/v1',
        apiKeyEncrypted: 'encrypted-primary',
        defaultModelId: 'gpt-4o',
        status: 'active'
      })
      .returning();
    const [backupChannel] = await ctx.db
      .insert(channels)
      .values({
        userId: owner.id,
        name: 'backup',
        baseUrl: 'https://backup.example.com/v1',
        apiKeyEncrypted: 'encrypted-backup',
        defaultModelId: 'gpt-4o-mini',
        status: 'active'
      })
      .returning();
    const [disabledChannel] = await ctx.db
      .insert(channels)
      .values({
        userId: owner.id,
        name: 'disabled',
        baseUrl: 'https://disabled.example.com/v1',
        apiKeyEncrypted: 'encrypted-disabled',
        defaultModelId: 'gpt-4o',
        status: 'disabled'
      })
      .returning();
    const [otherUserChannel] = await ctx.db
      .insert(channels)
      .values({
        userId: otherUser.id,
        name: 'other-user',
        baseUrl: 'https://other-user.example.com/v1',
        apiKeyEncrypted: 'encrypted-other',
        defaultModelId: 'gpt-4o',
        status: 'active'
      })
      .returning();

    const [chatAlias] = await ctx.db
      .insert(logicalModels)
      .values({
        userId: owner.id,
        alias: 'gpt-4o',
        description: 'chat alias',
        status: 'active'
      })
      .returning();
    const [disabledAlias] = await ctx.db
      .insert(logicalModels)
      .values({
        userId: owner.id,
        alias: 'gpt-4o-disabled',
        description: 'disabled alias',
        status: 'disabled'
      })
      .returning();
    const [otherUserAlias] = await ctx.db
      .insert(logicalModels)
      .values({
        userId: otherUser.id,
        alias: 'gpt-4o',
        description: 'other user alias',
        status: 'active'
      })
      .returning();

    await ctx.db.insert(channelRoutes).values([
      {
        userId: owner.id,
        logicalModelId: chatAlias.id,
        channelId: backupChannel.id,
        upstreamModelId: 'gpt-4o-mini',
        inputPricePer1m: '2.0000',
        outputPricePer1m: '8.0000',
        currency: 'USD',
        priority: 20,
        status: 'active'
      },
      {
        userId: owner.id,
        logicalModelId: chatAlias.id,
        channelId: primaryChannel.id,
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        priority: 10,
        status: 'active'
      },
      {
        userId: owner.id,
        logicalModelId: chatAlias.id,
        channelId: disabledChannel.id,
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '6.0000',
        outputPricePer1m: '18.0000',
        currency: 'USD',
        priority: 5,
        status: 'active'
      },
      {
        userId: owner.id,
        logicalModelId: chatAlias.id,
        channelId: primaryChannel.id,
        upstreamModelId: 'gpt-4o-archived',
        inputPricePer1m: '4.0000',
        outputPricePer1m: '12.0000',
        currency: 'USD',
        priority: 1,
        status: 'disabled'
      },
      {
        userId: owner.id,
        logicalModelId: disabledAlias.id,
        channelId: primaryChannel.id,
        upstreamModelId: 'gpt-4o-disabled',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        priority: 1,
        status: 'active'
      },
      {
        userId: otherUser.id,
        logicalModelId: otherUserAlias.id,
        channelId: otherUserChannel.id,
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        priority: 1,
        status: 'active'
      }
    ]);

    const routes = await resolveRoutesForAlias(ctx.db, {
      userId: owner.id,
      alias: 'gpt-4o'
    });

    expect(routes).toHaveLength(2);
    expect(routes.map((route) => route.priority)).toEqual([10, 20]);
    expect(routes).toMatchObject([
      {
        channelId: primaryChannel.id,
        baseUrl: 'https://primary.example.com/v1',
        apiKeyEncrypted: 'encrypted-primary',
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        priority: 10
      },
      {
        channelId: backupChannel.id,
        baseUrl: 'https://backup.example.com/v1',
        apiKeyEncrypted: 'encrypted-backup',
        upstreamModelId: 'gpt-4o-mini',
        inputPricePer1m: '2.0000',
        outputPricePer1m: '8.0000',
        currency: 'USD',
        priority: 20
      }
    ]);
  });

  it('rejects inserting a second active logical model for the same user alias', async () => {
    const [owner] = await ctx.db
      .insert(users)
      .values({
        email: 'duplicate-owner@example.com',
        displayName: 'Duplicate Owner',
        passwordHash: 'hash',
        role: 'user',
        status: 'active'
      })
      .returning();

    await ctx.db.insert(logicalModels).values({
      userId: owner.id,
      alias: 'gpt-4o',
      description: 'primary alias',
      status: 'active'
    });

    await expect(
      ctx.db.insert(logicalModels).values({
        userId: owner.id,
        alias: 'gpt-4o',
        description: 'duplicate alias',
        status: 'active'
      })
    ).rejects.toThrow();

    const storedAliases = await ctx.db
      .select()
      .from(logicalModels)
      .where(eq(logicalModels.userId, owner.id));

    expect(storedAliases).toHaveLength(1);
    expect(storedAliases[0]).toMatchObject({
      alias: 'gpt-4o',
      status: 'active'
    });
  });

  it('rejects inserting channel routes with negative priority at the database layer', async () => {
    const [owner] = await ctx.db
      .insert(users)
      .values({
        email: 'negative-priority-owner@example.com',
        displayName: 'Negative Priority Owner',
        passwordHash: 'hash',
        role: 'user',
        status: 'active'
      })
      .returning();

    const [channel] = await ctx.db
      .insert(channels)
      .values({
        userId: owner.id,
        name: 'negative-priority-channel',
        baseUrl: 'https://negative-priority.example.com/v1',
        apiKeyEncrypted: 'encrypted-negative',
        defaultModelId: 'gpt-4o',
        status: 'active'
      })
      .returning();

    const [logicalModel] = await ctx.db
      .insert(logicalModels)
      .values({
        userId: owner.id,
        alias: 'negative-priority-alias',
        description: 'priority check alias',
        status: 'active'
      })
      .returning();

    await expect(
      ctx.db.insert(channelRoutes).values({
        userId: owner.id,
        logicalModelId: logicalModel.id,
        channelId: channel.id,
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '1.0000',
        outputPricePer1m: '2.0000',
        currency: 'USD',
        priority: -1,
        status: 'active'
      })
    ).rejects.toThrow();

    const storedRoutes = await ctx.db
      .select()
      .from(channelRoutes)
      .where(eq(channelRoutes.logicalModelId, logicalModel.id));

    expect(storedRoutes).toHaveLength(0);
  });
});
