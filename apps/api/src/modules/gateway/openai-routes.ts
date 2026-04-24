import { TextDecoder } from 'node:util';
import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  chatRequestSchema,
  embeddingsRequestSchema,
  responseRequestSchema,
  responseStreamEventSchema,
  type ChatRequest,
  type EmbeddingsRequest,
  type ResponseRequest
} from '@router/shared';
import type { AppDb } from '../auth/repository.js';
import type { GatewayTokenContext } from '../tokens/service.js';
import { decryptChannelSecret } from '../channels/secret.js';
import {
  ProviderClientError,
  forwardJsonRequest,
  forwardStreamingRequest
} from './provider-client.js';
import { RequestLogService } from './request-log-service.js';
import { resolveRoutesForAlias } from './route-resolver.js';
import {
  buildResponsesStreamErrorEvent,
  getResponsesCompletedUsage,
  getResponsesUsageMetrics,
  summarizeResponseRequest
} from './responses-adapter.js';
import {
  createSseWriteError,
  createSseFrameParser,
  encodeSseEvent,
  encodeSseJsonEvent,
  writeSseChunk
} from './sse.js';

type GatewayEndpoint = {
  endpointType: 'chat_completions' | 'embeddings' | 'responses';
  path: '/chat/completions' | '/embeddings' | '/responses';
};

type JsonGatewayPayload = ChatRequest | EmbeddingsRequest | ResponseRequest;
type ResolvedRoute = Awaited<ReturnType<typeof resolveRoutesForAlias>>[number];
const MALFORMED_SSE_EVENT_MESSAGE = 'Upstream provider returned a malformed SSE event';

class GatewayRouteError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: Record<string, unknown>
  ) {
    super(String(body.error ?? 'Gateway route error'));
  }
}

function getUsageMetrics(body: unknown) {
  const usage =
    body && typeof body === 'object' && 'usage' in body ? (body as { usage?: unknown }).usage : undefined;

  if (!usage || typeof usage !== 'object') {
    return {
      rawUsageJson: null,
      inputTokens: null,
      outputTokens: null
    };
  }

  const usageRecord = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };

  return {
    rawUsageJson: usage,
    inputTokens: typeof usageRecord.prompt_tokens === 'number' ? usageRecord.prompt_tokens : null,
    outputTokens: typeof usageRecord.completion_tokens === 'number' ? usageRecord.completion_tokens : null
  };
}

function summarizeUnexpectedError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected gateway error';
}

function normalizeUsageMetrics(input: {
  rawUsageJson: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
}) {
  if (input.rawUsageJson === null || input.rawUsageJson === undefined) {
    return {
      rawUsageJson: null,
      inputTokens: null,
      outputTokens: null
    };
  }

  return {
    rawUsageJson: input.rawUsageJson,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens
  };
}

function classifyUsageForSettlement(
  endpoint: GatewayEndpoint,
  usageMetrics: {
    rawUsageJson: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
  }
) {
  const normalized = normalizeUsageMetrics(usageMetrics);

  if (normalized.rawUsageJson === null) {
    return {
      rawUsageJson: null,
      inputTokens: null,
      outputTokens: null,
      isUsageSettleable: false
    };
  }

  if (endpoint.endpointType === 'embeddings') {
    if (normalized.inputTokens === null) {
      return {
        rawUsageJson: normalized.rawUsageJson,
        inputTokens: null,
        outputTokens: null,
        isUsageSettleable: false
      };
    }

    return {
      rawUsageJson: normalized.rawUsageJson,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens ?? 0,
      isUsageSettleable: true
    };
  }

  if (normalized.inputTokens === null || normalized.outputTokens === null) {
    return {
      rawUsageJson: normalized.rawUsageJson,
      inputTokens: null,
      outputTokens: null,
      isUsageSettleable: false
    };
  }

  return {
    rawUsageJson: normalized.rawUsageJson,
    inputTokens: normalized.inputTokens,
    outputTokens: normalized.outputTokens,
    isUsageSettleable: true
  };
}

