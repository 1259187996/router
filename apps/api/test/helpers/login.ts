import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../src/db/schema/index.js';
import {
  apiTokens,
  channelRoutes,
  channels,
  logicalModels,
  users
} from '../../src/db/schema/index.js';
import { encryptChannelSecret } from '../../src/modules/channels/secret.js';
import { TokenService } from '../../src/modules/tokens/service.js';
import { TokensRepository } from '../../src/modules/tokens/repository.js';

export const adminEmail = 'admin@example.com';
export const adminPassword = 'Admin123!Admin123!';

type AppWithDb = FastifyInstance & {
  db?: NodePgDatabase<typeof schema>;
};

export async function seedAdminUser(db: NodePgDatabase<typeof schema>) {
  const passwordHash = await argon2.hash(adminPassword);
  const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const [admin] = await db
    .insert(users)
    .values({
      email: adminEmail,
      displayName: 'Administrator',
      passwordHash,
      role: 'admin',
      status: 'active'
    })
    .returning();

  return admin;
}

export async function loginAsAdmin(app: FastifyInstance) {
  const db = (app as AppWithDb).db;

  if (!db) {
    throw new Error('Fastify app is missing db decoration');
  }

  await seedAdminUser(db);

  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: adminEmail,
      password: adminPassword
    }
  });

  const cookie = response.cookies.find((candidate) => candidate.name === 'router_session');

  if (!cookie) {
    throw new Error('Admin login did not set router_session cookie');
  }

  return {
    cookie: `${cookie.name}=${cookie.value}`,
    response
  };
}

let seededLogicalModelCounter = 0;

export async function seedLogicalModel(db: NodePgDatabase<typeof schema>) {
  const admin = await seedAdminUser(db);
  seededLogicalModelCounter += 1;
  const suffix = seededLogicalModelCounter;

  const [channel] = await db
    .insert(channels)
    .values({
      userId: admin.id,
      name: `seed-channel-${suffix}`,
      baseUrl: `https://example-${suffix}.test/v1`,
      apiKeyEncrypted: `encrypted-${suffix}`,
      defaultModelId: `gpt-4o-${suffix}`,
      status: 'active'
    })
    .returning();

  const [logicalModel] = await db
    .insert(logicalModels)
    .values({
      userId: admin.id,
      alias: `seed-model-${suffix}`,
      description: `Seed logical model ${suffix}`,
      status: 'active'
    })
    .returning();

  await db.insert(channelRoutes).values({
    userId: admin.id,
    logicalModelId: logicalModel.id,
    channelId: channel.id,
    upstreamModelId: channel.defaultModelId,
    inputPricePer1m: '1.0000',
    outputPricePer1m: '2.0000',
    currency: 'USD',
    priority: suffix,
    status: 'active'
  });

  return logicalModel.id;
}

let seededGatewayTokenCounter = 0;

export async function seedGatewayToken(
  db: NodePgDatabase<typeof schema>,
  upstreamBaseUrl: string,
  options?: {
    alias?: string;
    channelKeyEncryptionSecret?: string;
    fallbackBaseUrl?: string;
    upstreamModelId?: string | null;
  }
) {
  const admin = await seedAdminUser(db);
  seededGatewayTokenCounter += 1;
  const suffix = seededGatewayTokenCounter;
  const alias = options?.alias ?? `gateway-model-${suffix}`;
  const channelKeyEncryptionSecret =
    options?.channelKeyEncryptionSecret ?? 'test-channel-key-secret';
  let fallbackChannelId: string | null = null;
  let fallbackUpstreamModelId: string | null = null;

  const [primaryChannel] = await db
    .insert(channels)
    .values({
      userId: admin.id,
      name: `gateway-primary-${suffix}`,
      baseUrl: upstreamBaseUrl,
      apiKeyEncrypted: encryptChannelSecret('sk-test', channelKeyEncryptionSecret),
      defaultModelId: `upstream-default-${suffix}`,
      status: 'active'
    })
    .returning();

  const [logicalModel] = await db
    .insert(logicalModels)
    .values({
      userId: admin.id,
      alias,
      description: `Gateway model ${suffix}`,
      status: 'active'
    })
    .returning();

  await db.insert(channelRoutes).values({
    userId: admin.id,
    logicalModelId: logicalModel.id,
    channelId: primaryChannel.id,
    upstreamModelId: options?.upstreamModelId === undefined ? `upstream-model-${suffix}` : options.upstreamModelId,
    inputPricePer1m: '1.0000',
    outputPricePer1m: '2.0000',
    currency: 'USD',
    priority: 1,
    status: 'active'
  });

  if (options?.fallbackBaseUrl) {
    const [fallbackChannel] = await db
      .insert(channels)
      .values({
        userId: admin.id,
        name: `gateway-fallback-${suffix}`,
        baseUrl: options.fallbackBaseUrl,
        apiKeyEncrypted: encryptChannelSecret('sk-test', channelKeyEncryptionSecret),
        defaultModelId: `upstream-fallback-default-${suffix}`,
        status: 'active'
      })
      .returning();
    fallbackChannelId = fallbackChannel.id;
    fallbackUpstreamModelId = `upstream-fallback-model-${suffix}`;

    await db.insert(channelRoutes).values({
      userId: admin.id,
      logicalModelId: logicalModel.id,
      channelId: fallbackChannel.id,
      upstreamModelId: fallbackUpstreamModelId,
      inputPricePer1m: '1.5000',
      outputPricePer1m: '2.5000',
      currency: 'USD',
      priority: 2,
      status: 'active'
    });
  }

  const tokenService = new TokenService(new TokensRepository(db));
  const token = await tokenService.createToken(admin.id, {
    name: `gateway-token-${suffix}`,
    logicalModelId: logicalModel.id,
    budgetLimitUsd: '100.00'
  });

  const [storedToken] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, token.id))
    .limit(1);

  return {
    rawToken: token.rawToken!,
    tokenId: token.id,
    userId: admin.id,
    logicalModelId: logicalModel.id,
    alias,
    storedToken,
    primaryChannelId: primaryChannel.id,
    fallbackChannelId,
    fallbackUpstreamModelId
  };
}
