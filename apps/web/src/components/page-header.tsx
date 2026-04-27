import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions, meta }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 rounded-[28px] bg-brand px-6 py-6 text-white shadow-[0_24px_60px_-34px_rgba(10,34,29,0.6)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-6 text-white/78">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {meta ? <div className="grid gap-3 md:grid-cols-3">{meta}</div> : null}
    </header>
  );
}
