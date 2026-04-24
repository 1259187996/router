import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import {
  channelRoutes,
  channels,
  requestLogs
} from '../../src/db/schema/index.js';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { seedGatewayToken } from '../helpers/login.js';
import { createTestDb } from '../helpers/test-db.js';

const channelKeyEncryptionSecret = 'test-channel-key-secret';

describe('gateway chat and embeddings routes', () => {
  const db = createTestDb();
  const primaryUpstream = createMockUpstream({ basePath: '/v1' });
  const fallbackUpstream = createMockUpstream({ basePath: '/v1' });

  beforeAll(async () => {
    await db.start();
    await primaryUpstream.start();
    await fallbackUpstream.start();
  });

  afterAll(async () => {
    await fallbackUpstream.stop();
    await primaryUpstream.stop();
    await db.stop();
  });

  async function listLogsForToken(tokenId: string) {
    return db.db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.apiTokenId, tokenId))
      .orderBy(desc(requestLogs.startedAt));
  }

  async function latestLogForToken(tokenId: string) {
    const [log] = await listLogsForToken(tokenId);
    return log ?? null;
  }

  it('rejects missing bearer auth with 401 and does not create a request log', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: {
          model: 'missing-auth-model',
          messages: [{ role: 'user', content: 'hello' }]
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
      expect(primaryUpstream.requestCount).toBe(0);

      const logs = await db.db.select().from(requestLogs);
      expect(logs).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('proxies POST /v1/chat/completions and creates an in-progress request log before upstream handling', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'chat-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-upstream'
      });

      let logSeenDuringUpstream:
        | {
            apiTokenId: string | null;
            endpointType: string;
            logicalModelAlias: string;
            requestStatus: string;
          }
        | null = null;

      primaryUpstream.setNextRequestHook(async () => {
        const [log] = await db.db
          .select({
            apiTokenId: requestLogs.apiTokenId,
            endpointType: requestLogs.endpointType,
            logicalModelAlias: requestLogs.logicalModelAlias,
            requestStatus: requestLogs.requestStatus
          })
          .from(requestLogs)
          .where(eq(requestLogs.apiTokenId, token.tokenId))
          .orderBy(desc(requestLogs.startedAt))
          .limit(1);

        logSeenDuringUpstream = log ?? null;
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        model: 'gpt-4.1-upstream',
        choices: [
          {
            message: {
              content: 'echo:hello'
            }
          }
        ]
      });

      expect(logSeenDuringUpstream).toMatchObject({
        apiTokenId: token.tokenId,
        endpointType: 'chat_completions',
        logicalModelAlias: token.alias,
        requestStatus: 'in_progress'
      });

      const [storedLog] = await db.db
        .select()
        .from(requestLogs)
        .where(eq(requestLogs.apiTokenId, token.tokenId))
        .orderBy(desc(requestLogs.startedAt))
        .limit(1);

      expect(storedLog).toMatchObject({
        userId: token.userId,
        apiTokenId: token.tokenId,
        endpointType: 'chat_completions',
        logicalModelAlias: token.alias,
        requestStatus: 'success',
        httpStatusCode: 200,
        finalUpstreamModelId: 'gpt-4.1-upstream'
      });
      expect(storedLog.finalChannelId).toBeTruthy();
      expect(storedLog.finalRouteId).toBeTruthy();
      expect(storedLog.startedAt).toBeInstanceOf(Date);
      expect(storedLog.finishedAt).toBeInstanceOf(Date);
      expect(storedLog.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      await app.close();
    }
  });

  it('stores a compact chat request summary without raw prompt text', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'chat-summary-alias',
        channelKeyEncryptionSecret
      });
      const systemPrompt = 'system prompt that must not reach request logs';
      const userPrompt = 'user prompt that must not reach request logs';

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }
      });

      expect(response.statusCode).toBe(200);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog?.rawRequestSummary).toEqual({
        model: token.alias,
        stream: false,
        messageCount: 2,
        messageRoles: ['system', 'user']
      });
      expect(JSON.stringify(storedLog?.rawRequestSummary)).not.toContain(systemPrompt);
      expect(JSON.stringify(storedLog?.rawRequestSummary)).not.toContain(userPrompt);
    } finally {
      await app.close();
    }
  });

  it('fails over to the backup route when the first upstream request fails before sending a body', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'failover-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl,
        upstreamModelId: 'gpt-primary-upstream'
      });

      primaryUpstream.failBeforeBody();

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'fallback' }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        model: token.fallbackUpstreamModelId,
        choices: [
          {
            message: {
              content: 'echo:fallback'
            }
          }
        ]
      });
      expect(primaryUpstream.requestCount).toBeGreaterThanOrEqual(1);
      expect(fallbackUpstream.requestCount).toBeGreaterThanOrEqual(1);

      const [storedLog] = await db.db
        .select()
        .from(requestLogs)
        .where(eq(requestLogs.apiTokenId, token.tokenId))
        .orderBy(desc(requestLogs.startedAt))
        .limit(1);

      expect(storedLog).toMatchObject({
        requestStatus: 'success',
        finalUpstreamModelId: token.fallbackUpstreamModelId,
        httpStatusCode: 200
      });
    } finally {
      await app.close();
    }
  });

  it('rejects stream=true chat requests with 400 before upstream and before request logging', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'stream-rejected-alias',
        channelKeyEncryptionSecret
      });
      const primaryRequestCountBefore = primaryUpstream.requestCount;

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'hello stream' }],
          stream: true
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });
      expect(primaryUpstream.requestCount).toBe(primaryRequestCountBefore);
      expect(await listLogsForToken(token.tokenId)).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects chat requests with tools and tool_choice with 400 before upstream and before request logging', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'tools-rejected-alias',
        channelKeyEncryptionSecret
      });
      const primaryRequestCountBefore = primaryUpstream.requestCount;

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'hello tools' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'lookup_weather',
                description: 'Lookup weather data'
              }
            }
          ],
          tool_choice: 'auto'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });
      expect(primaryUpstream.requestCount).toBe(primaryRequestCountBefore);
      expect(await listLogsForToken(token.tokenId)).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects chat requests with legacy functions and function_call with 400 before upstream and before request logging', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'functions-rejected-alias',
        channelKeyEncryptionSecret
      });
      const primaryRequestCountBefore = primaryUpstream.requestCount;

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'hello functions' }],
          functions: [
            {
              name: 'lookup_weather',
              description: 'Lookup weather data'
            }
          ],
          function_call: 'auto'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });
      expect(primaryUpstream.requestCount).toBe(primaryRequestCountBefore);
      expect(await listLogsForToken(token.tokenId)).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects a token requesting a different alias owned by the same user and does not call upstream', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const tokenA = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'scope-alias-a',
        channelKeyEncryptionSecret
      });
      const tokenB = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'scope-alias-b',
        channelKeyEncryptionSecret
      });
      const primaryRequestCountBefore = primaryUpstream.requestCount;

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`
        },
        payload: {
          model: tokenB.alias,
          messages: [{ role: 'user', content: 'cross-alias' }]
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          message: 'Model route not found'
        }
      });
      expect(primaryUpstream.requestCount).toBe(primaryRequestCountBefore);
      expect(await listLogsForToken(tokenA.tokenId)).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('proxies POST /v1/embeddings and returns embedding data', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'embedding-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: null
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/embeddings',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          input: 'hello embeddings'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        model: token.alias,
        data: [
          {
            embedding: [0.1, 0.2, 0.3]
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it('stores a compact embeddings request summary without raw input batches', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'embedding-summary-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: null
      });
      const embeddingInputs = [
        'private embedding input that must not reach request logs',
        'another private embedding input that must not reach request logs'
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/v1/embeddings',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          input: embeddingInputs
        }
      });

      expect(response.statusCode).toBe(200);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog?.rawRequestSummary).toEqual({
        model: token.alias,
        inputType: 'string_array',
        inputCount: 2
      });
      expect(JSON.stringify(storedLog?.rawRequestSummary)).not.toContain(embeddingInputs[0]);
      expect(JSON.stringify(storedLog?.rawRequestSummary)).not.toContain(embeddingInputs[1]);
    } finally {
      await app.close();
    }
  });

  it('returns 404 for a token-bound alias with no active route and finalizes the log', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'missing-route-alias',
        channelKeyEncryptionSecret
      });

      await db.db
        .update(channelRoutes)
        .set({ status: 'disabled' })
        .where(eq(channelRoutes.logicalModelId, token.logicalModelId));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          message: 'Model route not found'
        }
      });

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'upstream_error',
        httpStatusCode: 404,
        logicalModelAlias: token.alias
      });
      expect(storedLog?.finishedAt).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
  });

  it('passes through a non-2xx JSON upstream response without failover and records the terminal log', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret,
      gatewayUpstreamTimeoutMs: 50
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'non-2xx-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const primaryRequestCountBefore = primaryUpstream.requestCount;
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        statusCode: 429,
        body: {
          error: {
            message: 'Rate limited'
          }
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'no-failover' }]
        }
      });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({
        error: {
          message: 'Rate limited'
        }
      });
      expect(primaryUpstream.requestCount).toBe(primaryRequestCountBefore + 1);
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore);

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'success',
        httpStatusCode: 429
      });
    } finally {
      await app.close();
    }
  });

  it('fails over when the first upstream request times out before sending a body', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret,
      gatewayUpstreamTimeoutMs: 20
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'timeout-failover-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const primaryRequestCountBefore = primaryUpstream.requestCount;
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        delayMs: 100
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'timeout fallback' }]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        choices: [
          {
            message: {
              content: 'echo:timeout fallback'
            }
          }
        ]
      });
      expect(primaryUpstream.requestCount).toBe(primaryRequestCountBefore + 1);
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore + 1);

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'success',
        httpStatusCode: 200
      });
    } finally {
      await app.close();
    }
  });

  it('finalizes the request log when a post-log secret decrypt error occurs', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'decrypt-error-alias',
        channelKeyEncryptionSecret
      });

      await db.db
        .update(channels)
        .set({ apiKeyEncrypted: 'invalid-encrypted-secret' })
        .where(eq(channels.id, token.primaryChannelId));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'boom' }]
        }
      });

      expect(response.statusCode).toBe(500);

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'upstream_error',
        httpStatusCode: 500
      });
      expect(storedLog?.finishedAt).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
  });

  it('returns 502 when upstream returns invalid JSON and finalizes the log as upstream_error', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret,
      gatewayUpstreamTimeoutMs: 50
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'invalid-json-alias',
        channelKeyEncryptionSecret
      });

      primaryUpstream.setNextResponseOverride({
        statusCode: 200,
        headers: {
          'content-type': 'application/json'
        },
        rawBody: 'not-json'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'bad json' }]
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          message: 'Upstream request failed',
          type: 'bad_gateway'
        }
      });

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'upstream_error',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });
});
