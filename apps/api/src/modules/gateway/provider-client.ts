export class ProviderClientError extends Error {
  constructor(readonly code: 'NETWORK' | 'INVALID_RESPONSE' | 'TIMEOUT', message: string) {
    super(message);
  }
}

type ProviderPath = '/chat/completions' | '/embeddings' | '/responses';

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
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? 30_000;
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
    response = await fetch(buildProviderUrl(input.baseUrl, input.path), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify(input.payload),
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
  timeoutMs?: number;
}) {
  const { response, clearRequestTimeout } = await fetchProviderResponse(input);
  let body: unknown;

  try {
    body = await parseJsonBody(response, clearRequestTimeout);
  } catch (error) {
    throw error;
  }

  return {
    status: response.status,
    body
  };
}

export async function forwardStreamingRequest(input: {
  baseUrl: string;
  path: '/responses';
  apiKey: string;
  payload: unknown;
  timeoutMs?: number;
}): Promise<StreamJsonResult | StreamSseResult> {
  const { response, controller, timeoutMs, clearRequestTimeout, armRequestTimeout } =
    await fetchProviderResponse(input);
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('text/event-stream')) {
    return {
      kind: 'json',
      status: response.status,
      body: await parseJsonBody(response, clearRequestTimeout)
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
