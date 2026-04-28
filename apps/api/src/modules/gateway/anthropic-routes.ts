import { TextDecoder } from 'node:util';
import { ZodError, z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDb } from '../auth/repository.js';
import type { GatewayTokenContext } from '../tokens/service.js';
import { decryptChannelSecret } from '../channels/secret.js';
import { RequestLogService } from './request-log-service.js';
import { resolveRoutesForAlias } from './route-resolver.js';
import { createSseFrameParser, writeSseChunk } from './sse.js';

const anthropicMessageSchema = z.object({
  role: z.string(),
  content: z.unknown()
}).passthrough();

const anthropicMessagesRequestSchema = z
  .object({
    model: z.string().trim().min(1),
    messages: z.array(anthropicMessageSchema),
    max_tokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
    system: z.unknown().optional()
  })
  .passthrough();

type AnthropicMessagesRequest = z.infer<typeof anthropicMessagesRequestSchema>;
type ResolvedRoute = Awaited<ReturnType<typeof resolveRoutesForAlias>>[number];

class AnthropicGatewayError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: Record<string, unknown>
  ) {
    super(String(body.error ?? 'Anthropic gateway error'));
  }
}

class AnthropicProviderError extends Error {
  constructor(readonly code: 'NETWORK' | 'INVALID_RESPONSE' | 'TIMEOUT', message: string) {
    super(message);
  }
}

function summarizeUnexpectedError(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected gateway error';
}

function stripClaudeContextSuffix(model: string) {
  return model.replace(/\[(?:\d+[kKmM]?|1m)\]$/i, '');
}

function resolveLogicalModelAlias(input: {
  gatewayToken: GatewayTokenContext;
  requestedModel: string;
}) {
  const requestedModel = stripClaudeContextSuffix(input.requestedModel);

  if (requestedModel !== input.gatewayToken.logicalModelAlias) {
    throw new AnthropicGatewayError(404, {
      error: {
        message: 'Model route not found'
      }
    });
  }

  return input.gatewayToken.logicalModelAlias;
}

function summarizeAnthropicMessagesRequest(payload: AnthropicMessagesRequest) {
  return {
    model: payload.model,
    stream: payload.stream === true,
    messageCount: payload.messages.length,
    messageRoles: Array.from(
      new Set(
        payload.messages.map((message) =>
          typeof message.role === 'string' ? message.role.slice(0, 32) : 'unknown'
        )
      )
    ).slice(0, 8),
    hasSystem: payload.system !== undefined,
    hasTools: Object.prototype.hasOwnProperty.call(payload, 'tools')
  };
}

function buildAnthropicMessagesUrl(input: { baseUrl: string; provider: string }) {
  const url = new URL(input.baseUrl);
  const path = url.pathname.replace(/\/+$/, '');

  if (input.provider === 'deepseek') {
    if (path.endsWith('/anthropic/v1')) {
      url.pathname = `${path}/messages`;
      return url;
    }

    if (path.endsWith('/anthropic')) {
      url.pathname = `${path}/v1/messages`;
      return url;
    }

    if (!path || path === '/') {
      url.pathname = '/anthropic/v1/messages';
      return url;
    }
  }

  url.pathname = `${path || ''}/messages`;
  return url;
}

function getAnthropicUsage(body: unknown) {
  const usage =
    body && typeof body === 'object' && 'usage' in body ? (body as { usage?: unknown }).usage : undefined;

  if (!usage || typeof usage !== 'object') {
    return {
      rawUsageJson: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      isUsageSettleable: false
    };
  }

  const usageRecord = usage as {
    input_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    output_tokens?: unknown;
  };
  const inputTokens = typeof usageRecord.input_tokens === 'number' ? usageRecord.input_tokens : null;
  const cacheCreationInputTokens =
    typeof usageRecord.cache_creation_input_tokens === 'number'
      ? usageRecord.cache_creation_input_tokens
      : 0;
  const cachedInputTokens =
    typeof usageRecord.cache_read_input_tokens === 'number' ? usageRecord.cache_read_input_tokens : 0;
  const outputTokens = typeof usageRecord.output_tokens === 'number' ? usageRecord.output_tokens : null;

  return {
    rawUsageJson: usage,
    inputTokens:
      inputTokens === null ? null : inputTokens + cacheCreationInputTokens + cachedInputTokens,
    cachedInputTokens,
    outputTokens,
    isUsageSettleable: inputTokens !== null && outputTokens !== null
  };
}

