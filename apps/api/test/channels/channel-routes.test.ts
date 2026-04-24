import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import {
  channelRoutes,
  channels,
  logicalModels
} from '../../src/db/schema/index.js';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { createTestDb } from '../helpers/test-db.js';
import { loginAsAdmin } from '../helpers/login.js';

describe('channel routes', () => {
  const db = createTestDb();
  const upstream = createMockUpstream();
  const upstreamWithBasePath = createMockUpstream({ basePath: '/v1' });
  let userCounter = 0;

  async function createAndLoginUser(app: FastifyInstance, adminCookie: string) {
    userCounter += 1;
    const email = `user-${userCounter}@example.com`;
    const password = `Password${userCounter}!Password${userCounter}!`;

    const createUser = await app.inject({
      method: 'POST',
      url: '/internal/users',
      headers: { cookie: adminCookie },
      payload: {
        email,
        displayName: `User ${userCounter}`,
        password,
        role: 'user'
      }
    });

    expect(createUser.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email,
        password
      }
    });

    expect(login.statusCode).toBe(200);

    const sessionCookie = login.cookies.find((cookie) => cookie.name === 'router_session');

    expect(sessionCookie?.value).toBeTruthy();

    return {
      cookie: `${sessionCookie?.name}=${sessionCookie?.value}`,
      userId: login.json().user.id as string
    };
  }

  beforeAll(async () => {
    await db.start();
    await upstream.start();
    await upstreamWithBasePath.start();
  });

  afterAll(async () => {
    await upstreamWithBasePath.stop();
    await upstream.stop();
    await db.stop();
  });

  it('requires a session to create channels', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        payload: {
          name: 'openai-main',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    } finally {
      await app.close();
    }
  });

  it('creates a user-owned channel, tests it, and stores a logical route with price fields', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'openai-main',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);
      expect(channel.json().channel).toMatchObject({
        name: 'openai-main',
        baseUrl: upstream.baseUrl,
        defaultModelId: 'gpt-4o',
        status: 'active'
      });
      expect(channel.json().channel).not.toHaveProperty('apiKey');
      expect(channel.json().channel).not.toHaveProperty('apiKeyEncrypted');

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.apiKeyEncrypted).not.toBe('sk-test');
      expect(storedChannel.status).toBe('active');

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(200);
      expect(testChannel.json()).toEqual({ ok: true });

      const [testedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(testedChannel.lastTestStatus).toBe('ok');
      expect(testedChannel.lastTestError).toBeNull();
      expect(testedChannel.lastTestedAt).toBeInstanceOf(Date);

      const route = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: adminCookie },
        payload: {
          alias: 'gpt-4o',
          description: 'primary',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '5.0000',
              outputPricePer1m: '15.0000',
              currency: 'USD',
              priority: 1
            }
          ]
        }
      });

      expect(route.statusCode).toBe(201);
      expect(route.json().logicalModel).toMatchObject({
        alias: 'gpt-4o',
        description: 'primary',
        status: 'active'
      });

      const [storedLogicalModel] = await db.db
        .select()
        .from(logicalModels)
        .where(eq(logicalModels.id, route.json().logicalModel.id as string));
      const [storedRoute] = await db.db
        .select()
        .from(channelRoutes)
        .where(eq(channelRoutes.logicalModelId, route.json().logicalModel.id as string));

      expect(storedLogicalModel.status).toBe('active');
      expect(storedRoute).toMatchObject({
        channelId: channel.json().channel.id,
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        priority: 1,
        status: 'active'
      });
    } finally {
      await app.close();
    }
  });

  it('lists owned channels without secrets and logical models with priority-sorted routes', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const { cookie: ownerCookie } = await createAndLoginUser(app, adminCookie);
      const { cookie: otherUserCookie } = await createAndLoginUser(app, adminCookie);

      const primaryChannel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: ownerCookie },
        payload: {
          name: 'alpha-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(primaryChannel.statusCode).toBe(201);

      const fallbackChannel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: ownerCookie },
        payload: {
          name: 'beta-anthropic',
          baseUrl: upstreamWithBasePath.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'claude-3-7-sonnet'
        }
      });

      expect(fallbackChannel.statusCode).toBe(201);

      const foreignChannel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: otherUserCookie },
        payload: {
          name: 'foreign-channel',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-foreign',
          defaultModelId: 'gpt-4o-mini'
        }
      });

      expect(foreignChannel.statusCode).toBe(201);

      const routeCreate = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: ownerCookie },
        payload: {
          alias: 'chat-router',
          description: '主路由',
          routes: [
            {
              channelId: fallbackChannel.json().channel.id as string,
              upstreamModelId: 'claude-3-7-sonnet',
              inputPricePer1m: '6.0000',
              outputPricePer1m: '18.0000',
              currency: 'USD',
              priority: 20
            },
            {
              channelId: primaryChannel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '5.0000',
              outputPricePer1m: '15.0000',
              currency: 'USD',
              priority: 10
            }
          ]
        }
      });

      expect(routeCreate.statusCode).toBe(201);

      const foreignLogicalModel = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: otherUserCookie },
        payload: {
          alias: 'foreign-router',
          description: 'foreign',
          routes: [
            {
              channelId: foreignChannel.json().channel.id as string,
              upstreamModelId: 'gpt-4o-mini',
              inputPricePer1m: '1.0000',
              outputPricePer1m: '2.0000',
              currency: 'USD',
              priority: 1
            }
          ]
        }
      });

      expect(foreignLogicalModel.statusCode).toBe(201);

      const listChannels = await app.inject({
        method: 'GET',
        url: '/internal/channels',
        headers: { cookie: ownerCookie }
      });

      expect(listChannels.statusCode).toBe(200);
      expect(listChannels.json()).toEqual({
        channels: expect.arrayContaining([
          expect.objectContaining({
            id: primaryChannel.json().channel.id,
            name: 'alpha-openai',
            baseUrl: upstream.baseUrl,
            defaultModelId: 'gpt-4o',
            status: 'active',
            lastTestStatus: null,
            lastTestError: null,
            lastTestedAt: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          }),
          expect.objectContaining({
            id: fallbackChannel.json().channel.id,
            name: 'beta-anthropic',
            baseUrl: upstreamWithBasePath.baseUrl,
            defaultModelId: 'claude-3-7-sonnet',
            status: 'active',
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          })
        ])
      });
      expect(listChannels.json().channels).toHaveLength(2);
      expect(JSON.stringify(listChannels.json())).not.toContain('apiKey');
      expect(JSON.stringify(listChannels.json())).not.toContain('apiKeyEncrypted');

      const listLogicalModels = await app.inject({
        method: 'GET',
        url: '/internal/logical-models',
        headers: { cookie: ownerCookie }
      });

      expect(listLogicalModels.statusCode).toBe(200);
      expect(listLogicalModels.json()).toEqual({
        logicalModels: [
          {
            id: routeCreate.json().logicalModel.id as string,
            alias: 'chat-router',
            description: '主路由',
            status: 'active',
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            routes: [
              {
                id: expect.any(String),
                channelId: primaryChannel.json().channel.id,
                upstreamModelId: 'gpt-4o',
                inputPricePer1m: '5.0000',
                outputPricePer1m: '15.0000',
                currency: 'USD',
                priority: 10,
                status: 'active',
                channelName: 'alpha-openai'
              },
              {
                id: expect.any(String),
                channelId: fallbackChannel.json().channel.id,
                upstreamModelId: 'claude-3-7-sonnet',
                inputPricePer1m: '6.0000',
                outputPricePer1m: '18.0000',
                currency: 'USD',
                priority: 20,
                status: 'active',
                channelName: 'beta-anthropic'
              }
            ]
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it('rejects creating a second active logical model with the same alias for the same user', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'duplicate-alias-channel',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const firstLogicalModel = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: adminCookie },
        payload: {
          alias: 'gpt-4o-duplicate-check',
          description: 'primary',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '5.0000',
              outputPricePer1m: '15.0000',
              currency: 'USD',
              priority: 1
            }
          ]
        }
      });

      expect(firstLogicalModel.statusCode).toBe(201);

      const duplicateLogicalModel = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: adminCookie },
        payload: {
          alias: 'gpt-4o-duplicate-check',
          description: 'secondary',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o-mini',
              inputPricePer1m: '1.0000',
              outputPricePer1m: '2.0000',
              currency: 'USD',
              priority: 2
            }
          ]
        }
      });

      expect(duplicateLogicalModel.statusCode).toBe(409);
      expect(duplicateLogicalModel.json()).toEqual({ error: 'Logical model alias already exists' });

      const storedModels = await db.db
        .select()
        .from(logicalModels)
        .where(eq(logicalModels.alias, 'gpt-4o-duplicate-check'));

      expect(storedModels).toHaveLength(1);
      expect(storedModels[0].status).toBe('active');
    } finally {
      await app.close();
    }
  });

  it('allows creating a logical model with an empty description', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'blank-description-channel',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: adminCookie },
        payload: {
          alias: 'blank-description-alias',
          description: '',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '1.0000',
              outputPricePer1m: '2.0000',
              currency: 'USD',
              priority: 1
            }
          ]
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().logicalModel).toMatchObject({
        alias: 'blank-description-alias',
        description: '',
        status: 'active'
      });
    } finally {
      await app.close();
    }
  });

  it('rejects negative route priorities', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'negative-priority-channel',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const route = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: adminCookie },
        payload: {
          alias: 'negative-priority-alias',
          description: 'invalid priority',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '5.0000',
              outputPricePer1m: '15.0000',
              currency: 'USD',
              priority: -1
            }
          ]
        }
      });

      expect(route.statusCode).toBe(400);
      expect(route.json()).toEqual({ error: 'Bad Request' });

      const storedModels = await db.db
        .select()
        .from(logicalModels)
        .where(eq(logicalModels.alias, 'negative-priority-alias'));

      expect(storedModels).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('tests channels successfully when the configured baseUrl has a trailing slash', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'openai-v1',
          baseUrl: `${upstreamWithBasePath.baseUrl}/`,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(200);
      expect(testChannel.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it('rejects unsupported baseUrl schemes during channel creation', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'file-scheme',
          baseUrl: 'file:///tmp/router.sock',
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the upstream rejects the test', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'broken-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-bad',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:401');
      expect(storedChannel.lastTestedAt).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when DNS resolution fails', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelTestLookup: async () => {
        throw new Error('DNS lookup failed');
      }
    });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'unresolved-openai',
          baseUrl: 'https://unresolved.example.test',
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:DNS_LOOKUP');
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the upstream returns a non OpenAI-like 200 body', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'invalid-body-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      upstream.setNextResponseOverride({
        body: { ok: true },
        statusCode: 200
      });

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:INVALID_RESPONSE');
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the upstream redirects', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'redirect-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      upstream.setNextResponseOverride({
        headers: { location: 'http://127.0.0.1/metadata' },
        statusCode: 302
      });

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:REDIRECT');
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the upstream times out', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelTestTimeoutMs: 50
    });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'slow-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      upstream.setNextResponseOverride({
        body: {
          choices: [{ message: { role: 'assistant', content: 'pong' } }]
        },
        delayMs: 250,
        statusCode: 200
      });

      const startedAt = Date.now();
      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });
      const elapsedMs = Date.now() - startedAt;

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });
      expect(elapsedMs).toBeLessThan(200);

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:TIMEOUT');
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the upstream response body is too large', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'large-response-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      upstream.setNextResponseOverride({
        rawBody: JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'x'.repeat(1_200_000)
              }
            }
          ]
        }),
        statusCode: 200
      });

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:RESPONSE_TOO_LARGE');
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the upstream drip-feeds past the total deadline', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelTestTimeoutMs: 100
    });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'drip-feed-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      upstream.setNextResponseOverride({
        chunkDelayMs: 40,
        chunks: [
          '{"choices":[{"message":{"role":"assistant","content":"',
          'still',
          'streaming',
          '"}}]}'
        ],
        headers: { 'content-type': 'application/json' },
        statusCode: 200
      });

      const startedAt = Date.now();
      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });
      const elapsedMs = Date.now() - startedAt;

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });
      expect(elapsedMs).toBeLessThan(250);

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:TIMEOUT');
    } finally {
      await app.close();
    }
  });

  it('returns 502 and stores a failed test result when the stored api key cannot be decrypted', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'corrupt-secret-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      await db.db
        .update(channels)
        .set({ apiKeyEncrypted: 'not-a-valid-ciphertext' })
        .where(eq(channels.id, channel.json().channel.id as string));

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(502);
      expect(testChannel.json()).toEqual({ error: 'Channel test failed' });

      const [storedChannel] = await db.db
        .select()
        .from(channels)
        .where(eq(channels.id, channel.json().channel.id as string));

      expect(storedChannel.lastTestStatus).toBe('failed');
      expect(storedChannel.lastTestError).toBe('CHANNEL_TEST_FAILED:SECRET_DECRYPT');
    } finally {
      await app.close();
    }
  });

  it('rejects private upstream targets in production-like safety mode without sending a request', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      allowPrivateUpstreamBaseUrls: false
    });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const beforeRequestCount = upstream.requestCount;

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'private-target-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(400);
      expect(testChannel.json()).toEqual({ error: 'Bad Request' });
      expect(upstream.requestCount).toBe(beforeRequestCount);
    } finally {
      await app.close();
    }
  });

  it('rejects IPv4-mapped IPv6 private upstream targets without sending a request', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      allowPrivateUpstreamBaseUrls: false,
      channelTestLookup: async () => [{ address: '::ffff:7f00:1', family: 6 }]
    });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const beforeRequestCount = upstream.requestCount;

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'mapped-private-openai',
          baseUrl: 'http://mapped-private.example',
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(400);
      expect(testChannel.json()).toEqual({ error: 'Bad Request' });
      expect(upstream.requestCount).toBe(beforeRequestCount);
    } finally {
      await app.close();
    }
  });

  it('rejects bracketed IPv6 loopback upstream targets without sending a request', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      allowPrivateUpstreamBaseUrls: false
    });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const beforeRequestCount = upstream.requestCount;

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'ipv6-loopback-openai',
          baseUrl: 'http://[::1]:3000',
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(400);
      expect(testChannel.json()).toEqual({ error: 'Bad Request' });
      expect(upstream.requestCount).toBe(beforeRequestCount);
    } finally {
      await app.close();
    }
  });

  it('returns 404 when the channel disappears after a successful upstream test before result persistence', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'ephemeral-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      upstream.setNextRequestHook(async () => {
        await db.db.delete(channels).where(eq(channels.id, channel.json().channel.id as string));
      });

      const testChannel = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: adminCookie }
      });

      expect(testChannel.statusCode).toBe(404);
      expect(testChannel.json()).toEqual({ error: 'Channel not found' });
    } finally {
      await app.close();
    }
  });

  it('does not allow another user to test a foreign channel', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const owner = await createAndLoginUser(app, adminCookie);
      const otherUser = await createAndLoginUser(app, adminCookie);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: owner.cookie },
        payload: {
          name: 'private-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const response = await app.inject({
        method: 'POST',
        url: `/internal/channels/${channel.json().channel.id as string}/test`,
        headers: { cookie: otherUser.cookie }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Channel not found' });
    } finally {
      await app.close();
    }
  });

  it('returns 404 and leaves no logical model behind when a route references a foreign channel', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const owner = await createAndLoginUser(app, adminCookie);
      const otherUser = await createAndLoginUser(app, adminCookie);
      const alias = `foreign-route-${randomUUID()}`;

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: owner.cookie },
        payload: {
          name: 'owner-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const response = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: otherUser.cookie },
        payload: {
          alias,
          description: 'should fail',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '5.0000',
              outputPricePer1m: '15.0000',
              currency: 'USD',
              priority: 1
            }
          ]
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Channel not found' });

      const insertedModels = await db.db
        .select()
        .from(logicalModels)
        .where(eq(logicalModels.alias, alias));

      expect(insertedModels).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects oversized route prices with a 400 before touching the database', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);

      const channel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: { cookie: adminCookie },
        payload: {
          name: 'price-check-openai',
          baseUrl: upstream.baseUrl,
          apiKey: 'sk-test',
          defaultModelId: 'gpt-4o'
        }
      });

      expect(channel.statusCode).toBe(201);

      const alias = `oversized-${randomUUID()}`;
      const response = await app.inject({
        method: 'POST',
        url: '/internal/logical-models',
        headers: { cookie: adminCookie },
        payload: {
          alias,
          description: 'oversized price',
          routes: [
            {
              channelId: channel.json().channel.id as string,
              upstreamModelId: 'gpt-4o',
              inputPricePer1m: '123456789.0000',
              outputPricePer1m: '15.0000',
              currency: 'USD',
              priority: 1
            }
          ]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });

      const insertedModels = await db.db
        .select()
        .from(logicalModels)
        .where(eq(logicalModels.alias, alias));

      expect(insertedModels).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

});
