import type { ReactNode } from 'react';

export function DataTable({
  caption,
  children,
}: {
  caption?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-line-soft bg-white/72">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          {children}
        </table>
      </div>
    </div>
  );
}