function summarizeAnthropicMessageResponse(body: unknown, usageMetrics: ReturnType<typeof getAnthropicUsage>) {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  return {
    kind: 'anthropic_messages',
    stream: false,
    usageReported: usageMetrics.rawUsageJson !== null,
    messageId: typeof record.id === 'string' ? record.id : null,
    responseType: typeof record.type === 'string' ? record.type : null,
    stopReason: typeof record.stop_reason === 'string' ? record.stop_reason : null
  };
}

function createAnthropicStreamSummary() {
  return {
    kind: 'anthropic_messages',
    stream: true,
    eventTypes: [] as string[],
    messageId: null as string | null,
    sawMessageStop: false,
    usageReported: false,
    lastEventType: null as string | null
  };
}

function addStreamEventType(summary: ReturnType<typeof createAnthropicStreamSummary>, type: string) {
  if (!summary.eventTypes.includes(type) && summary.eventTypes.length < 16) {
    summary.eventTypes.push(type);
  }
}

function updateStreamSummaryFromEvent(
  summary: ReturnType<typeof createAnthropicStreamSummary>,
  event: unknown
) {
  if (!event || typeof event !== 'object') {
    return;
  }

  const record = event as Record<string, unknown>;
  const eventType = typeof record.type === 'string' ? record.type : null;

  if (!eventType) {
    return;
  }

  addStreamEventType(summary, eventType);
  summary.lastEventType = eventType;

  if (eventType === 'message_stop') {
    summary.sawMessageStop = true;
  }

  if (record.message && typeof record.message === 'object') {
    const message = record.message as Record<string, unknown>;

    if (typeof message.id === 'string') {
      summary.messageId = message.id;
    }
  }
}

function extractStreamUsageEvent(event: unknown) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const record = event as Record<string, unknown>;

  if (record.usage && typeof record.usage === 'object') {
    return record.usage as Record<string, unknown>;
  }

  if (record.message && typeof record.message === 'object') {
    const message = record.message as Record<string, unknown>;

    if (message.usage && typeof message.usage === 'object') {
      return message.usage as Record<string, unknown>;
    }
  }

  return null;
}

function mapProviderFailureStage(error: AnthropicProviderError) {
  if (error.code === 'TIMEOUT') {
    return 'timeout' as const;
  }

  if (error.code === 'INVALID_RESPONSE') {
    return 'protocol_parse' as const;
  }

  return 'connect' as const;
}

