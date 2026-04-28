import {
  channelProviderIds,
  getChannelProviderConfig,
  type ChannelProvider,
  type ChatRequest,
  type ResponseRequest
} from '@router/shared';

export class ProviderClientError extends Error {
  constructor(readonly code: 'NETWORK' | 'INVALID_RESPONSE' | 'TIMEOUT', message: string) {
    super(message);
  }
}

type ProviderPath = '/chat/completions' | '/embeddings' | '/responses' | '/messages';

type StreamJsonResult = {
  kind: 'json';
  status: number;
  body: unknown;
};

type StreamSseResult = {
  kind: 'sse';
  status: number;
  headers: Headers;
  read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  dispose: () => void;
};

function buildProviderUrl(baseUrl: string, path: ProviderPath) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), normalizedBaseUrl);
}

async function fetchProviderResponse(input: {
  baseUrl: string;
  path: ProviderPath;
  apiKey: string;
  payload: unknown;
  provider?: string;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 30_000;
  const providerConfig = getChannelProviderConfig(normalizeChannelProvider(input.provider));
  const request = buildProviderRequest({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    path: input.path,
    payload: input.payload,
    protocol: providerConfig.protocol
  });
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const clearRequestTimeout = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  const armRequestTimeout = () => {
    clearRequestTimeout();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  };
  let response: Response;

  armRequestTimeout();

  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.payload),
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    clearRequestTimeout();

    if (controller.signal.aborted) {
      throw new ProviderClientError('TIMEOUT', `Upstream provider timed out after ${timeoutMs}ms`);
    }

    throw new ProviderClientError(
      'NETWORK',
      error instanceof Error ? error.message : 'Failed to reach upstream provider'
    );
  }

  return {
    response,
    controller,
    provider: providerConfig.id,
    endpointPath: input.path,
    timeoutMs,
    clearRequestTimeout,
    armRequestTimeout
  };
}

async function parseJsonBody(response: Response, clearRequestTimeout: () => void) {
  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    clearRequestTimeout();
    throw new ProviderClientError(
      'INVALID_RESPONSE',
      error instanceof Error ? error.message : 'Upstream provider returned invalid JSON'
    );
  }

  clearRequestTimeout();

  return body;
}

export async function forwardJsonRequest(input: {
  baseUrl: string;
  path: ProviderPath;
  apiKey: string;
  payload: unknown;
  provider?: string;
  timeoutMs?: number;
}) {
  const { response, provider, endpointPath, clearRequestTimeout } = await fetchProviderResponse(input);
  let body: unknown;

  try {
    body = await parseJsonBody(response, clearRequestTimeout);
  } catch (error) {
    throw error;
  }

  return {
    status: response.status,
    body: normalizeProviderResponse({
      body,
      endpointPath,
      provider,
      requestedPayload: input.payload,
      status: response.status
    })
  };
}

export async function forwardStreamingRequest(input: {
  baseUrl: string;
  path: '/responses';
  apiKey: string;
  payload: unknown;
  provider?: string;
  timeoutMs?: number;
}): Promise<StreamJsonResult | StreamSseResult> {
  const { response, provider, endpointPath, controller, timeoutMs, clearRequestTimeout, armRequestTimeout } =
    await fetchProviderResponse(input);
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('text/event-stream')) {
    const body = await parseJsonBody(response, clearRequestTimeout);

    return {
      kind: 'json',
      status: response.status,
      body: normalizeProviderResponse({
        body,
        endpointPath,
        provider,
        requestedPayload: input.payload,
        status: response.status
      })
    };
  }

  if (!response.body) {
    clearRequestTimeout();
    throw new ProviderClientError('INVALID_RESPONSE', 'Upstream provider returned an empty stream');
  }

  const reader = response.body.getReader();

  return {
    kind: 'sse',
    status: response.status,
    headers: response.headers,
    async read() {
      armRequestTimeout();

      try {
        const chunk = await reader.read();
        clearRequestTimeout();

        return chunk;
      } catch (error) {
        clearRequestTimeout();

        if (controller.signal.aborted) {
          throw new ProviderClientError(
            'TIMEOUT',
            `Upstream provider timed out after ${timeoutMs}ms`
          );
        }

        throw new ProviderClientError(
          'NETWORK',
          error instanceof Error ? error.message : 'Failed to read upstream stream'
        );
      }
    },
    dispose() {
      clearRequestTimeout();
      controller.abort();
      void reader.cancel().catch(() => undefined);
    }
  };
}

function normalizeChannelProvider(provider: string | undefined): ChannelProvider {
  if (provider && (channelProviderIds as readonly string[]).includes(provider)) {
    return provider as ChannelProvider;
  }

  return 'openai-compatible';
}

