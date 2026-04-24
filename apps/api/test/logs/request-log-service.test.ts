import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Client } from 'pg';
import * as schema from '../../src/db/schema/index.js';
import { apiTokens, channelRoutes } from '../../src/db/schema/index.js';
import { RequestLogService } from '../../src/modules/gateway/request-log-service.js';
import { seedGatewayToken } from '../helpers/login.js';
import { createTestDb } from '../helpers/test-db.js';

describe('request log service settlement', () => {
  const db = createTestDb();

  beforeAll(async () => {
    await db.start();
  });

  afterAll(async () => {
    await db.stop();
  });

  type ClientWithConnectionParameters = Client & {
    connectionParameters: {
      user?: string;
      password?: string;
      host?: string;
      port?: number;
      database?: string;
    };
  };

  function buildDatabaseUrl() {
    const client = (db.db as unknown as { $client: ClientWithConnectionParameters }).$client;
    const connectionParameters = client.connectionParameters;
    const url = new URL('postgres://localhost');

    url.username = connectionParameters.user ?? 'router';
    url.password = connectionParameters.password ?? 'router';
    url.hostname = connectionParameters.host ?? 'localhost';
    url.port = String(connectionParameters.port ?? 5432);
    url.pathname = `/${connectionParameters.database ?? 'router_test'}`;

    return url.toString();
  }

  async function createDrizzleConnection() {
    const client = new Client({
      connectionString: buildDatabaseUrl()
    });
    await client.connect();

    return {
      client,
      db: drizzle(client, { schema })
    };
  }

  it('serializes concurrent settlement updates so budgetUsedUsd and exhausted status do not lose increments', async () => {
    const token = await seedGatewayToken(db.db, 'https://example.test/v1', {
      alias: 'concurrent-settlement-token'
    });

    await db.db
      .update(apiTokens)
      .set({
        budgetLimitUsd: '0.50',
        budgetUsedUsd: '0.00',
        status: 'active',
        updatedAt: new Date()
      })
      .where(eq(apiTokens.id, token.tokenId));

    const [primaryRoute] = await db.db
      .select()
      .from(channelRoutes)
      .where(eq(channelRoutes.logicalModelId, token.logicalModelId))
      .limit(1);

    expect(primaryRoute).toBeDefined();

    const baseService = new RequestLogService(db.db);
    const firstLog = await baseService.createStartedLog({
      userId: token.userId,
      apiTokenId: token.tokenId,
      endpointType: 'chat_completions',
      logicalModelAlias: token.alias,
      rawRequestSummary: {
        model: token.alias
      }
    });
    const secondLog = await baseService.createStartedLog({
      userId: token.userId,
      apiTokenId: token.tokenId,
      endpointType: 'chat_completions',
      logicalModelAlias: token.alias,
      rawRequestSummary: {
        model: token.alias
      }
    });

    const lockedClient = new Client({
      connectionString: buildDatabaseUrl()
    });
    await lockedClient.connect();
    await lockedClient.query('BEGIN');
    await lockedClient.query('SELECT id FROM api_tokens WHERE id = $1 FOR UPDATE', [token.tokenId]);

    const connectionOne = await createDrizzleConnection();
    const connectionTwo = await createDrizzleConnection();

    try {
      const serviceOne = new RequestLogService(connectionOne.db);
      const serviceTwo = new RequestLogService(connectionTwo.db);

      const firstSettlement = serviceOne.markSuccess({
        requestLogId: firstLog.id,
        apiTokenId: token.tokenId,
        startedAt: firstLog.startedAt,
        statusCode: 200,
        finalChannelId: token.primaryChannelId,
        finalRouteId: primaryRoute.id,
        finalUpstreamModelId: primaryRoute.upstreamModelId ?? token.alias,
        eventSummaryJson: {
          kind: 'chat_completions'
        },
        isUsageSettleable: true,
        rawUsageJson: {
          prompt_tokens: 4,
          completion_tokens: 2,
          total_tokens: 6
        },
        rawUpstreamPriceUsd: null,
        inputTokens: 4,
        outputTokens: 2,
        inputPricePer1m: '50000.0000',
        outputPricePer1m: '100000.0000',
        currency: 'USD'
      });

      const secondSettlement = serviceTwo.markSuccess({
        requestLogId: secondLog.id,
        apiTokenId: token.tokenId,
        startedAt: secondLog.startedAt,
        statusCode: 200,
        finalChannelId: token.primaryChannelId,
        finalRouteId: primaryRoute.id,
        finalUpstreamModelId: primaryRoute.upstreamModelId ?? token.alias,
        eventSummaryJson: {
          kind: 'chat_completions'
        },
        isUsageSettleable: true,
        rawUsageJson: {
          prompt_tokens: 4,
          completion_tokens: 2,
          total_tokens: 6
        },
        rawUpstreamPriceUsd: null,
        inputTokens: 4,
        outputTokens: 2,
        inputPricePer1m: '50000.0000',
        outputPricePer1m: '100000.0000',
        currency: 'USD'
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      await lockedClient.query('COMMIT');
      await Promise.all([firstSettlement, secondSettlement]);

      const [storedToken] = await db.db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.id, token.tokenId))
        .limit(1);

      expect(storedToken).toMatchObject({
        id: token.tokenId,
        budgetUsedUsd: '0.80',
        status: 'exhausted'
      });
    } finally {
      await connectionOne.client.end();
      await connectionTwo.client.end();
      await lockedClient.end();
    }
  });
});
