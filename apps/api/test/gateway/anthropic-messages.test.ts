import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { channels, requestLogs } from '../../src/db/schema/index.js';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { seedGatewayToken } from '../helpers/login.js';
import { createTestDb } from '../helpers/test-db.js';

const channelKeyEncryptionSecret = 'test-channel-key-secret';

describe('gateway Anthropic Messages route', () => {
  const db = createTestDb();
  const deepseekAnthropicUpstream = createMockUpstream({ basePath: '/anthropic/v1' });

  beforeAll(async () => {
    await db.start();
    await deepseekAnthropicUpstream.start();
  });

  afterAll(async () => {
    await deepseekAnthropicUpstream.stop();
    await db.stop();
  });

  async function latestLogForToken(tokenId: string) {
    const [log] = await db.db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.apiTokenId, tokenId))
      .orderBy(desc(requestLogs.startedAt))
      .limit(1);

    return log ?? null;
  }

  async function buildStartedApp() {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
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

  it('proxies non-stream Anthropic Messages requests to a DeepSeek Anthropic channel and settles usage', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, deepseekAnthropicUpstream.baseUrl, {
        alias: 'deepseek-v4-pro',
        channelKeyEncryptionSecret,
        upstreamModelId: 'deepseek-v4-pro'
      });

      await db.db
        .update(channels)
        .set({
          provider: 'deepseek'
        })
        .where(eq(channels.id, token.primaryChannelId));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/messages',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'anthropic-version': '2023-06-01'
        },
        payload: {
          model: 'deepseek-v4-pro[1m]',
          max_tokens: 128,
          system: 'You are coding inside Claude Code.',
          messages: [
            {
              role: 'user',
              content: 'hello from claude code'
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        type: 'message',
        role: 'assistant',
        model: 'deepseek-v4-pro',
        content: [
          {
            type: 'text',
            text: 'anthropic:hello from claude code'
          }
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 2
        }
      });

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'success',
        endpointType: 'anthropic_messages',
        logicalModelAlias: 'deepseek-v4-pro',
        finalUpstreamModelId: 'deepseek-v4-pro',
        httpStatusCode: 200,
        inputTokens: 5,
        outputTokens: 2,
        settlementPriceUsd: '0.0000'
      });
    } finally {
      await app.close();
    }
  });

  it('accepts Claude Code base URLs that include /v1/anthropic before /v1/messages', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, deepseekAnthropicUpstream.baseUrl, {
        alias: 'deepseek-anthropic-prefix',
        channelKeyEncryptionSecret,
        upstreamModelId: 'deepseek-v4-pro'
      });

      await db.db
        .update(channels)
        .set({
          provider: 'deepseek'
        })
        .where(eq(channels.id, token.primaryChannelId));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/anthropic/v1/messages',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'anthropic-version': '2023-06-01'
        },
        payload: {
          model: token.alias,
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: 'prefixed path'
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        model: 'deepseek-v4-pro',
        content: [
          {
            type: 'text',
            text: 'anthropic:prefixed path'
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it('streams Anthropic Messages SSE from a DeepSeek Anthropic channel and settles final usage', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, deepseekAnthropicUpstream.baseUrl, {
        alias: 'deepseek-stream',
        channelKeyEncryptionSecret,
        upstreamModelId: 'deepseek-v4-pro'
      });

      await db.db
        .update(channels)
        .set({
          provider: 'deepseek'
        })
        .where(eq(channels.id, token.primaryChannelId));

      deepseekAnthropicUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream_1","type":"message","role":"assistant","model":"deepseek-v4-pro","content":[],"usage":{"input_tokens":11,"output_tokens":0}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"stream hello"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n'
        ]
      });

      const response = await fetch(new URL('/v1/messages', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: token.alias,
          max_tokens: 128,
          stream: true,
          messages: [
            {
              role: 'user',
              content: 'stream please'
            }
          ]
        })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const streamText = await readStreamText(response);
      expect(streamText).toContain('message_start');
      expect(streamText).toContain('stream hello');
      expect(streamText).toContain('message_stop');

      const storedLog = await latestLogForToken(token.tokenId);
      expect(storedLog).toMatchObject({
        requestStatus: 'success',
        endpointType: 'anthropic_messages',
        finalUpstreamModelId: 'deepseek-v4-pro',
        inputTokens: 11,
        outputTokens: 4
      });
    } finally {
      await app.close();
    }
  });
});
