import type { FailureStage, JsonValue, RequestStatus, RouteAttemptStatus } from './api-client';

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function formatUsd(value: string | null | undefined) {
  if (!value) {
    return '--';
  }

  const numeric = Number.parseFloat(value);

  if (Number.isNaN(numeric)) {
    return '--';
  }

  return `$${numeric.toFixed(4)}`;
}

export function parseUsd(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value);
  return Number.isNaN(numeric) ? 0 : numeric;
}

export function formatDuration(value: number | null | undefined) {
  if (value == null) {
    return '--';
  }

  return `${value} ms`;
}

export function formatTokenSummary(inputTokens: number | null | undefined, outputTokens: number | null | undefined) {
  if (inputTokens == null && outputTokens == null) {
    return '--';
  }

  return `输入 ${inputTokens ?? '--'} / 输出 ${outputTokens ?? '--'}`;
}

export function getRequestStatusLabel(status: RequestStatus) {
  switch (status) {
    case 'in_progress':
      return '进行中';
    case 'success':
      return '成功';
    case 'upstream_error':
      return '上游错误';
    case 'stream_failed':
      return '流中断';
    case 'validation_failed':
      return '参数错误';
    case 'quota_rejected':
      return '额度拒绝';
    case 'review_required':
      return '需复核';
    default:
      return status;
  }
}

export function getAttemptStatusLabel(status: RouteAttemptStatus) {
  return status === 'succeeded' ? '成功' : '失败';
}

export function getFailureStageLabel(stage: FailureStage | null | undefined) {
  switch (stage) {
    case 'connect':
      return '连接建立';
    case 'handshake':
      return '握手阶段';
    case 'upstream_error':
      return '上游返回错误';
    case 'timeout':
      return '上游超时';
    case 'protocol_parse':
      return '协议解析';
    default:
      return '--';
  }
}

export function formatJson(value: JsonValue | null | undefined) {
  if (value == null) {
    return '--';
  }

  return JSON.stringify(value, null, 2);
}
