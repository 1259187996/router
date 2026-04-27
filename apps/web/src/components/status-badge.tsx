type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const toneClassName: Record<StatusTone, string> = {
  success: 'app-status-badge--success',
  warning: 'app-status-badge--warning',
  danger: 'app-status-badge--danger',
  neutral: 'app-status-badge--neutral',
};

function getTone(status: string) {
  if (
    status === 'active' ||
    status === 'ok' ||
    status === 'available' ||
    status === 'success' ||
    status === 'succeeded'
  ) {
    return 'success';
  }

  if (
    status === 'failed' ||
    status === 'revoked' ||
    status === 'upstream_error' ||
    status === 'stream_failed' ||
    status === 'validation_failed' ||
    status === 'quota_rejected'
  ) {
    return 'danger';
  }

  if (status === 'exhausted' || status === 'expired' || status === 'review_required') {
    return 'warning';
  }

  return 'neutral';
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = getTone(status);

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em]',
        toneClassName[tone],
      ].join(' ')}
    >
      {label ?? status}
    </span>
  );
}
