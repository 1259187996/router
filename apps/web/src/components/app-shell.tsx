import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

const navItems = [
  { label: '总览', to: '/' as const, activeOnly: true },
  { label: '渠道策略', to: '/channels' as const },
  { label: '令牌管理', to: '/tokens' as const },
  { label: '请求日志', to: '/logs' as const },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-4 sm:p-6">
        <aside className="surface-panel grid-glow hidden w-[296px] shrink-0 rounded-[30px] p-5 text-sm lg:flex lg:flex-col">
          <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,rgba(18,70,61,0.12),rgba(255,255,255,0.74))] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-brand">Router Ops</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-brand-strong">
              控制台驾驶舱
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              聚合渠道状态、逻辑模型路由、令牌资产与请求审计，用统一视角管理 LLM 出口。
            </p>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                activeProps={{
                  className:
                    'border-brand/15 bg-brand text-white shadow-[0_18px_40px_-28px_rgba(18,70,61,0.78)]',
                }}
                activeOptions={{ exact: item.activeOnly }}
                className="flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 font-medium text-ink transition hover:border-line-strong hover:bg-white/70"
              >
                <span>{item.label}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-current/70">
                  Live
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.06)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">Console Baseline</p>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              渠道、令牌与请求日志面板已接入，费用与链路审计可以在同一套视觉系统里查看。
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="surface-panel flex flex-col gap-4 rounded-[30px] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-brand">
                Router Operations Console
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                统一接入面的控制平面
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-brand/10 bg-brand px-4 py-2 text-sm font-medium text-white">
                Session Ready
              </div>
              <div className="surface-card rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-ink-soft">
                CN / OPS
              </div>
            </div>
          </header>

          <main className="min-h-[calc(100vh-8rem)]">{children}</main>
        </div>
      </div>
    </div>
  );
}
