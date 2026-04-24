import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient, type LoginInput } from '../lib/api-client';

type LoginApi = Pick<typeof apiClient, 'login'>;

const highlights = [
  ['统一渠道面板', '集中查看上游连通性、策略配置和流量走向。'],
  ['安全登录态', '基于服务端 Session Cookie，避免在浏览器暴露长期密钥。'],
  ['运营视图基线', '为后续的日志、令牌与计费页面提供一致视觉骨架。'],
];

export function LoginRouteComponent({
  api = apiClient,
  onAuthenticated,
}: {
  api?: LoginApi;
  onAuthenticated?: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<LoginInput>({ email: '', password: '' });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loginMutation.mutateAsync(form);
    await onAuthenticated?.();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:items-stretch">
      <section className="surface-panel grid-glow flex min-h-[320px] flex-1 flex-col justify-between rounded-[34px] px-6 py-8 sm:px-8 lg:px-10">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-brand">
            Router Console
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-brand-strong sm:text-5xl">
            让多渠道 LLM 出口像运营驾驶舱一样可见、可控、可审计
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ink-soft">
            登录后进入统一控制台，对接入渠道、逻辑模型、API Token 与请求日志进行集中管理。
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {highlights.map(([title, description]) => (
            <article key={title} className="surface-card rounded-[24px] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Module</p>
              <h2 className="mt-3 text-lg font-semibold text-brand-strong">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-panel w-full rounded-[34px] p-6 sm:p-8 lg:w-[480px] lg:p-10">
        <div className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Access Gate</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-strong">控制台登录</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            使用管理员或已启用账户登录，进入路由控制平面。
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="text-sm font-medium text-ink">
              邮箱
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-brand focus:ring-4 focus:ring-brand/10"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium text-ink">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-brand focus:ring-4 focus:ring-brand/10"
              placeholder="输入当前账户密码"
            />
          </div>

          {loginMutation.isError ? (
            <p className="rounded-[18px] border border-alert/15 bg-[rgba(141,77,35,0.07)] px-4 py-3 text-sm text-alert">
              登录失败，请检查邮箱和密码后重试。
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-brand/60"
          >
            {loginMutation.isPending ? '验证中...' : '登录'}
          </button>
        </form>

        <div className="mt-8 flex items-center justify-between rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.05)] px-4 py-4">
          <div>
            <p className="text-sm font-medium text-brand-strong">Session Cookie</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">浏览器只保存服务端签发的短期会话。</p>
          </div>
          <span className="rounded-full border border-brand/10 bg-white/70 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
            /auth/login
          </span>
        </div>
      </section>
    </div>
  );
}