function toNumericPrice(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readNestedValue(source: unknown, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function extractRawUpstreamPriceUsd(body: unknown) {
  const candidatePaths = [
    ['usage', 'total_cost_usd'],
    ['usage', 'cost_usd'],
    ['cost', 'usd'],
    ['price', 'usd'],
    ['total_cost_usd'],
    ['raw_upstream_price_usd']
  ] as const;

  for (const path of candidatePaths) {
    const parsed = toNumericPrice(readNestedValue(body, [...path]));

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function summarizeJsonResponseForLog(input: {
  endpoint: GatewayEndpoint;
  body: unknown;
  usageMetrics: {
    rawUsageJson: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
  };
}) {
  if (input.endpoint.endpointType === 'chat_completions') {
    const bodyRecord = input.body as {
      model?: unknown;
      choices?: Array<{ finish_reason?: unknown }>;
    };

    return {
      kind: 'chat_completions',
      usageReported: input.usageMetrics.rawUsageJson !== null,
      upstreamModel: typeof bodyRecord?.model === 'string' ? bodyRecord.model : null,
      choiceCount: Array.isArray(bodyRecord?.choices) ? bodyRecord.choices.length : 0,
      finishReason:
        Array.isArray(bodyRecord?.choices) &&
        typeof bodyRecord.choices[0]?.finish_reason === 'string'
          ? bodyRecord.choices[0].finish_reason
          : null
    };
  }

  if (input.endpoint.endpointType === 'embeddings') {
    const bodyRecord = input.body as {
      model?: unknown;
      data?: unknown[];
    };

    return {
      kind: 'embeddings',
      usageReported: input.usageMetrics.rawUsageJson !== null,
      upstreamModel: typeof bodyRecord?.model === 'string' ? bodyRecord.model : null,
      embeddingCount: Array.isArray(bodyRecord?.data) ? bodyRecord.data.length : 0
    };
  }

  const bodyRecord = input.body as {
    id?: unknown;
    model?: unknown;
    status?: unknown;
    output?: Array<{ type?: unknown }>;
  };

  return {
    kind: 'responses_json',
    usageReported: input.usageMetrics.rawUsageJson !== null,
    responseId: typeof bodyRecord?.id === 'string' ? bodyRecord.id : null,
    upstreamModel: typeof bodyRecord?.model === 'string' ? bodyRecord.model : null,
    responseStatus: typeof bodyRecord?.status === 'string' ? bodyRecord.status : null,
    outputTypes: Array.from(
      new Set(
        Array.isArray(bodyRecord?.output)
          ? bodyRecord.output
              .map((outputItem) =>
                typeof outputItem?.type === 'string' ? outputItem.type.slice(0, 64) : 'unknown'
              )
              .slice(0, 8)
          : []
      )
    )
  };
}

function mapAttemptFailureStage(error: ProviderClientError) {
  if (error.code === 'TIMEOUT') {
    return 'timeout' as const;
  }

  if (error.code === 'INVALID_RESPONSE') {
    return 'protocol_parse' as const;
  }

  return 'connect' as const;
}

function mapStreamingFailureStage(error: unknown) {
  if (error instanceof ProviderClientError) {
    return mapAttemptFailureStage(error);
  }

  if (error instanceof Error && error.message === MALFORMED_SSE_EVENT_MESSAGE) {
    return 'protocol_parse' as const;
  }

  return 'upstream_error' as const;
}

function createResponsesStreamEventSummary() {
  return {
    kind: 'responses_stream',
    eventTypes: [] as string[],
    responseId: null as string | null,
    sawDone: false,
    sawCompleted: false,
    usageReported: false
  };
}

function addStreamEventType(summary: ReturnType<typeof createResponsesStreamEventSummary>, type: string) {
  if (summary.eventTypes.includes(type) || summary.eventTypes.length >= 16) {
    return;
  }

  summary.eventTypes.push(type);
}

function updateResponsesStreamEventSummary(
  summary: ReturnType<typeof createResponsesStreamEventSummary>,
  event: unknown
) {
  if (!event || typeof event !== 'object' || !('type' in event)) {
    return;
  }

  const eventType = (event as { type?: unknown }).type;

  if (typeof eventType !== 'string') {
    return;
  }

  addStreamEventType(summary, eventType);

  const responseValue = 'response' in event ? (event as { response?: unknown }).response : undefined;

  if (responseValue && typeof responseValue === 'object' && 'id' in responseValue) {
    const responseId = (responseValue as { id?: unknown }).id;

    if (typeof responseId === 'string' && responseId.length > 0) {
      summary.responseId = responseId;
    }
  }
}

function getResponseErrorMessage(event: unknown) {
  if (!event || typeof event !== 'object') {
    return 'Upstream provider emitted response.error';
  }

  const errorValue = 'error' in event ? (event as { error?: unknown }).error : undefined;

  if (errorValue && typeof errorValue === 'object' && 'message' in errorValue) {
    const message = (errorValue as { message?: unknown }).message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return 'Upstream provider emitted response.error';
}

function summarizeChatRequest(payload: ChatRequest) {
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
    ).slice(0, 8)
  };
}

function summarizeEmbeddingsInput(input: EmbeddingsRequest['input']) {
  if (typeof input === 'string') {
    return {
      inputType: 'string',
      inputCount: 1
    } as const;
  }

  if (!Array.isArray(input)) {
    return {
      inputType: 'unknown',
      inputCount: 0
    } as const;
  }

  if (input.every((item) => typeof item === 'string')) {
    return {
      inputType: 'string_array',
      inputCount: input.length
    } as const;
  }

  if (input.every((item) => typeof item === 'number')) {
    return {
      inputType: 'number_array',
      inputCount: input.length
    } as const;
  }

  if (input.every((item) => Array.isArray(item))) {
    return {
      inputType: 'number_matrix',
      inputCount: input.length
    } as const;
  }

  return {
    inputType: 'unknown_array',
    inputCount: input.length
  } as const;
}

function summarizeRequestForLog(endpoint: GatewayEndpoint, payload: JsonGatewayPayload) {
  if (endpoint.endpointType === 'chat_completions') {
    return summarizeChatRequest(payload as ChatRequest);
  }

  if (endpoint.endpointType === 'embeddings') {
    return {
      model: (payload as EmbeddingsRequest).model,
      ...summarizeEmbeddingsInput((payload as EmbeddingsRequest).input)
    };
  }

  return summarizeResponseRequest(payload as ResponseRequest);
}

function resolveLogicalModelAlias(input: {
  gatewayToken: GatewayTokenContext;
  requestedModel?: string;
}) {
  if (input.requestedModel && input.requestedModel !== input.gatewayToken.logicalModelAlias) {
    throw new GatewayRouteError(404, {
      error: {
        message: 'Model route not found'
      }
    });
  }

  return input.requestedModel ?? input.gatewayToken.logicalModelAlias;
}

async function createStartedRequestLog(
  fastify: FastifyInstance,
  input: {
    gatewayToken: GatewayTokenContext;
    logicalModelAlias: string;
    endpoint: GatewayEndpoint;
    payload: JsonGatewayPayload;
  }
) {
  const db = (fastify as FastifyInstance & { db: AppDb }).db;
  const requestLogService = new RequestLogService(db);
  const requestLog = await requestLogService.createStartedLog({
    userId: input.gatewayToken.userId,
    apiTokenId: input.gatewayToken.id,
    endpointType: input.endpoint.endpointType,
    logicalModelAlias: input.logicalModelAlias,
    rawRequestSummary: summarizeRequestForLog(input.endpoint, input.payload)
  });

  return {
    db,
    requestLogService,
    requestLog
  };
}

async function proxyJsonRequest(
  fastify: FastifyInstance,
  input: {
    gatewayToken: GatewayTokenContext;
    payload: JsonGatewayPayload;
    endpoint: GatewayEndpoint;
    channelKeyEncryptionSecret: string;
    upstreamTimeoutMs: number;
    requestedModel?: string;
  }
) {
  const logicalModelAlias = resolveLogicalModelAlias({
    gatewayToken: input.gatewayToken,
    requestedModel: input.requestedModel
  });
  const { db, requestLogService, requestLog } = await createStartedRequestLog(fastify, {
    gatewayToken: input.gatewayToken,
    logicalModelAlias,
    endpoint: input.endpoint,
    payload: input.payload
  });
  let logFinalized = false;

  try {
    const routes = await resolveRoutesForAlias(db, {
      userId: input.gatewayToken.userId,
      alias: logicalModelAlias
    });

    if (routes.length === 0) {
      await requestLogService.markUpstreamError({
        requestLogId: requestLog.id,
        startedAt: requestLog.startedAt,
        errorSummary: 'No active route found for logical model alias',
        statusCode: 404
      });
      logFinalized = true;

      throw new GatewayRouteError(404, {
        error: {
          message: 'Model route not found'
        }
      });
    }

    let lastProviderError: ProviderClientError | null = null;

    for (const [routeIndex, route] of routes.entries()) {
      const upstreamModelId = route.upstreamModelId ?? logicalModelAlias;
      const payload = {
        ...input.payload,
        model: upstreamModelId
      };
      const attemptStartedAt = new Date();

      try {
        const result = await forwardJsonRequest({
          baseUrl: route.baseUrl,
          path: input.endpoint.path,
          apiKey: decryptChannelSecret(route.apiKeyEncrypted, input.channelKeyEncryptionSecret),
          payload,
          timeoutMs: input.upstreamTimeoutMs
        });
        const usageMetrics = classifyUsageForSettlement(
          input.endpoint,
          input.endpoint.endpointType === 'responses'
            ? getResponsesUsageMetrics(result.body)
            : getUsageMetrics(result.body)
        );

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
          statusCode: result.status,
          finalChannelId: route.channelId,
          finalRouteId: route.routeId,
          finalUpstreamModelId: upstreamModelId,
          eventSummaryJson: summarizeJsonResponseForLog({
            endpoint: input.endpoint,
            body: result.body,
            usageMetrics
          }),
          isUsageSettleable: usageMetrics.isUsageSettleable,
          rawUsageJson: usageMetrics.rawUsageJson,
          rawUpstreamPriceUsd: extractRawUpstreamPriceUsd(result.body),
          inputTokens: usageMetrics.inputTokens,
          outputTokens: usageMetrics.outputTokens,
          inputPricePer1m: route.inputPricePer1m,
          outputPricePer1m: route.outputPricePer1m,
          currency: route.currency
        });
        logFinalized = true;

        return result;
      } catch (error) {
        if (!(error instanceof ProviderClientError)) {
          throw error;
        }

        await requestLogService.recordAttempt({
          requestLogId: requestLog.id,
          channelId: route.channelId,
          routeId: route.routeId,
          attemptIndex: routeIndex + 1,
          attemptStatus: 'failed',
          failureStage: mapAttemptFailureStage(error),
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

    throw new GatewayRouteError(502, {
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
        statusCode: error instanceof GatewayRouteError ? error.statusCode : 500
      });
      logFinalized = true;
    }

    if (error instanceof GatewayRouteError) {
      throw error;
    }

    throw new GatewayRouteError(500, {
      error: {
        message: 'Internal Server Error'
      }
    });
  }
}

async function proxyStreamingResponsesRequest(
  fastify: FastifyInstance,
  reply: FastifyReply,
  input: {
    gatewayToken: GatewayTokenContext;
    payload: ResponseRequest;
    channelKeyEncryptionSecret: string;
    upstreamTimeoutMs: number;
  }
) {
  const logicalModelAlias = resolveLogicalModelAlias({
    gatewayToken: input.gatewayToken,
    requestedModel: input.payload.model
  });
  const endpoint: GatewayEndpoint = {
    endpointType: 'responses',
    path: '/responses'
  };
  const { db, requestLogService, requestLog } = await createStartedRequestLog(fastify, {
    gatewayToken: input.gatewayToken,
    logicalModelAlias,
    endpoint,
    payload: input.payload
  });
  let logFinalized = false;

  try {
    const routes = await resolveRoutesForAlias(db, {
      userId: input.gatewayToken.userId,
      alias: logicalModelAlias
    });

    if (routes.length === 0) {
      await requestLogService.markUpstreamError({
        requestLogId: requestLog.id,
        startedAt: requestLog.startedAt,
        errorSummary: 'No active route found for logical model alias',
        statusCode: 404
      });
      logFinalized = true;

      throw new GatewayRouteError(404, {
        error: {
          message: 'Model route not found'
        }
      });
    }

    let lastProviderError: ProviderClientError | null = null;

    for (const [routeIndex, route] of routes.entries()) {
      const upstreamModelId = route.upstreamModelId ?? logicalModelAlias;
      const payload = {
        ...input.payload,
        model: upstreamModelId
      };
      const attemptStartedAt = new Date();

      try {
        const result = await forwardStreamingRequest({
          baseUrl: route.baseUrl,
          path: '/responses',
          apiKey: decryptChannelSecret(route.apiKeyEncrypted, input.channelKeyEncryptionSecret),
          payload,
          timeoutMs: input.upstreamTimeoutMs
        });

        if (result.kind === 'json') {
          const usageMetrics = classifyUsageForSettlement(
            endpoint,
            getResponsesUsageMetrics(result.body)
          );

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
            statusCode: result.status,
            finalChannelId: route.channelId,
            finalRouteId: route.routeId,
            finalUpstreamModelId: upstreamModelId,
            eventSummaryJson: summarizeJsonResponseForLog({
              endpoint,
              body: result.body,
              usageMetrics
            }),
            isUsageSettleable: usageMetrics.isUsageSettleable,
            rawUsageJson: usageMetrics.rawUsageJson,
            rawUpstreamPriceUsd: extractRawUpstreamPriceUsd(result.body),
            inputTokens: usageMetrics.inputTokens,
            outputTokens: usageMetrics.outputTokens,
            inputPricePer1m: route.inputPricePer1m,
            outputPricePer1m: route.outputPricePer1m,
            currency: route.currency
          });
          logFinalized = true;

          reply.status(result.status).send(result.body);
          return;
        }

        const firstChunk = await result.read();

        if (firstChunk.done || !firstChunk.value || firstChunk.value.length === 0) {
          result.dispose();
          throw new ProviderClientError(
            'INVALID_RESPONSE',
            'Upstream provider closed the stream before the first SSE byte'
          );
        }

        const decoder = new TextDecoder();
        let sawDone = false;
        let sawCompleted = false;
        let clientStreamStarted = false;
        let rawUpstreamPriceUsd: number | null = null;
        let usageMetrics = {
          rawUsageJson: null as unknown,
          inputTokens: null as number | null,
          outputTokens: null as number | null,
          isUsageSettleable: false
        };
        const eventSummary = createResponsesStreamEventSummary();
        const parser = createSseFrameParser((frame) => {
          if (frame.data === '[DONE]') {
            sawDone = true;
            eventSummary.sawDone = true;
            return;
          }

          let parsedEvent: ReturnType<typeof responseStreamEventSchema.parse>;

          try {
            parsedEvent = responseStreamEventSchema.parse(JSON.parse(frame.data));
          } catch {
            throw new Error(MALFORMED_SSE_EVENT_MESSAGE);
          }

          if (parsedEvent.type === 'response.error') {
            throw new Error(getResponseErrorMessage(parsedEvent));
          }

          updateResponsesStreamEventSummary(eventSummary, parsedEvent);

          if (parsedEvent.type === 'response.completed') {
            sawCompleted = true;
            eventSummary.sawCompleted = true;
            usageMetrics = classifyUsageForSettlement(
              endpoint,
              getResponsesCompletedUsage(parsedEvent)
            );
            eventSummary.usageReported = usageMetrics.rawUsageJson !== null;
            rawUpstreamPriceUsd = extractRawUpstreamPriceUsd(parsedEvent);
          }
        });

        const startClientStream = () => {
          if (clientStreamStarted) {
            return;
          }

          reply.hijack();
          reply.raw.statusCode = result.status;
          reply.raw.setHeader('content-type', 'text/event-stream; charset=utf-8');
          reply.raw.setHeader('cache-control', 'no-cache, no-transform');
          reply.raw.setHeader('connection', 'keep-alive');
          reply.raw.flushHeaders?.();
          clientStreamStarted = true;
        };

        const canWriteToClient = () => !reply.raw.writableEnded && !reply.raw.destroyed;

        const writeChunk = async (chunk: Uint8Array) => {
          parser.push(decoder.decode(chunk, { stream: true }));

          startClientStream();
          await writeSseChunk(reply.raw, Buffer.from(chunk));
        };

        try {
          await writeChunk(firstChunk.value);

          while (true) {
            if (sawDone) {
              break;
            }

            const chunk = await result.read();

            if (chunk.done) {
              break;
            }

            if (chunk.value && chunk.value.length > 0) {
              await writeChunk(chunk.value);
            }
          }

          parser.finish();

          if (!sawDone && !sawCompleted) {
            throw new Error('Upstream provider ended the stream without a completion signal');
          }

          if (!sawDone) {
            await writeSseChunk(reply.raw, encodeSseEvent({ data: '[DONE]' }));
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
            statusCode: result.status,
            finalChannelId: route.channelId,
            finalRouteId: route.routeId,
            finalUpstreamModelId: upstreamModelId,
            eventSummaryJson: eventSummary,
            isUsageSettleable: usageMetrics.isUsageSettleable,
            rawUsageJson: usageMetrics.rawUsageJson,
            rawUpstreamPriceUsd,
            inputTokens: usageMetrics.inputTokens,
            outputTokens: usageMetrics.outputTokens,
            inputPricePer1m: route.inputPricePer1m,
            outputPricePer1m: route.outputPricePer1m,
            currency: route.currency
          });
          result.dispose();
          if (canWriteToClient()) {
            reply.raw.end();
          }
          logFinalized = true;
          return;
        } catch (error) {
          result.dispose();

          try {
            parser.finish();
          } catch {
            // Preserve the original stream failure and continue closing the client stream.
          }

          if (!clientStreamStarted) {
            throw new ProviderClientError(
              'INVALID_RESPONSE',
              error instanceof Error ? error.message : 'Upstream provider returned a malformed SSE event'
            );
          }

          if (canWriteToClient()) {
            try {
              await writeSseChunk(
                reply.raw,
                encodeSseJsonEvent({
                  event: 'response.error',
                  data: buildResponsesStreamErrorEvent(summarizeUnexpectedError(error))
                })
              );

              if (!sawDone && canWriteToClient()) {
                await writeSseChunk(reply.raw, encodeSseEvent({ data: '[DONE]' }));
              }
            } catch (writeError) {
              if (
                !(writeError instanceof Error) ||
                writeError.message !== createSseWriteError('Client stream closed before drain').message
              ) {
                throw writeError;
              }
            }
          }

          await requestLogService.recordAttempt({
            requestLogId: requestLog.id,
            channelId: route.channelId,
            routeId: route.routeId,
            attemptIndex: routeIndex + 1,
            attemptStatus: 'failed',
            failureStage: mapStreamingFailureStage(error),
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
            eventSummaryJson: eventSummary,
            rawUsageJson: usageMetrics.rawUsageJson,
            inputTokens: usageMetrics.inputTokens,
            outputTokens: usageMetrics.outputTokens
          });
          if (canWriteToClient()) {
            reply.raw.end();
          }
          logFinalized = true;
          return;
        }
      } catch (error) {
        if (!(error instanceof ProviderClientError)) {
          throw error;
        }

        await requestLogService.recordAttempt({
          requestLogId: requestLog.id,
          channelId: route.channelId,
          routeId: route.routeId,
          attemptIndex: routeIndex + 1,
          attemptStatus: 'failed',
          failureStage: mapAttemptFailureStage(error),
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

    throw new GatewayRouteError(502, {
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
        statusCode: error instanceof GatewayRouteError ? error.statusCode : 500
      });
      logFinalized = true;
    }

    if (error instanceof GatewayRouteError) {
      throw error;
    }

    throw new GatewayRouteError(500, {
      error: {
        message: 'Internal Server Error'
      }
    });
  }
}

function sendGatewayError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.status(400).send({ error: 'Bad Request' });
    return;
  }

  if (error instanceof GatewayRouteError) {
    reply.status(error.statusCode).send(error.body);
    return;
  }

  throw error;
}

function rejectUnsupportedStreamingRequest(
  payload: ChatRequest | EmbeddingsRequest
): asserts payload is ChatRequest | EmbeddingsRequest {
  if ('stream' in payload && payload.stream === true) {
    throw new GatewayRouteError(400, { error: 'Bad Request' });
  }
}

function rejectUnsupportedChatToolingRequest(payload: ChatRequest): asserts payload is ChatRequest {
  const unsupportedKeys = ['tools', 'tool_choice', 'functions', 'function_call'] as const;

  if (unsupportedKeys.some((key) => Object.prototype.hasOwnProperty.call(payload, key))) {
    throw new GatewayRouteError(400, { error: 'Bad Request' });
  }
}

export async function registerOpenAiRoutes(
  fastify: FastifyInstance,
  options: { channelKeyEncryptionSecret: string; upstreamTimeoutMs: number }
) {
  fastify.post(
    '/v1/chat/completions',
    { preHandler: [fastify.requireGatewayToken] },
    async (request, reply) => {
      try {
        const body = chatRequestSchema.parse(request.body);
        rejectUnsupportedStreamingRequest(body);
        rejectUnsupportedChatToolingRequest(body);
        const result = await proxyJsonRequest(fastify, {
          gatewayToken: request.gatewayToken!,
          payload: body,
          endpoint: {
            endpointType: 'chat_completions',
            path: '/chat/completions'
          },
          requestedModel: body.model,
          channelKeyEncryptionSecret: options.channelKeyEncryptionSecret,
          upstreamTimeoutMs: options.upstreamTimeoutMs
        });

        reply.status(result.status).send(result.body);
      } catch (error) {
        sendGatewayError(error, reply);
      }
    }
  );

  fastify.post('/v1/embeddings', { preHandler: [fastify.requireGatewayToken] }, async (request, reply) => {
    try {
      const body = embeddingsRequestSchema.parse(request.body);
      const result = await proxyJsonRequest(fastify, {
        gatewayToken: request.gatewayToken!,
        payload: body,
        endpoint: {
          endpointType: 'embeddings',
          path: '/embeddings'
        },
        requestedModel: body.model,
        channelKeyEncryptionSecret: options.channelKeyEncryptionSecret,
        upstreamTimeoutMs: options.upstreamTimeoutMs
      });

      reply.status(result.status).send(result.body);
    } catch (error) {
      sendGatewayError(error, reply);
    }
  });

  fastify.post('/v1/responses', { preHandler: [fastify.requireGatewayToken] }, async (request, reply) => {
    try {
      const body = responseRequestSchema.parse(request.body);

      if (body.stream === true) {
        await proxyStreamingResponsesRequest(fastify, reply, {
          gatewayToken: request.gatewayToken!,
          payload: body,
          channelKeyEncryptionSecret: options.channelKeyEncryptionSecret,
          upstreamTimeoutMs: options.upstreamTimeoutMs
        });
        return;
      }

      const result = await proxyJsonRequest(fastify, {
        gatewayToken: request.gatewayToken!,
        payload: body,
        endpoint: {
          endpointType: 'responses',
          path: '/responses'
        },
        requestedModel: body.model,
        channelKeyEncryptionSecret: options.channelKeyEncryptionSecret,
        upstreamTimeoutMs: options.upstreamTimeoutMs
      });

      reply.status(result.status).send(result.body);
    } catch (error) {
      sendGatewayError(error, reply);
    }
  });
}