async function fetchAnthropicMessages(input: {
  apiKey: string;
  baseUrl: string;
  provider: string;
  payload: AnthropicMessagesRequest;
  anthropicVersion?: string;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await fetch(buildAnthropicMessagesUrl(input), {
      method: 'POST',
      headers: {
        'anthropic-version': input.anthropicVersion ?? '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': input.apiKey
      },
      body: JSON.stringify(input.payload),
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AnthropicProviderError('TIMEOUT', `Upstream provider timed out after ${input.timeoutMs}ms`);
    }

    throw new AnthropicProviderError(
      'NETWORK',
      error instanceof Error ? error.message : 'Failed to reach upstream provider'
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonBody(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    throw new AnthropicProviderError(
      'INVALID_RESPONSE',
      error instanceof Error ? error.message : 'Upstream provider returned invalid JSON'
    );
  }
}

async function createStartedAnthropicLog(
  fastify: FastifyInstance,
  input: {
    gatewayToken: GatewayTokenContext;
    logicalModelAlias: string;
    payload: AnthropicMessagesRequest;
  }
) {
  const db = (fastify as FastifyInstance & { db: AppDb }).db;
  const requestLogService = new RequestLogService(db);
  const requestLog = await requestLogService.createStartedLog({
    userId: input.gatewayToken.userId,
    apiTokenId: input.gatewayToken.id,
    endpointType: 'anthropic_messages',
    logicalModelAlias: input.logicalModelAlias,
    rawRequestSummary: summarizeAnthropicMessagesRequest(input.payload)
  });

  return {
    db,
    requestLogService,
    requestLog
  };
}

async function resolveRoutesOrFail(db: AppDb, input: { userId: string; alias: string }) {
  const routes = await resolveRoutesForAlias(db, input);

  if (routes.length === 0) {
    throw new AnthropicGatewayError(404, {
      error: {
        message: 'Model route not found'
      }
    });
  }

  return routes;
}

async function proxyAnthropicJsonRequest(
  fastify: FastifyInstance,
  reply: FastifyReply,
  input: {
    gatewayToken: GatewayTokenContext;
    payload: AnthropicMessagesRequest;
    channelKeyEncryptionSecret: string;
    upstreamTimeoutMs: number;
    anthropicVersion?: string;
  }
) {
  const logicalModelAlias = resolveLogicalModelAlias({
    gatewayToken: input.gatewayToken,
    requestedModel: input.payload.model
  });
  const { db, requestLogService, requestLog } = await createStartedAnthropicLog(fastify, {
    gatewayToken: input.gatewayToken,
    logicalModelAlias,
    payload: input.payload
  });
  let logFinalized = false;

  try {
    const routes = await resolveRoutesOrFail(db, {
      userId: input.gatewayToken.userId,
      alias: logicalModelAlias
    });
    let lastProviderError: AnthropicProviderError | null = null;

    for (const [routeIndex, route] of routes.entries()) {
      const attemptStartedAt = new Date();
      const upstreamModelId = route.upstreamModelId ?? logicalModelAlias;
      const payload = {
        ...input.payload,
        model: upstreamModelId
      };

      try {
        const response = await fetchAnthropicMessages({
          apiKey: decryptChannelSecret(route.apiKeyEncrypted, input.channelKeyEncryptionSecret),
          anthropicVersion: input.anthropicVersion,
          baseUrl: route.baseUrl,
          provider: route.provider,
          payload,
          timeoutMs: input.upstreamTimeoutMs
        });
        const body = await parseJsonBody(response);
        const usageMetrics = getAnthropicUsage(body);

        await requestLogService.recordAttempt({
          requestLogId: requestLog.id,
          channelId: route.channelId,
          routeId: route.routeId,
          attemptIndex: routeIndex + 1,
          attemptStatus: 'succeeded',
          startedAt: attemptStartedAt,
          finishedAt: new Date()
        });

        await requestLogService.markSuccess({
          requestLogId: requestLog.id,
          apiTokenId: input.gatewayToken.id,
          startedAt: requestLog.startedAt,
          statusCode: response.status,
          finalChannelId: route.channelId,
          finalRouteId: route.routeId,
          finalUpstreamModelId: upstreamModelId,
          eventSummaryJson: summarizeAnthropicMessageResponse(body, usageMetrics),
          isUsageSettleable: usageMetrics.isUsageSettleable,
          rawUsageJson: usageMetrics.rawUsageJson,
          rawUpstreamPriceUsd: null,
          inputTokens: usageMetrics.inputTokens,
          cachedInputTokens: usageMetrics.cachedInputTokens,
          outputTokens: usageMetrics.outputTokens,
          inputPricePer1m: route.inputPricePer1m,
          cachedInputPricePer1m: route.cachedInputPricePer1m,
          outputPricePer1m: route.outputPricePer1m,
          currency: route.currency
        });
        logFinalized = true;

        reply.status(response.status).send(body);
        return;
      } catch (error) {
        if (!(error instanceof AnthropicProviderError)) {
          throw error;
        }

        await requestLogService.recordAttempt({
          requestLogId: requestLog.id,
          channelId: route.channelId,
          routeId: route.routeId,
          attemptIndex: routeIndex + 1,
          attemptStatus: 'failed',
          failureStage: mapProviderFailureStage(error),
          errorSummary: error.message,
          startedAt: attemptStartedAt,
          finishedAt: new Date()
        });
        lastProviderError = error;
      }
    }

    await requestLogService.markUpstreamError({
      requestLogId: requestLog.id,
      startedAt: requestLog.startedAt,
      errorSummary: lastProviderError?.message ?? 'All upstream routes failed before response body'
    });
    logFinalized = true;

    throw new AnthropicGatewayError(502, {
      error: {
        message: 'Upstream request failed',
        type: 'bad_gateway'
      }
    });
  } catch (error) {
    if (!logFinalized) {
      await requestLogService.markUpstreamError({
        requestLogId: requestLog.id,
        startedAt: requestLog.startedAt,
        errorSummary: summarizeUnexpectedError(error),
        statusCode: error instanceof AnthropicGatewayError ? error.statusCode : 500
      });
    }

    if (error instanceof AnthropicGatewayError) {
      throw error;
    }

    throw new AnthropicGatewayError(500, {
      error: {
        message: 'Internal Server Error'
      }
    });
  }
}

async function proxyAnthropicStreamingRequest(
  fastify: FastifyInstance,
  reply: FastifyReply,
  input: {
    gatewayToken: GatewayTokenContext;
    payload: AnthropicMessagesRequest;
    channelKeyEncryptionSecret: string;
    upstreamTimeoutMs: number;
    anthropicVersion?: string;
  }
) {
  const logicalModelAlias = resolveLogicalModelAlias({
    gatewayToken: input.gatewayToken,
    requestedModel: input.payload.model
  });
  const { db, requestLogService, requestLog } = await createStartedAnthropicLog(fastify, {
    gatewayToken: input.gatewayToken,
    logicalModelAlias,
    payload: input.payload
  });
  let logFinalized = false;

  try {
    const routes = await resolveRoutesOrFail(db, {
      userId: input.gatewayToken.userId,
      alias: logicalModelAlias
    });
    let lastProviderError: AnthropicProviderError | null = null;

    for (const [routeIndex, route] of routes.entries()) {
      const attemptStartedAt = new Date();
      const upstreamModelId = route.upstreamModelId ?? logicalModelAlias;
      const payload = {
        ...input.payload,
        model: upstreamModelId
      };

      try {
        const response = await fetchAnthropicMessages({
          apiKey: decryptChannelSecret(route.apiKeyEncrypted, input.channelKeyEncryptionSecret),
          anthropicVersion: input.anthropicVersion,
          baseUrl: route.baseUrl,
          provider: route.provider,
          payload,
          timeoutMs: input.upstreamTimeoutMs
        });
        const contentType = response.headers.get('content-type') ?? '';

        if (!response.body || !contentType.toLowerCase().includes('text/event-stream')) {
          const body = await parseJsonBody(response);
          const usageMetrics = getAnthropicUsage(body);

          await requestLogService.recordAttempt({
            requestLogId: requestLog.id,
            channelId: route.channelId,
            routeId: route.routeId,
            attemptIndex: routeIndex + 1,
            attemptStatus: 'succeeded',
            startedAt: attemptStartedAt,
            finishedAt: new Date()
          });

          await requestLogService.markSuccess({
            requestLogId: requestLog.id,
            apiTokenId: input.gatewayToken.id,
            startedAt: requestLog.startedAt,
            statusCode: response.status,
            finalChannelId: route.channelId,
            finalRouteId: route.routeId,
            finalUpstreamModelId: upstreamModelId,
            eventSummaryJson: summarizeAnthropicMessageResponse(body, usageMetrics),
            isUsageSettleable: usageMetrics.isUsageSettleable,
            rawUsageJson: usageMetrics.rawUsageJson,
            rawUpstreamPriceUsd: null,
            inputTokens: usageMetrics.inputTokens,
            cachedInputTokens: usageMetrics.cachedInputTokens,
            outputTokens: usageMetrics.outputTokens,
            inputPricePer1m: route.inputPricePer1m,
            cachedInputPricePer1m: route.cachedInputPricePer1m,
            outputPricePer1m: route.outputPricePer1m,
            currency: route.currency
          });
          logFinalized = true;

          reply.status(response.status).send(body);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const summary = createAnthropicStreamSummary();
        let rawUsageJson: unknown = null;
        let baseInputTokens: number | null = null;
        let cacheCreationInputTokens = 0;
        let cachedInputTokens = 0;
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        const refreshUsageMetrics = () => {
          inputTokens =
            baseInputTokens === null
              ? null
              : baseInputTokens + cacheCreationInputTokens + cachedInputTokens;
          rawUsageJson = {
            ...(baseInputTokens === null ? {} : { input_tokens: baseInputTokens }),
            ...(cacheCreationInputTokens > 0
              ? { cache_creation_input_tokens: cacheCreationInputTokens }
              : {}),
            ...(cachedInputTokens > 0 ? { cache_read_input_tokens: cachedInputTokens } : {}),
            ...(outputTokens === null ? {} : { output_tokens: outputTokens })
          };
        };
        const parser = createSseFrameParser((frame) => {
          if (frame.data === '[DONE]') {
            summary.sawMessageStop = true;
            return;
          }

          let parsedEvent: unknown;

          try {
            parsedEvent = JSON.parse(frame.data);
          } catch {
            throw new Error('Upstream provider returned a malformed SSE event');
          }

          updateStreamSummaryFromEvent(summary, parsedEvent);

          const usage = extractStreamUsageEvent(parsedEvent);

          if (usage) {
            summary.usageReported = true;

            if (typeof usage.input_tokens === 'number') {
              baseInputTokens = usage.input_tokens;
            }

            if (typeof usage.cache_creation_input_tokens === 'number') {
              cacheCreationInputTokens = usage.cache_creation_input_tokens;
            }

            if (typeof usage.cache_read_input_tokens === 'number') {
              cachedInputTokens = usage.cache_read_input_tokens;
            }

            if (typeof usage.output_tokens === 'number') {
              outputTokens = usage.output_tokens;
            }

            refreshUsageMetrics();
          }
        });

        reply.hijack();
        reply.raw.statusCode = response.status;
        reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
        reply.raw.setHeader('cache-control', 'no-cache, no-transform');
        reply.raw.setHeader('connection', 'keep-alive');
        reply.raw.flushHeaders?.();

        const canWriteToClient = () => !reply.raw.writableEnded && !reply.raw.destroyed;

        try {
          while (true) {
            const chunk = await reader.read();

            if (chunk.done) {
              break;
            }

            if (chunk.value && chunk.value.length > 0) {
              parser.push(decoder.decode(chunk.value, { stream: true }));
              await writeSseChunk(reply.raw, Buffer.from(chunk.value));
            }
          }

          parser.finish();

          if (!summary.sawMessageStop) {
            throw new Error('Upstream provider ended the stream without a message_stop event');
          }

          await requestLogService.recordAttempt({
            requestLogId: requestLog.id,
            channelId: route.channelId,
            routeId: route.routeId,
            attemptIndex: routeIndex + 1,
            attemptStatus: 'succeeded',
            startedAt: attemptStartedAt,
            finishedAt: new Date()
          });

          await requestLogService.markSuccess({
            requestLogId: requestLog.id,
            apiTokenId: input.gatewayToken.id,
            startedAt: requestLog.startedAt,
            statusCode: response.status,
            finalChannelId: route.channelId,
            finalRouteId: route.routeId,
            finalUpstreamModelId: upstreamModelId,
            eventSummaryJson: summary,
            isUsageSettleable: rawUsageJson !== null && inputTokens !== null && outputTokens !== null,
            rawUsageJson,
            rawUpstreamPriceUsd: null,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            inputPricePer1m: route.inputPricePer1m,
            cachedInputPricePer1m: route.cachedInputPricePer1m,
            outputPricePer1m: route.outputPricePer1m,
            currency: route.currency
          });
          logFinalized = true;

          if (canWriteToClient()) {
            reply.raw.end();
          }
          return;
        } catch (error) {
          await requestLogService.recordAttempt({
            requestLogId: requestLog.id,
            channelId: route.channelId,
            routeId: route.routeId,
            attemptIndex: routeIndex + 1,
            attemptStatus: 'failed',
            failureStage: 'protocol_parse',
            errorSummary: summarizeUnexpectedError(error),
            startedAt: attemptStartedAt,
            finishedAt: new Date()
          });

          await requestLogService.markStreamFailed({
            requestLogId: requestLog.id,
            startedAt: requestLog.startedAt,
            errorSummary: summarizeUnexpectedError(error),
            statusCode: 502,
            finalChannelId: route.channelId,
            finalRouteId: route.routeId,
            finalUpstreamModelId: upstreamModelId,
            eventSummaryJson: summary,
            rawUsageJson,
            inputTokens,
            cachedInputTokens,
            outputTokens
          });
          logFinalized = true;

          if (canWriteToClient()) {
            reply.raw.end();
          }
          return;
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      } catch (error) {
        if (!(error instanceof AnthropicProviderError)) {
          throw error;
        }

        await requestLogService.recordAttempt({
          requestLogId: requestLog.id,
          channelId: route.channelId,
          routeId: route.routeId,
          attemptIndex: routeIndex + 1,
          attemptStatus: 'failed',
          failureStage: mapProviderFailureStage(error),
          errorSummary: error.message,
          startedAt: attemptStartedAt,
          finishedAt: new Date()
        });
        lastProviderError = error;
      }
    }

    await requestLogService.markUpstreamError({
      requestLogId: requestLog.id,
      startedAt: requestLog.startedAt,
      errorSummary: lastProviderError?.message ?? 'All upstream routes failed before response body'
    });
    logFinalized = true;

    throw new AnthropicGatewayError(502, {
      error: {
        message: 'Upstream request failed',
        type: 'bad_gateway'
      }
    });
  } catch (error) {
    if (!logFinalized) {
      await requestLogService.markUpstreamError({
        requestLogId: requestLog.id,
        startedAt: requestLog.startedAt,
        errorSummary: summarizeUnexpectedError(error),
        statusCode: error instanceof AnthropicGatewayError ? error.statusCode : 500
      });
    }

    if (error instanceof AnthropicGatewayError) {
      throw error;
    }

    throw new AnthropicGatewayError(500, {
      error: {
        message: 'Internal Server Error'
      }
    });
  }
}

function sendAnthropicGatewayError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        message: 'Bad Request'
      }
    });
    return;
  }

  if (error instanceof AnthropicGatewayError) {
    reply.status(error.statusCode).send(error.body);
    return;
  }

  throw error;
}

