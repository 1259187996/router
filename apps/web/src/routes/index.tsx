import { EmptyState } from '../components/empty-state';
import { MetricTile } from '../components/metric-tile';
import { PageHeader } from '../components/page-header';
import { StatusBadge } from '../components/status-badge';

const metrics = [
  { label: '活跃令牌', value: '128', detail: '过去 24 小时新增 12 个' },
  { label: '预算消耗', value: '$4.8k', detail: '本周较上周增长 9.4%' },
  { label: '异常工单', value: '03', detail: '2 个待值班确认，1 个已抑制' },
];

const heavyUsers = [
  { name: 'search-batch', usage: '732k tokens', detail: '峰值出现在 10:20 - 11:00' },
  { name: 'assistant-prod', usage: '648k tokens', detail: '较昨日上升 18%' },
];

const channelHealth = [
  { name: 'OpenAI 主链路', status: 'ok', note: '延迟 420ms，错误率 0.2%' },
  { name: 'Anthropic 备用链路', status: 'review_required', note: '近期重试次数偏高' },
];

export function IndexRouteComponent() {
  return (
    <div className="space-y-5">
      <span className="sr-only">路由控制台概览</span>
      <PageHeader
        eyebrow="Operator Overview"
        title="Token 使用总览"
        description="新的视觉基础层先承接运营视角的首页结构，后续 Task 3 会继续把真实图表、筛选和联动分析接入这套骨架。"
        meta={metrics.map((metric) => (
          <MetricTile key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />
        ))}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <section className="app-surface rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-brand-strong">高消耗用户</h2>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                先保留轻量排行骨架，后续接入真实租户、令牌与时间窗口筛选。
              </p>
            </div>
            <span className="rounded-full border border-brand/10 bg-brand px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-white">
              Top Load
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {heavyUsers.map((user) => (
              <article
                key={user.name}
                className="app-muted-surface rounded-[22px] px-4 py-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">{user.detail}</p>
                  </div>
                  <p className="font-mono text-sm uppercase tracking-[0.18em] text-accent">
                    {user.usage}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="app-surface rounded-[28px] p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-strong">渠道健康</h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            用新状态样式表达主备链路健康情况，后续会接入采样窗口和波动趋势。
          </p>

          <div className="mt-5 space-y-3">
            {channelHealth.map((channel) => (
              <article key={channel.name} className="app-muted-surface rounded-[22px] px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{channel.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">{channel.note}</p>
                  </div>
                  <StatusBadge status={channel.status} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="app-surface rounded-[28px] p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-strong">异常提醒</h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            这里只放最小空态组件，给后续告警明细、抑制规则和分派动作预留位置。
          </p>

          <div className="mt-5">
            <EmptyState
              title="当前没有新的 P1 告警"
              description="最近一次高优先级异常已在 09:32 完成恢复。后续会在这里接入告警等级、负责人和处理时长。"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