function buildProviderRequest(input: {
  apiKey: string;
  baseUrl: string;
  path: ProviderPath;
  payload: unknown;
  protocol: 'openai-compatible' | 'anthropic-messages';
}) {
  if (input.protocol === 'anthropic-messages') {
    if (input.path === '/embeddings') {
      throw new ProviderClientError('INVALID_RESPONSE', 'Anthropic does not support embeddings');
    }

    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': input.apiKey
    };

    return {
      url: buildProviderUrl(input.baseUrl, '/messages'),
      headers,
      payload: toAnthropicMessagesPayload(input.payload)
    };
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${input.apiKey}`
  };

  return {
    url: buildProviderUrl(input.baseUrl, input.path),
    headers,
    payload: input.payload
  };
}

function normalizeProviderResponse(input: {
  body: unknown;
  endpointPath: ProviderPath;
  provider: ChannelProvider;
  requestedPayload: unknown;
  status: number;
}) {
  const providerConfig = getChannelProviderConfig(input.provider);

  if (providerConfig.protocol !== 'anthropic-messages' || input.status < 200 || input.status >= 300) {
    return input.body;
  }

  if (input.endpointPath === '/chat/completions') {
    return anthropicMessageToChatCompletion(input.body);
  }

  if (input.endpointPath === '/responses') {
    return anthropicMessageToResponse(input.body);
  }

  return input.body;
}

function toAnthropicMessagesPayload(payload: unknown) {
  if (isChatRequest(payload)) {
    return chatCompletionToAnthropicMessages(payload);
  }

  if (isResponseRequest(payload)) {
    return responseToAnthropicMessages(payload);
  }

  throw new ProviderClientError('INVALID_RESPONSE', 'Unsupported Anthropic request payload');
}

function isChatRequest(payload: unknown): payload is ChatRequest {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    Array.isArray((payload as { messages?: unknown }).messages)
  );
}

function isResponseRequest(payload: unknown): payload is ResponseRequest {
  return payload !== null && typeof payload === 'object' && 'input' in payload;
}

function chatCompletionToAnthropicMessages(payload: ChatRequest) {
  const system = payload.messages
    .filter((message) => message.role === 'system')
    .map((message) => textFromContent(message.content))
    .filter((content) => content.length > 0)
    .join('\n\n');
  const messages = payload.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: textFromContent(message.content)
    }))
    .filter((message) => message.content.length > 0);

  return {
    model: payload.model,
    ...(system ? { system } : {}),
    messages: messages.length > 0 ? messages : [{ role: 'user', content: 'ping' }],
    max_tokens: getMaxTokens(payload)
  };
}

function responseToAnthropicMessages(payload: ResponseRequest) {
  const system =
    typeof payload.instructions === 'string' && payload.instructions.trim().length > 0
      ? payload.instructions.trim()
      : undefined;
  const messages = messagesFromResponseInput(payload.input);

  return {
    model: payload.model,
    ...(system ? { system } : {}),
    messages: messages.length > 0 ? messages : [{ role: 'user', content: 'ping' }],
    max_tokens: getMaxTokens(payload)
  };
}

function messagesFromResponseInput(input: ResponseRequest['input']) {
  if (typeof input === 'string') {
    return [{ role: 'user' as const, content: input }];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (typeof item === 'string') {
        return {
          role: 'user' as const,
          content: item
        };
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const role = record.role === 'assistant' ? 'assistant' : 'user';
      const content = textFromContent(record.content ?? record.text ?? record.input_text);

      if (!content) {
        return null;
      }

      return {
        role,
        content
      };
    })
    .filter((message): message is { role: 'user' | 'assistant'; content: string } =>
      Boolean(message)
    );
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object') {
        return '';
      }

      const record = item as Record<string, unknown>;

      if (typeof record.text === 'string') {
        return record.text;
      }

      if (typeof record.input_text === 'string') {
        return record.input_text;
      }

      return '';
    })
    .filter((part) => part.length > 0)
    .join('\n');
}

function getMaxTokens(payload: Record<string, unknown>) {
  const candidate = payload.max_tokens ?? payload.max_completion_tokens ?? payload.max_output_tokens;

  return typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0
    ? candidate
    : 1024;
}

function anthropicMessageToChatCompletion(body: unknown) {
  const record = requireAnthropicMessageBody(body);
  const usage = getAnthropicUsage(record);
  const completionTokens = usage.outputTokens ?? 0;
  const promptTokens = usage.inputTokens ?? 0;
  const cachedTokens = usage.cachedInputTokens ?? 0;

  return {
    id: typeof record.id === 'string' ? record.id : `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: typeof record.model === 'string' ? record.model : '',
    choices: [
      {
        index: 0,
        finish_reason: mapAnthropicStopReason(record.stop_reason),
        message: {
          role: 'assistant',
          content: textFromAnthropicContent(record.content)
        }
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      prompt_tokens_details: {
        cached_tokens: cachedTokens
      }
    }
  };
}

function anthropicMessageToResponse(body: unknown) {
  const record = requireAnthropicMessageBody(body);
  const usage = getAnthropicUsage(record);
  const inputTokens = usage.inputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const id = typeof record.id === 'string' ? record.id : `resp_${Date.now()}`;

  return {
    id,
    object: 'response',
    status: 'completed',
    model: typeof record.model === 'string' ? record.model : '',
    output: [
      {
        type: 'message',
        id: `${id}_message`,
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: textFromAnthropicContent(record.content)
          }
        ]
      }
    ],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      input_tokens_details: {
        cached_tokens: cachedInputTokens
      }
    }
  };
}

function requireAnthropicMessageBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    throw new ProviderClientError('INVALID_RESPONSE', 'Anthropic returned invalid JSON');
  }

  return body as Record<string, unknown>;
}

function getAnthropicUsage(record: Record<string, unknown>) {
  const usage = record.usage && typeof record.usage === 'object'
    ? (record.usage as Record<string, unknown>)
    : {};
  const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : null;
  const cacheCreationInputTokens =
    typeof usage.cache_creation_input_tokens === 'number'
      ? usage.cache_creation_input_tokens
      : 0;
  const cachedInputTokens =
    typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;

  return {
    inputTokens:
      inputTokens === null ? null : inputTokens + cacheCreationInputTokens + cachedInputTokens,
    cachedInputTokens,
    outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null
  };
}

function textFromAnthropicContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const record = item as Record<string, unknown>;

      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .filter((part) => part.length > 0)
    .join('\n');
}

function mapAnthropicStopReason(stopReason: unknown) {
  if (stopReason === 'max_tokens') {
    return 'length';
  }

  return 'stop';
}
