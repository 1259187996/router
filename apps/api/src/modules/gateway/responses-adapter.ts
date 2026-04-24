import type { ResponseRequest } from '@router/shared';

function summarizeResponsesInput(input: ResponseRequest['input']) {
  if (typeof input === 'string') {
    return {
      inputType: 'string',
      inputCount: 1
    } as const;
  }

  if (!Array.isArray(input)) {
    return {
      inputType: 'none',
      inputCount: 0
    } as const;
  }

  return {
    inputType: 'array',
    inputCount: input.length
  } as const;
}

export function summarizeResponseRequest(payload: ResponseRequest) {
  const tools = Array.isArray(payload.tools) ? payload.tools : [];

  return {
    requestedModel: typeof payload.model === 'string' ? payload.model : null,
    stream: payload.stream === true,
    ...summarizeResponsesInput(payload.input),
    hasTools: tools.length > 0,
    toolCount: Math.min(tools.length, 16),
    toolTypes: Array.from(
      new Set(
        tools
          .map((tool) => (typeof tool.type === 'string' ? tool.type.slice(0, 32) : 'unknown'))
          .slice(0, 8)
      )
    ),
    toolChoiceType:
      typeof payload.tool_choice === 'string'
        ? payload.tool_choice.slice(0, 32)
        : payload.tool_choice && typeof payload.tool_choice === 'object'
          ? 'object'
          : null,
    hasPrompt: Boolean(payload.prompt),
    promptVariableCount:
      payload.prompt &&
      typeof payload.prompt === 'object' &&
      'variables' in payload.prompt &&
      payload.prompt.variables &&
      typeof payload.prompt.variables === 'object'
        ? Math.min(Object.keys(payload.prompt.variables as Record<string, unknown>).length, 32)
        : 0,
    hasPreviousResponseId: typeof payload.previous_response_id === 'string'
  };
}

export function getResponsesUsageMetrics(body: unknown) {
  const usage =
    body && typeof body === 'object'
      ? 'usage' in body
        ? (body as { usage?: unknown }).usage
        : 'response' in body &&
            (body as { response?: unknown }).response &&
            typeof (body as { response?: unknown }).response === 'object' &&
            'usage' in ((body as { response?: Record<string, unknown> }).response ?? {})
          ? ((body as { response?: { usage?: unknown } }).response ?? {}).usage
          : undefined
      : undefined;

  if (!usage || typeof usage !== 'object') {
    return {
      rawUsageJson: null,
      inputTokens: null,
      outputTokens: null
    };
  }

  const usageRecord = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };

  return {
    rawUsageJson: usage,
    inputTokens: typeof usageRecord.input_tokens === 'number' ? usageRecord.input_tokens : null,
    outputTokens: typeof usageRecord.output_tokens === 'number' ? usageRecord.output_tokens : null
  };
}

export function getResponsesCompletedUsage(eventData: unknown) {
  return getResponsesUsageMetrics(eventData);
}

export function buildResponsesStreamErrorEvent(message: string) {
  return {
    type: 'response.error',
    error: {
      message,
      type: 'server_error'
    }
  };
}
