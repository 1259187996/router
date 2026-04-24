const metrics = [
  { label: '活跃渠道', value: '06', delta: '+2 本周' },
  { label: '逻辑模型', value: '14', delta: '03 条策略待配置' },
  { label: '今日请求', value: '18.4k', delta: 'P95 842ms' },
];

const events = [
  { time: '08:40', title: '默认对话模型路由至 OpenAI 主链路', detail: '权重 70% / 健康度良好' },
  { time: '09:15', title: 'Anthropic 备用链路完成健康检查', detail: '最近一次验证 92ms' },
  { time: '09:32', title: '计费快照作业已完成', detail: '当前无未结算请求' },
];

export function IndexRouteComponent() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map((metric) => (
            <article key={metric.label} className="surface-panel rounded-[28px] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-accent">
                {metric.label}
              </p>
              <p className="mt-4 text-4xl font-semibold tracking-tight text-brand-strong">
                {metric.value}
              </p>
              <p className="mt-3 text-sm text-ink-soft">{metric.delta}</p>
            </article>
          ))}
        </div>

        <section className="surface-panel rounded-[30px] p-6">
          <div className="flex flex-col gap-3 border-b border-line-soft pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Overview
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                路由控制台概览
              </h3>
            </div>
            <p className="max-w-xl text-sm leading-6 text-ink-soft">
              Task 10 只交付骨架与视觉基线，这里保留后续渠道、令牌和日志页面接入的操作位。
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
            <div className="surface-card rounded-[24px] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-strong">逻辑模型流向</p>
                  <p className="mt-1 text-sm text-ink-soft">后续在 Task 11 接入真实策略配置</p>
                </div>
                <span className="rounded-full border border-brand/10 bg-brand px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-white">
                  Placeholder
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  ['chat-default', 'OpenAI / Anthropic', '70% / 30%'],
                  ['reasoning-heavy', 'OpenAI o-series', '单路由'],
                  ['embedding-default', 'OpenAI embeddings', '单路由'],
                ].map(([name, target, weight]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-[20px] border border-line-soft bg-white/70 px-4 py-4"
                  >
                    <div>
                      <p className="font-medium text-ink">{name}</p>
                      <p className="mt-1 text-sm text-ink-soft">{target}</p>
                    </div>
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                      {weight}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card rounded-[24px] p-5">
              <p className="text-sm font-medium text-brand-strong">接入态势</p>
              <p className="mt-1 text-sm text-ink-soft">以高密度卡片提供后续页面的视觉参考。</p>

              <div className="mt-5 grid gap-3">
                {[
                  ['会话认证', '已接入', 'bg-[rgba(18,70,61,0.1)] text-accent'],
                  ['请求日志', '待接线', 'bg-[rgba(141,77,35,0.1)] text-alert'],
                  ['计费快照', '已完成', 'bg-[rgba(18,70,61,0.1)] text-accent'],
                ].map(([label, value, className]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-[18px] border border-line-soft bg-white/68 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-ink">{label}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>

      <aside className="surface-panel rounded-[30px] p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Feed</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">近期事件</h3>

        <div className="mt-6 space-y-4">
          {events.map((event) => (
            <article key={`${event.time}-${event.title}`} className="surface-card rounded-[22px] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
                  {event.time}
                </span>
                <span className="rounded-full border border-line-soft bg-white/70 px-3 py-1 text-[11px] text-ink-soft">
                  System
                </span>
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-ink">{event.title}</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{event.detail}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
