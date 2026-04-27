import type { ReactNode } from 'react';

export function DataTable({
  caption,
  children,
}: {
  caption?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-line-soft bg-white shadow-[0_12px_36px_-28px_rgba(10,34,29,0.18)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm text-ink">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          {children}
        </table>
      </div>
    </div>
  );
}
