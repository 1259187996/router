import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

const navItems = [
  { label: '总览', to: '/' as const, activeOnly: true, summary: '用量与异常' },
  { label: '渠道与路由', to: '/channels' as const, summary: '接入与策略' },
  { label: 'Key 与权限', to: '/tokens' as const, summary: '发放与预算' },
  { label: '请求日志', to: '/logs' as const, summary: '账本与排查' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-4 p-4 sm:p-6">
        <aside className="hidden w-[288px] shrink-0 rounded-[28px] bg-brand px-5 py-5 text-white lg:flex lg:flex-col">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/55">
              Router Console
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-white">
              LLM 分发与消耗账本
            </p>
            <p className="mt-3 text-sm leading-6 text-white/72">
              统一接入外部模型渠道，为团队分发 Key，并追踪 token 消耗。
            </p>
          </div>

          <nav aria-label="桌面端控制台导航" className="mt-6 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                activeProps={{
                  className:
                    'border-white/18 bg-white/14 text-white shadow-[0_18px_40px_-24px_rgba(3,15,14,0.45)]',
                }}
                activeOptions={{ exact: item.activeOnly }}
                className="block rounded-[22px] border border-white/8 px-4 py-4 transition hover:border-white/16 hover:bg-white/8"
              >
                <p className="text-sm font-semibold tracking-[0.01em]">{item.label}</p>
                <p className="mt-2 text-sm text-white/62">{item.summary}</p>
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-[24px] border border-white/10 bg-white/8 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
              Control Plane
            </p>
            <p className="mt-3 text-sm leading-6 text-white/72">
              先看总览，再进入渠道、Key 与日志页，把路由策略与消耗账本放进同一条运营视角。
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="app-surface flex flex-col gap-4 rounded-[28px] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-brand">
                Router Control Plane
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                企业模型出口控制台
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-brand/10 bg-brand px-4 py-2 text-sm font-medium text-white">
                Session Active
              </div>
              <div className="app-muted-surface rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-ink-soft">
                Token Ledger
              </div>
            </div>
          </header>

          <nav
            aria-label="移动端控制台导航"
            className="app-surface flex flex-col gap-3 rounded-[24px] px-4 py-4 lg:hidden"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">
                Console Routes
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                4 Entries
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  activeProps={{
                    className:
                      'border-brand/12 bg-brand text-white shadow-[0_16px_32px_-24px_rgba(18,70,61,0.82)]',
                  }}
                  activeOptions={{ exact: item.activeOnly }}
                  className="app-muted-surface block rounded-[20px] border border-transparent px-4 py-3 transition hover:border-line-strong hover:bg-white/70"
                >
                  <p className="text-sm font-semibold tracking-[0.01em]">{item.label}</p>
                  <p className="mt-1 text-sm text-current/68">{item.summary}</p>
                </Link>
              ))}
            </div>
          </nav>

          <main className="min-h-[calc(100vh-8rem)]">{children}</main>
        </div>
      </div>
    </div>
  );
}
