type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const toneClassName: Record<StatusTone, string> = {
  success: 'border-brand/15 bg-[rgba(18,70,61,0.12)] text-accent',
  warning: 'border-alert/15 bg-[rgba(141,77,35,0.12)] text-alert',
  danger: 'border-alert/20 bg-[rgba(141,77,35,0.16)] text-alert',
  neutral: 'border-line-soft bg-white/72 text-ink-soft',
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
