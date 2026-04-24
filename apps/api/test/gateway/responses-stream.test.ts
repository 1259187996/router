import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { requestLogs } from '../../src/db/schema/index.js';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { seedGatewayToken } from '../helpers/login.js';
import { createTestDb } from '../helpers/test-db.js';

const channelKeyEncryptionSecret = 'test-channel-key-secret';

type ParsedSseEvent = {
  event?: string;
  data: string[];
};

describe('gateway responses route', () => {
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

  async function latestLogForToken(tokenId: string) {
    const [log] = await db.db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.apiTokenId, tokenId))
      .orderBy(desc(requestLogs.startedAt))
      .limit(1);

    return log ?? null;
  }

  async function buildStartedApp(options?: { gatewayUpstreamTimeoutMs?: number }) {
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

  function parseSseEvents(payload: string) {
    return payload
      .split('\n\n')
      .map((frame) => frame.trim())
      .filter((frame) => frame.length > 0)
      .map<ParsedSseEvent>((frame) => {
        const lines = frame.split('\n');
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trimStart());
        const eventLine = lines.find((line) => line.startsWith('event:'));

        return {
          event: eventLine?.slice('event:'.length).trim(),
          data
        };
      });
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

  async function readSingleChunk(response: Response) {
    if (!response.body) {
      throw new Error('Response body is missing');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunk = await reader.read();

    return {
      reader,
      text: chunk.value ? decoder.decode(chunk.value, { stream: true }) : '',
      done: chunk.done,
      decoder
    };
  }

  it('proxies POST /v1/responses for non-stream requests and records a success log', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-json-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-responses-upstream'
      });

      primaryUpstream.setNextResponseOverride({
        body: {
          id: 'resp_nonstream_1',
          object: 'response',
          status: 'completed',
          model: 'gpt-4.1-responses-upstream',
          output: [
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'lookup_weather',
              arguments: '{"city":"Shanghai"}'
            }
          ],
          usage: {
            input_tokens: 11,
            output_tokens: 5,
            total_tokens: 16
          }
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/responses',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          input: 'weather in shanghai',
          tools: [
            {
              type: 'function',
              name: 'lookup_weather',
              parameters: {
                type: 'object'
              }
            }
          ],
          tool_choice: 'auto'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: 'resp_nonstream_1',
        object: 'response',
        model: 'gpt-4.1-responses-upstream',
        output: [
          {
            type: 'function_call',
            name: 'lookup_weather',
            arguments: '{"city":"Shanghai"}'
          }
        ]
      });

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        logicalModelAlias: token.alias,
        requestStatus: 'success',
        httpStatusCode: 200,
        finalUpstreamModelId: 'gpt-4.1-responses-upstream'
      });
      expect(JSON.stringify(storedLog?.rawRequestSummary)).not.toContain('weather in shanghai');
      expect(JSON.stringify(storedLog?.rawRequestSummary)).not.toContain('lookup_weather');
    } finally {
      await app.close();
    }
  });

  it('routes responses requests without model via the token alias and rewrites the upstream model', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-model-omitted-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-omitted-upstream'
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/responses',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          prompt: {
            id: 'pmpt_123',
            variables: {
              city: 'Hangzhou'
            }
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        object: 'response',
        model: 'gpt-4.1-omitted-upstream'
      });

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        logicalModelAlias: token.alias,
        requestStatus: 'success',
        finalUpstreamModelId: 'gpt-4.1-omitted-upstream'
      });
    } finally {
      await app.close();
    }
  });

  it('streams SSE responses, keeps the request log in progress until the stream ends, and finishes with [DONE]', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-stream-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-stream-upstream'
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.in_progress\ndata: {"type":"response.in_progress","response":{"id":"resp_stream_1"}}\n\n',
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hel"}\n\n',
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"lo"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_stream_1"},"usage":{"input_tokens":7,"output_tokens":2,"total_tokens":9}}\n\n',
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
          input: 'hello',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const firstChunk = await readSingleChunk(response);
      expect(firstChunk.text).toContain('response.in_progress');

      const logDuringStream = await latestLogForToken(token.tokenId);
      expect(logDuringStream).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'in_progress'
      });

      let streamText = firstChunk.text;

      while (true) {
        const { done, value } = await firstChunk.reader.read();

        if (done) {
          streamText += firstChunk.decoder.decode();
          break;
        }

        streamText += firstChunk.decoder.decode(value, { stream: true });
      }

      expect(streamText).toContain('response.output_text.delta');
      expect(streamText).toContain('"delta":"hel"');
      expect(streamText).toContain('data: [DONE]');

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'success',
        httpStatusCode: 200,
        finalUpstreamModelId: 'gpt-4.1-stream-upstream'
      });
    } finally {
      await app.close();
    }
  });

  it('settles responses streams when usage is nested under response.completed.response.usage', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-stream-nested-usage-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-stream-nested-usage-upstream'
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.in_progress\ndata: {"type":"response.in_progress","response":{"id":"resp_stream_nested_usage_1"}}\n\n',
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_stream_nested_usage_1","usage":{"input_tokens":20,"output_tokens":5,"total_tokens":25}}}\n\n',
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
          input: 'hello nested usage',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('response.completed');
      expect(streamText).toContain('data: [DONE]');

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'success',
        httpStatusCode: 200,
        finalUpstreamModelId: 'gpt-4.1-stream-nested-usage-upstream',
        inputTokens: 20,
        outputTokens: 5,
        settlementPriceUsd: '0.0000'
      });
    } finally {
      await app.close();
    }
  });

  it('treats [DONE] as terminal success without waiting for upstream EOF', async () => {
    const { app, baseUrl } = await buildStartedApp({
      gatewayUpstreamTimeoutMs: 25
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-done-terminal-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-done-upstream'
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_done_1"},"usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}\n\n' +
            'data: [DONE]\n\n'
        ],
        chunkDelayMs: 100
      });

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'done terminal',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('response.completed');
      expect(streamText).toContain('data: [DONE]');
      expect(streamText).not.toContain('response.error');

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'success',
        httpStatusCode: 200,
        finalUpstreamModelId: 'gpt-4.1-done-upstream'
      });
    } finally {
      await app.close();
    }
  });

  it('parses CRLF-delimited SSE responses and records a successful completion', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-crlf-stream-alias',
        channelKeyEncryptionSecret,
        upstreamModelId: 'gpt-4.1-crlf-upstream'
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.in_progress\r\ndata: {"type":"response.in_progress","response":{"id":"resp_crlf_1"}}\r\n\r\n',
          'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"crlf"}\r\n\r\n',
          'event: response.completed\r\ndata: {"type":"response.completed","response":{"id":"resp_crlf_1"},"usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}}\r\n\r\n',
          'data: [DONE]\r\n\r\n'
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
          input: 'crlf',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"crlf"');
      expect(streamText).toContain('[DONE]');

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'success',
        httpStatusCode: 200,
        finalUpstreamModelId: 'gpt-4.1-crlf-upstream'
      });
    } finally {
      await app.close();
    }
  });

  it('streams tool calling delta and done events for responses', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-tool-stream-alias',
        channelKeyEncryptionSecret
      });

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.in_progress\ndata: {"type":"response.in_progress","response":{"id":"resp_tool_1"}}\n\n',
          'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"city\\":\\"Sha"}\n\n',
          'event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"city\\":\\"Shanghai\\"}"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_tool_1"}}\n\n',
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
          input: 'lookup weather',
          stream: true,
          tools: [
            {
              type: 'function',
              name: 'lookup_weather',
              parameters: {
                type: 'object'
              }
            }
          ]
        })
      });

      expect(response.status).toBe(200);

      const streamText = await readStreamText(response);
      const events = parseSseEvents(streamText)
        .flatMap((frame) => frame.data)
        .filter((data) => data !== '[DONE]')
        .map((data) => JSON.parse(data) as { type: string; delta?: string; arguments?: string });

      expect(events).toContainEqual({
        type: 'response.function_call_arguments.delta',
        item_id: 'fc_1',
        delta: '{"city":"Sha'
      });
      expect(events).toContainEqual({
        type: 'response.function_call_arguments.done',
        item_id: 'fc_1',
        arguments: '{"city":"Shanghai"}'
      });
    } finally {
      await app.close();
    }
  });

  it('fails over to the backup route when a responses stream fails before the first byte', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-prebody-failover-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl,
        upstreamModelId: 'gpt-primary-stream-upstream'
      });

      primaryUpstream.failBeforeBody();
      fallbackUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"fallback"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_fallback_1"}}\n\n',
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
          input: 'fallback please',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"fallback"');
      expect(primaryUpstream.requestCount).toBeGreaterThanOrEqual(1);
      expect(fallbackUpstream.requestCount).toBeGreaterThanOrEqual(1);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'review_required',
        finalUpstreamModelId: token.fallbackUpstreamModelId
      });
    } finally {
      await app.close();
    }
  });

  it('fails over when the first upstream event is response.error before any downstream bytes are sent', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-error-prefirstbyte-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.error\ndata: {"type":"response.error","error":{"message":"primary failed before body","type":"server_error"}}\n\n',
          'data: [DONE]\n\n'
        ]
      });
      fallbackUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"fallback-after-error"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_fallback_error_prebody_1"}}\n\n',
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
          input: 'response error before body',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"fallback-after-error"');
      expect(streamText).not.toContain('primary failed before body');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore + 1);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'review_required',
        httpStatusCode: 200,
        finalUpstreamModelId: token.fallbackUpstreamModelId
      });
    } finally {
      await app.close();
    }
  });

  it('marks the request as stream_failed when a malformed SSE frame appears after streaming has started', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-malformed-frame-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"safe"}\n\n',
          'event: response.output_text.delta\ndata: {not json}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_bad_frame_1"}}\n\n',
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
          input: 'bad frame',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"safe"');
      expect(streamText).not.toContain('{not json}');
      expect(streamText).toContain('response.error');
      expect(streamText).toContain('Upstream provider returned a malformed SSE event');
      expect(streamText).not.toContain('Expected property name');
      expect(streamText).toContain('data: [DONE]');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'stream_failed',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });

  it('marks the request as stream_failed when the upstream stalls after the first streamed bytes', async () => {
    const { app, baseUrl } = await buildStartedApp({
      gatewayUpstreamTimeoutMs: 25
    });

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-postbyte-timeout-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"waiting"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_timeout_1"}}\n\n',
          'data: [DONE]\n\n'
        ],
        chunkDelayMs: 100
      });

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'stall after first bytes',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"waiting"');
      expect(streamText).toContain('response.error');
      expect(streamText).toContain('[DONE]');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'stream_failed',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });

  it('marks the request as stream_failed when the upstream ends without response.completed or [DONE]', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-truncated-stream-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"cutoff"}\n\n'
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
          input: 'truncated stream',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"cutoff"');
      expect(streamText).toContain('response.error');
      expect(streamText).toContain('[DONE]');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'stream_failed',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });

  it('fails over when the first upstream chunk contains a valid frame followed by a malformed frame before any bytes are sent downstream', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-malformed-first-chunk-failover-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"primary-safe"}\n\n' +
            'event: response.output_text.delta\ndata: {not json}\n\n'
        ]
      });
      fallbackUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"fallback"}\n\n',
          'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_fallback_after_bad_chunk_1"}}\n\n',
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
          input: 'bad first chunk',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"fallback"');
      expect(streamText).not.toContain('"delta":"primary-safe"');
      expect(streamText).not.toContain('{not json}');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore + 1);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'review_required',
        httpStatusCode: 200,
        finalUpstreamModelId: token.fallbackUpstreamModelId
      });
    } finally {
      await app.close();
    }
  });

  it('marks the request as stream_failed when response.error arrives after downstream bytes have been sent', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-error-postbyte-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"before-error"}\n\n',
          'event: response.error\ndata: {"type":"response.error","error":{"message":"upstream exploded","type":"server_error"}}\n\n',
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
          input: 'response error after body',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"before-error"');
      expect(streamText).toContain('response.error');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'stream_failed',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });

  it('does not fail over after the first SSE byte and marks the request as stream_failed', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-postbyte-failure-alias',
        channelKeyEncryptionSecret,
        fallbackBaseUrl: fallbackUpstream.baseUrl
      });
      const fallbackRequestCountBefore = fallbackUpstream.requestCount;

      primaryUpstream.setNextResponseOverride({
        headers: {
          'content-type': 'text/event-stream'
        },
        chunks: [
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n'
        ],
        chunkDelayMs: 25,
        destroyAfterChunks: true
      });

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'partial failure',
          stream: true
        })
      });

      expect(response.status).toBe(200);
      const streamText = await readStreamText(response);

      expect(streamText).toContain('"delta":"partial"');
      expect(streamText).toContain('response.error');
      expect(streamText).toContain('data: [DONE]');
      expect(fallbackUpstream.requestCount).toBe(fallbackRequestCountBefore);

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'stream_failed',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });

  it('marks the request as upstream_error when all responses routes fail before the first byte', async () => {
    const { app, baseUrl } = await buildStartedApp();

    try {
      const token = await seedGatewayToken(db.db, primaryUpstream.baseUrl, {
        alias: 'responses-upstream-error-alias',
        channelKeyEncryptionSecret
      });

      primaryUpstream.failBeforeBody();

      const response = await fetch(new URL('/v1/responses', baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.rawToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: token.alias,
          input: 'will fail',
          stream: true
        })
      });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: {
          message: 'Upstream request failed',
          type: 'bad_gateway'
        }
      });

      const storedLog = await latestLogForToken(token.tokenId);

      expect(storedLog).toMatchObject({
        endpointType: 'responses',
        requestStatus: 'upstream_error',
        httpStatusCode: 502
      });
    } finally {
      await app.close();
    }
  });
});
