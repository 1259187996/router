import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient, type LoginInput } from '../lib/api-client';

type LoginApi = Pick<typeof apiClient, 'login'>;

const highlights = [
  ['统一分发外部模型渠道', '把不同供应商入口整理成一致接入面，减少团队手工切换。'],
  ['按 Key / 用户查看 token 消耗', '从预算、配额到异常峰值，都能落到可追踪的运营账本。'],
  ['保留请求日志与审计线索', '登录后继续进入渠道、权限与日志页，支撑排查与复盘。'],
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
    <div className="grid min-h-screen gap-6 bg-canvas px-4 py-4 lg:grid-cols-[1.1fr_480px]">
      <section className="relative hidden overflow-hidden rounded-[32px] bg-brand lg:flex lg:flex-col lg:justify-between">
        <img
          src="https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1600&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,29,25,0.18),rgba(7,29,25,0.82))]" />

        <div className="relative px-8 py-8 xl:px-10 xl:py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/60">
            Router Console
          </p>
          <h2 className="mt-4 max-w-2xl text-5xl font-semibold tracking-tight text-white">
            把模型出口、Key 分发和 token 账本收进一张控制台封面
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/74">
            为运营、平台和研发团队提供统一入口，在同一处查看上游渠道、权限发放和消耗轨迹。
          </p>
        </div>

        <div className="relative grid gap-4 px-8 pb-8 xl:px-10 xl:pb-10">
          {highlights.map(([title, description], index) => (
            <article
              key={title}
              className="rounded-[24px] border border-white/12 bg-white/8 px-5 py-5 backdrop-blur-sm"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/48">
                Capability 0{index + 1}
              </p>
              <h2 className="mt-3 text-xl font-semibold text-white">{title}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="app-surface rounded-[32px] p-8 lg:p-10">
        <div className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Access Gate</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-brand-strong">控制台登录</h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            使用管理员或已启用账户登录，进入企业模型出口控制台。
          </p>
        </div>

        <div className="mb-8 rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.05)] p-5 lg:hidden">
          <p className="text-base font-semibold text-brand-strong">统一接入、权限发放与消耗追踪</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            登录后可继续查看渠道接入、Key 预算和 token 消耗账本。
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