export async function registerAnthropicRoutes(
  fastify: FastifyInstance,
  options: {
    channelKeyEncryptionSecret: string;
    upstreamTimeoutMs: number;
  }
) {
  const handler = async (request: { body: unknown; headers: Record<string, unknown>; gatewayToken: GatewayTokenContext | null }, reply: FastifyReply) => {
    try {
      const payload = anthropicMessagesRequestSchema.parse(request.body);
      const anthropicVersion =
        typeof request.headers['anthropic-version'] === 'string'
          ? request.headers['anthropic-version']
          : undefined;

      if (payload.stream === true) {
        await proxyAnthropicStreamingRequest(fastify, reply, {
          gatewayToken: request.gatewayToken!,
          payload,
          channelKeyEncryptionSecret: options.channelKeyEncryptionSecret,
          upstreamTimeoutMs: options.upstreamTimeoutMs,
          anthropicVersion
        });
        return;
      }

      await proxyAnthropicJsonRequest(fastify, reply, {
        gatewayToken: request.gatewayToken!,
        payload,
        channelKeyEncryptionSecret: options.channelKeyEncryptionSecret,
        upstreamTimeoutMs: options.upstreamTimeoutMs,
        anthropicVersion
      });
    } catch (error) {
      sendAnthropicGatewayError(error, reply);
    }
  };

  fastify.post('/v1/messages', { preHandler: [fastify.requireGatewayToken] }, handler);
  fastify.post('/v1/anthropic/messages', { preHandler: [fastify.requireGatewayToken] }, handler);
  fastify.post('/v1/anthropic/v1/messages', { preHandler: [fastify.requireGatewayToken] }, handler);
}
