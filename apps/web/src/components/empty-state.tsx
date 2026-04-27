import type { ReactNode } from 'react';

type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ eyebrow, title, description, action }: EmptyStateProps) {
  return (
    <div className="app-muted-surface flex min-h-[180px] flex-col items-start justify-between rounded-[24px] p-5">
      <div>
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
        ) : null}
        <h3 className={`${eyebrow ? 'mt-3' : ''} text-lg font-semibold tracking-tight text-brand-strong`}>
          {title}
        </h3>
        <p className="mt-2 max-w-[52ch] text-sm leading-6 text-ink-soft">{description}</p>
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
