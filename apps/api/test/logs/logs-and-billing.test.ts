import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app.js';
import { priceSnapshots } from '../../src/db/schema/index.js';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { loginAsAdmin } from '../helpers/login.js';
import { createTestDb } from '../helpers/test-db.js';

const channelKeyEncryptionSecret = 'test-channel-key-secret';

type SessionContext = {
  cookie: string;
  email: string;
};

type GatewayTokenContext = {
  alias: string;
  rawToken: string;
  tokenId: string;
};

describe('logs and billing', () => {
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

  async function createStartedApp(options?: { gatewayUpstreamTimeoutMs?: number }) {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret,
      gatewayUpstreamTimeoutMs: options?.gatewayUpstreamTimeoutMs
    });
    const baseUrl = await app.listen({
      host: '127.0.0.1',
      port: 0
    });

    return {
      app,
      baseUrl
    };
  }

  function getSessionCookie(response: LightMyRequestResponse) {
    const cookie = response.cookies.find((candidate) => candidate.name === 'router_session');

    if (!cookie) {
      throw new Error('router_session cookie is missing');
    }

    return `${cookie.name}=${cookie.value}`;
  }

  async function loginUser(app: FastifyInstance, email: string, password: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email,
        password
      }
    });

    expect(response.statusCode).toBe(200);

    return getSessionCookie(response);
  }

  async function createUserSession(app: FastifyInstance, input: {
    email: string;
    displayName: string;
    password: string;
  }) {
    const { cookie: adminCookie } = await loginAsAdmin(app);
    const createUser = await app.inject({
      method: 'POST',
      url: '/internal/users',
      headers: {
        cookie: adminCookie
      },
      payload: {
        email: input.email,
        displayName: input.displayName,
        password: input.password,
        role: 'user'
      }
    });

    expect(createUser.statusCode).toBe(201);

    return {
      cookie: await loginUser(app, input.email, input.password),
      email: input.email
    };
  }

  async function createGatewayToken(app: FastifyInstance, input: {
    session: SessionContext;
    alias: string;
    upstreamBaseUrl: string;
    upstreamModelId?: string;
    fallbackBaseUrl?: string;
    fallbackUpstreamModelId?: string;
    budgetLimitUsd?: string;
    primaryPrices?: {
      inputPricePer1m: string;
      outputPricePer1m: string;
    };
    fallbackPrices?: {
      inputPricePer1m: string;
      outputPricePer1m: string;
    };
  }) {
    const primaryChannel = await app.inject({
      method: 'POST',
      url: '/internal/channels',
      headers: {
        cookie: input.session.cookie
      },
      payload: {
        name: `${input.alias}-primary`,
        baseUrl: input.upstreamBaseUrl,
        apiKey: 'sk-test',
        defaultModelId: input.upstreamModelId ?? `${input.alias}-primary-default`
      }
    });

    expect(primaryChannel.statusCode).toBe(201);

    let fallbackChannelId: string | null = null;

    if (input.fallbackBaseUrl) {
      const fallbackChannel = await app.inject({
        method: 'POST',
        url: '/internal/channels',
        headers: {
          cookie: input.session.cookie
        },
        payload: {
          name: `${input.alias}-fallback`,
          baseUrl: input.fallbackBaseUrl,
          apiKey: 'sk-test',
          defaultModelId: input.fallbackUpstreamModelId ?? `${input.alias}-fallback-default`
        }
      });

      expect(fallbackChannel.statusCode).toBe(201);
      fallbackChannelId = fallbackChannel.json().channel.id as string;
    }

    const createLogicalModel = await app.inject({
      method: 'POST',
      url: '/internal/logical-models',
      headers: {
        cookie: input.session.cookie
      },
      payload: {
        alias: input.alias,
        description: `logical model for ${input.alias}`,
        routes: [
          {
            channelId: primaryChannel.json().channel.id as string,
            upstreamModelId: input.upstreamModelId ?? `${input.alias}-primary-upstream`,
            inputPricePer1m: input.primaryPrices?.inputPricePer1m ?? '50000.0000',
            outputPricePer1m: input.primaryPrices?.outputPricePer1m ?? '100000.0000',
            currency: 'USD',
            priority: 1
          },
          ...(fallbackChannelId
            ? [
                {
                  channelId: fallbackChannelId,
                  upstreamModelId:
                    input.fallbackUpstreamModelId ?? `${input.alias}-fallback-upstream`,
                  inputPricePer1m: input.fallbackPrices?.inputPricePer1m ?? '75000.0000',
                  outputPricePer1m: input.fallbackPrices?.outputPricePer1m ?? '150000.0000',
                  currency: 'USD',
                  priority: 2
                }
              ]
            : [])
        ]
      }
    });

    expect(createLogicalModel.statusCode).toBe(201);

    const createToken = await app.inject({
      method: 'POST',
      url: '/internal/tokens',
      headers: {
        cookie: input.session.cookie
      },
      payload: {
        name: `${input.alias}-token`,
        logicalModelId: createLogicalModel.json().logicalModel.id as string,
        budgetLimitUsd: input.budgetLimitUsd ?? '10.00'
      }
    });

    expect(createToken.statusCode).toBe(201);

    return {
      alias: input.alias,
      rawToken: createToken.json().token.rawToken as string,
      tokenId: createToken.json().token.id as string
    };
  }

  async function listLogs(app: FastifyInstance, session: SessionContext) {
    const response = await app.inject({
      method: 'GET',
      url: '/internal/logs',
      headers: {
        cookie: session.cookie
      }
    });

    expect(response.statusCode).toBe(200);
    return response.json().logs as Array<Record<string, unknown>>;
  }

  async function getLogDetail(app: FastifyInstance, session: SessionContext, logId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/internal/logs/${logId}`,
      headers: {
        cookie: session.cookie
      }
    });

    return response;
  }

  async function getLogByAlias(app: FastifyInstance, session: SessionContext, alias: string) {
    const logs = await listLogs(app, session);
    const log = logs.find((candidate) => candidate.logicalModelAlias === alias);

    expect(log).toBeDefined();

    return log as Record<string, unknown>;
  }

  async function listTokens(app: FastifyInstance, session: SessionContext) {
    const response = await app.inject({
      method: 'GET',
      url: '/internal/tokens',
      headers: {
        cookie: session.cookie
      }
    });

    expect(response.statusCode).toBe(200);
    return response.json().tokens as Array<Record<string, unknown>>;
  }

  async function readStreamText(response: Response) {
    if (!response.body) {
      throw new Error('Response body is missing');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let output = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        output += decoder.decode();
        break;
      }

      output += decoder.decode(value, { stream: true });
    }

    return output;
  }

  it('records settlement, route attempts, and chat event summary in log detail after failover success', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-failover-chat',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-primary-logs',
        fallbackBaseUrl: fallbackUpstream.baseUrl,
        fallbackUpstreamModelId: 'gpt-fallback-logs',
        primaryPrices: {
          inputPricePer1m: '10000.0000',
          outputPricePer1m: '20000.0000'
        },
        fallbackPrices: {
          inputPricePer1m: '50000.0000',
          outputPricePer1m: '100000.0000'
        }
      });

      primaryUpstream.failBeforeBody();

      const gatewayResponse = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'hello failover' }]
        }
      });

      expect(gatewayResponse.statusCode).toBe(200);

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'success',
          finalUpstreamModelId: 'gpt-fallback-logs',
          rawUpstreamPriceUsd: null,
          settlementPriceUsd: '0.4000',
          inputTokens: 4,
          outputTokens: 2,
          eventSummaryJson: {
            kind: 'chat_completions',
            usageReported: true,
            finishReason: 'stop'
          }
        },
        attempts: [
          {
            attemptIndex: 1,
            attemptStatus: 'failed'
          },
          {
            attemptIndex: 2,
            attemptStatus: 'succeeded'
          }
        ],
        finalChannel: {
          name: 'logs-failover-chat-fallback'
        },
        finalRoute: {
          upstreamModelId: 'gpt-fallback-logs',
          inputPricePer1m: '50000.0000',
          outputPricePer1m: '100000.0000'
        }
      });

      expect(detail.json().attempts[0].channel.name).toBe('logs-failover-chat-primary');
      expect(detail.json().attempts[0].route.upstreamModelId).toBe('gpt-primary-logs');
      expect(detail.json().attempts[1].channel.name).toBe('logs-failover-chat-fallback');
      expect(detail.json().attempts[1].route.upstreamModelId).toBe('gpt-fallback-logs');

      const tokens = await listTokens(app, adminSession);
      const storedToken = tokens.find((candidate) => candidate.id === token.tokenId);

      expect(storedToken).toMatchObject({
        id: token.tokenId,
        budgetUsedUsd: '0.40',
        budgetStatus: 'available'
      });
    } finally {
      await app.close();
    }
  });

  it('stores local_table price snapshots and preserves raw upstream price when upstream returns it', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-upstream-price',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-upstream-price'
      });

      primaryUpstream.setNextResponseOverride({
        body: {
          id: 'chatcmpl-upstream-price',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-upstream-price',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'priced response'
              }
            }
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
            total_tokens: 6,
            total_cost_usd: '1.2345'
          }
        }
      });

      const gatewayResponse = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'show price' }]
        }
      });

      expect(gatewayResponse.statusCode).toBe(200);

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'success',
          rawUpstreamPriceUsd: '1.2345'
        }
      });

      const storedSnapshots = await db.db.select().from(priceSnapshots);
      const snapshot = storedSnapshots.find(
        (candidate) => candidate.requestLogId === (log.id as string)
      );

      expect(snapshot).toMatchObject({
        requestLogId: log.id as string,
        pricingSource: 'local_table'
      });
    } finally {
      await app.close();
    }
  });

  it('stores explainable responses stream event summaries in log detail', async () => {
    const { app, baseUrl } = await createStartedApp();

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-responses-stream',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-responses-logs'
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.in_progress\ndata: {"type":"response.in_progress","response":{"id":"resp_logs_1"}}\n\n',
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hel"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_logs_1"},"usage":{"input_tokens":7,"output_tokens":2,"total_tokens":9}}\n\n',
          'data: [DONE]\n\n'
        ]
      });

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'hello',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('response.completed');
      expect(streamText).toContain('data: [DONE]');

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'success',
          settlementPriceUsd: '0.5500',
          eventSummaryJson: {
            kind: 'responses_stream',
            responseId: 'resp_logs_1',
            sawDone: true,
            usageReported: true,
            eventTypes: [
              'response.in_progress',
              'response.output_text.delta',
              'response.completed'
            ]
          }
        },
        attempts: [
          {
            attemptIndex: 1,
            attemptStatus: 'succeeded'
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it('preserves raw upstream price when responses stream requests receive a JSON upstream body', async () => {
    const { app, baseUrl } = await createStartedApp();

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-responses-stream-json-price',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-responses-stream-json-price'
      });

      primaryUpstream.setNextResponseOverride({
        body: {
          id: 'resp_stream_json_price_1',
          object: 'response',
          status: 'completed',
          model: 'gpt-responses-stream-json-price',
          output: [
            {
              type: 'message',
              id: 'msg_stream_json_price_1',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'json response from stream request'
                }
              ]
            }
          ],
          usage: {
            input_tokens: 7,
            output_tokens: 2,
            total_tokens: 9,
            cost_usd: '0.8765'
          }
        }
      });

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'json fallback body',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: 'resp_stream_json_price_1',
        model: 'gpt-responses-stream-json-price'
      });

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'success',
          rawUpstreamPriceUsd: '0.8765'
        }
      });
    } finally {
      await app.close();
    }
  });

  it('records protocol_parse failure stage when a responses stream becomes malformed after downstream bytes start', async () => {
    const { app, baseUrl } = await createStartedApp();

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-protocol-parse',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-protocol-parse'
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"safe"}\n\n',
          'event: response.output_text.delta\ndata: {not json}\n\n',
          'data: [DONE]\n\n'
        ],
        chunkDelayMs: 25
      });

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'break protocol',
          stream: true
        })
      });

      expect(response.status).toBe(200);

      const streamText = await readStreamText(response);
      expect(streamText).toContain('response.error');

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'stream_failed'
        },
        attempts: [
          {
            attemptIndex: 1,
            attemptStatus: 'failed',
            failureStage: 'protocol_parse'
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it('marks successful requests without usage as review_required and leaves budget usage unchanged', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-review-required',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-review-required'
      });

      primaryUpstream.setNextResponseOverride({
        body: {
          id: 'chatcmpl-review-required',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-review-required',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'missing usage'
              }
            }
          ]
        }
      });

      const gatewayResponse = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'missing usage' }]
        }
      });

      expect(gatewayResponse.statusCode).toBe(200);

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'review_required',
          rawUsageJson: null,
          settlementPriceUsd: null,
          eventSummaryJson: {
            kind: 'chat_completions',
            usageReported: false
          }
        },
        attempts: [
          {
            attemptStatus: 'succeeded'
          }
        ]
      });

      const tokens = await listTokens(app, adminSession);
      const storedToken = tokens.find((candidate) => candidate.id === token.tokenId);

      expect(storedToken).toMatchObject({
        id: token.tokenId,
        budgetUsedUsd: '0.00',
        budgetStatus: 'available'
      });
    } finally {
      await app.close();
    }
  });

  it('marks chat completions with incomplete usage payload as review_required while preserving rawUsageJson', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-chat-incomplete-usage',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-chat-incomplete-usage'
      });

      primaryUpstream.setNextResponseOverride({
        body: {
          id: 'chatcmpl-incomplete-usage',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-chat-incomplete-usage',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'incomplete usage'
              }
            }
          ],
          usage: {
            total_tokens: 9
          }
        }
      });

      const gatewayResponse = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'chat incomplete usage' }]
        }
      });

      expect(gatewayResponse.statusCode).toBe(200);

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'review_required',
          rawUsageJson: {
            total_tokens: 9
          },
          settlementPriceUsd: null,
          inputTokens: null,
          outputTokens: null
        }
      });

      const tokens = await listTokens(app, adminSession);
      const storedToken = tokens.find((candidate) => candidate.id === token.tokenId);

      expect(storedToken).toMatchObject({
        id: token.tokenId,
        budgetUsedUsd: '0.00',
        budgetStatus: 'available'
      });
    } finally {
      await app.close();
    }
  });

  it('marks responses requests with incomplete usage payload as review_required while preserving rawUsageJson', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-responses-incomplete-usage',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-responses-incomplete-usage'
      });

      primaryUpstream.setNextResponseOverride({
        body: {
          id: 'resp_incomplete_usage_1',
          object: 'response',
          status: 'completed',
          model: 'gpt-responses-incomplete-usage',
          output: [
            {
              type: 'message',
              id: 'msg_incomplete_usage_1',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'responses incomplete usage'
                }
              ]
            }
          ],
          usage: {
            total_tokens: 16
          }
        }
      });

      const gatewayResponse = await app.inject({
        method: 'POST',
        url: '/v1/responses',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          input: 'responses incomplete usage'
        }
      });

      expect(gatewayResponse.statusCode).toBe(200);

      const log = await getLogByAlias(app, adminSession, token.alias);
      const detail = await getLogDetail(app, adminSession, log.id as string);

      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        log: {
          logicalModelAlias: token.alias,
          requestStatus: 'review_required',
          rawUsageJson: {
            total_tokens: 16
          },
          settlementPriceUsd: null,
          inputTokens: null,
          outputTokens: null
        }
      });

      const tokens = await listTokens(app, adminSession);
      const storedToken = tokens.find((candidate) => candidate.id === token.tokenId);

      expect(storedToken).toMatchObject({
        id: token.tokenId,
        budgetUsedUsd: '0.00',
        budgetStatus: 'available'
      });
    } finally {
      await app.close();
    }
  });

  it('marks tokens exhausted after settlement exceeds budget and blocks later gateway use', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const adminSession = {
        ...(await loginAsAdmin(app)),
        email: 'admin@example.com'
      };
      const token = await createGatewayToken(app, {
        session: adminSession,
        alias: 'logs-budget-exhausted',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-budget-exhausted',
        budgetLimitUsd: '0.10'
      });

      const firstResponse = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'spend budget' }]
        }
      });

      expect(firstResponse.statusCode).toBe(200);

      const tokens = await listTokens(app, adminSession);
      const storedToken = tokens.find((candidate) => candidate.id === token.tokenId);

      expect(storedToken).toMatchObject({
        id: token.tokenId,
        budgetUsedUsd: '0.40',
        budgetStatus: 'exhausted',
        status: 'exhausted'
      });

      const rejectedResponse = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          messages: [{ role: 'user', content: 'blocked' }]
        }
      });

      expect(rejectedResponse.statusCode).toBe(401);
      expect(rejectedResponse.json()).toEqual({ error: 'Unauthorized' });
    } finally {
      await app.close();
    }
  });

  it('isolates logs list and detail by the current session user', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const userOne = await createUserSession(app, {
        email: 'logs-user-one@example.com',
        displayName: 'Logs User One',
        password: 'LogsUserOne123!'
      });
      const userTwo = await createUserSession(app, {
        email: 'logs-user-two@example.com',
        displayName: 'Logs User Two',
        password: 'LogsUserTwo123!'
      });

      const tokenOne = await createGatewayToken(app, {
        session: userOne,
        alias: 'logs-user-one-model',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-user-one'
      });
      const tokenTwo = await createGatewayToken(app, {
        session: userTwo,
        alias: 'logs-user-two-model',
        upstreamBaseUrl: primaryUpstream.baseUrl,
        upstreamModelId: 'gpt-user-two'
      });

      const userOneGateway = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${tokenOne.rawToken}`
        },
        payload: {
          model: tokenOne.alias,
          messages: [{ role: 'user', content: 'user one' }]
        }
      });
      const userTwoGateway = await app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: `Bearer ${tokenTwo.rawToken}`
        },
        payload: {
          model: tokenTwo.alias,
          messages: [{ role: 'user', content: 'user two' }]
        }
      });

      expect(userOneGateway.statusCode).toBe(200);
      expect(userTwoGateway.statusCode).toBe(200);

      const userOneLogs = await listLogs(app, userOne);
      const userTwoLogs = await listLogs(app, userTwo);

      expect(userOneLogs.map((log) => log.logicalModelAlias)).toContain('logs-user-one-model');
      expect(userOneLogs.map((log) => log.logicalModelAlias)).not.toContain('logs-user-two-model');
      expect(userTwoLogs.map((log) => log.logicalModelAlias)).toContain('logs-user-two-model');
      expect(userTwoLogs.map((log) => log.logicalModelAlias)).not.toContain('logs-user-one-model');

      const userOneLog = userOneLogs.find(
        (candidate) => candidate.logicalModelAlias === 'logs-user-one-model'
      );
      const userTwoLog = userTwoLogs.find(
        (candidate) => candidate.logicalModelAlias === 'logs-user-two-model'
      );

      expect(userOneLog).toBeDefined();
      expect(userTwoLog).toBeDefined();

      const ownDetail = await getLogDetail(app, userOne, userOneLog!.id as string);
      const otherDetail = await getLogDetail(app, userOne, userTwoLog!.id as string);

      expect(ownDetail.statusCode).toBe(200);
      expect(otherDetail.statusCode).toBe(404);
      expect(otherDetail.json()).toEqual({ error: 'Log not found' });
    } finally {
      await app.close();
    }
  });
});
