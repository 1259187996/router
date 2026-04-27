type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const toneClassName: Record<StatusTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
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
