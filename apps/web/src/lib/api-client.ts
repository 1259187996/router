export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticatedUser {
  id?: string;
  email: string;
  displayName?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'disabled';
}

export interface LoginResponse {
  user: AuthenticatedUser;
}

export interface CurrentUserResponse {
  user: AuthenticatedUser | null;
}

export interface ChannelRecord {
  id: string;
  name: string;
  baseUrl: string;
  defaultModelId: string;
  status: 'active' | 'disabled';
  lastTestStatus: string | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListChannelsResponse {
  channels: ChannelRecord[];
}

export interface CreateChannelInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModelId: string;
}

export interface CreateChannelResponse {
  channel: ChannelRecord;
}

export interface LogicalModelRouteRecord {
  id: string;
  channelId: string;
  upstreamModelId: string | null;
  inputPricePer1m: string;
  outputPricePer1m: string;
  currency: string;
  priority: number;
  status: 'active' | 'disabled';
  channelName: string;
}

export interface LogicalModelRecord {
  id: string;
  alias: string;
  description: string;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  routes: LogicalModelRouteRecord[];
}

export interface ListLogicalModelsResponse {
  logicalModels: LogicalModelRecord[];
}

export interface CreateLogicalModelInput {
  alias: string;
  description: string;
  routes: Array<{
    channelId: string;
    upstreamModelId: string;
    inputPricePer1m: string;
    outputPricePer1m: string;
    currency: string;
    priority: number;
  }>;
}

export interface CreateLogicalModelResponse {
  logicalModel: LogicalModelRecord;
  routes: LogicalModelRouteRecord[];
}

export interface TestChannelResponse {
  ok: boolean;
}

export interface TokenRecord {
  id: string;
  name: string;
  logicalModelId: string;
  budgetLimitUsd: string;
  budgetUsedUsd: string;
  budgetStatus: 'available' | 'exhausted';
  status: 'active' | 'revoked' | 'expired' | 'exhausted';
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  rawToken?: string;
}

export interface ListTokensResponse {
  tokens: TokenRecord[];
}

export interface CreateTokenInput {
  name: string;
  logicalModelId: string;
  budgetLimitUsd: string;
  expiresAt?: string;
}

export interface CreateTokenResponse {
  token: TokenRecord;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type RequestStatus =
  | 'in_progress'
  | 'success'
  | 'upstream_error'
  | 'stream_failed'
  | 'validation_failed'
  | 'quota_rejected'
  | 'review_required';

export type RouteAttemptStatus = 'failed' | 'succeeded';

export type FailureStage =
  | 'connect'
  | 'handshake'
  | 'upstream_error'
  | 'timeout'
  | 'protocol_parse';

export interface RequestLogRecord {
  id: string;
  endpointType: string;
  logicalModelAlias: string;
  finalUpstreamModelId: string | null;
  requestStatus: RequestStatus;
  httpStatusCode: number | null;
  rawUpstreamPriceUsd: string | null;
  settlementPriceUsd: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  errorSummary: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface ListLogsResponse {
  logs: RequestLogRecord[];
}

export interface LogDetailChannelRecord {
  id: string;
  name: string;
  baseUrl: string;
  defaultModelId: string;
  status: 'active' | 'disabled';
}

export interface LogDetailRouteRecord {
  id: string;
  upstreamModelId: string | null;
  inputPricePer1m: string;
  outputPricePer1m: string;
  currency: string;
  priority: number;
  status: 'active' | 'disabled';
}

export interface LogAttemptRecord {
  id: string;
  requestLogId: string;
  attemptIndex: number;
  attemptStatus: RouteAttemptStatus;
  failureStage: FailureStage | null;
  errorSummary: string | null;
  startedAt: string;
  finishedAt: string;
  channel: LogDetailChannelRecord;
  route: LogDetailRouteRecord;
}

export interface LogDetailRecord extends RequestLogRecord {
  rawRequestSummary: JsonValue | null;
  rawUsageJson: JsonValue | null;
  eventSummaryJson: JsonValue | null;
}

export interface LogDetailResponse {
  log: LogDetailRecord;
  finalChannel: LogDetailChannelRecord | null;
  finalRoute: LogDetailRouteRecord | null;
  attempts: LogAttemptRecord[];
}

async function requestJson<T>(path: string, init: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestVoid(path: string, init: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }
}

export const apiClient = {
  login(input: LoginInput) {
    return requestJson<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getCurrentUser() {
    const response = await fetch('/auth/me', {
      credentials: 'include',
      headers: {
        accept: 'application/json',
      },
    });

    if (response.status === 401) {
      return {
        user: null,
      } satisfies CurrentUserResponse;
    }

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    return (await response.json()) as CurrentUserResponse;
  },

  listChannels() {
    return requestJson<ListChannelsResponse>('/internal/channels', {
      method: 'GET',
    });
  },

  createChannel(input: CreateChannelInput) {
    return requestJson<CreateChannelResponse>('/internal/channels', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  testChannel(channelId: string) {
    return requestJson<TestChannelResponse>(`/internal/channels/${channelId}/test`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  listLogicalModels() {
    return requestJson<ListLogicalModelsResponse>('/internal/logical-models', {
      method: 'GET',
    });
  },

  createLogicalModel(input: CreateLogicalModelInput) {
    return requestJson<CreateLogicalModelResponse>('/internal/logical-models', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listTokens() {
    return requestJson<ListTokensResponse>('/internal/tokens', {
      method: 'GET',
    });
  },

  createToken(input: CreateTokenInput) {
    return requestJson<CreateTokenResponse>('/internal/tokens', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  revokeToken(tokenId: string) {
    return requestVoid(`/internal/tokens/${tokenId}`, {
      method: 'DELETE',
    });
  },

  listLogs() {
    return requestJson<ListLogsResponse>('/internal/logs', {
      method: 'GET',
    });
  },

  getLogDetail(logId: string) {
    return requestJson<LogDetailResponse>(`/internal/logs/${logId}`, {
      method: 'GET',
    });
  },
};

export type AppApi = typeof apiClient;
