import { Link } from '@tanstack/react-router';
import { MetricTile } from '../components/metric-tile';
import { PageHeader } from '../components/page-header';

const overviewMetrics = [
  {
    label: '本月 token',
    value: '24.8M',
    detail: '占月度预算 68%，过去 7 天日均消耗保持在 82 万以上。',
  },
  {
    label: '活跃 Key',
    value: '128',
    detail: '近 24 小时内有调用的 Key 占全部已发放 Key 的 74%。',
  },
  {
    label: '异常账户',
    value: '7',
    detail: '预算、失败率或异常峰值触发提醒，需要在今日内跟进。',
  },
  {
    label: '渠道健康',
    value: '3 / 4',
    detail: '摘要视图覆盖 4 条关键链路，其中 1 条推理链路延迟偏高，需要优先处理。',
  },
];

const tokenBreakdown = [
  { label: '输入 token', value: '17.4M', detail: '占比 70%，来自在线问答与批处理。' },
  { label: '输出 token', value: '7.1M', detail: '占比 29%，高峰出现在晚间巡检窗口。' },
  { label: '缓存命中', value: '31%', detail: '较上周提升 4%，重复请求压降继续生效。' },
];

const summarySignals = [
  { label: '需要关注的账户数', value: '7', detail: '首页当前展开优先级最高的 3 个账户，其余仍在预算列表中跟踪。' },
  { label: '高风险渠道', value: '1', detail: '备用聚合网关最近 6 小时延迟明显抬升。' },
  { label: '今日峰值时段', value: '10:00 - 12:00', detail: '知识检索与报告生成任务叠加，拉高输入 token。' },
];

const topUsers = [
  { name: '增长分析组', share: '4.8M token', detail: '近 7 天 +18%，批量洞察任务持续增长。', trend: '+18%' },
  { name: '客服 Copilot', share: '3.9M token', detail: '输出 token 偏高，建议复查系统提示词长度。', trend: '+9%' },
  { name: '财务日报机器人', share: '3.1M token', detail: '早晚双峰明显，集中在报表汇总与校验。', trend: '+22%' },
  { name: '法务审阅流', share: '2.7M token', detail: '错误率低但单次上下文长，需关注预算边界。', trend: '+6%' },
];

const topKeys = [
  { name: 'prod-growth-01', share: '1.82M token', detail: '关联增长分析组，单 Key 占全站 7.3%。', trend: '预算 81%' },
  { name: 'ops-copilot-02', share: '1.24M token', detail: '过去 24 小时重试偏高，建议核查上游波动。', trend: '重试 3.8%' },
  { name: 'finance-sync-04', share: '0.96M token', detail: '凌晨批处理集中执行，输入 token 高于均值。', trend: '夜间高峰' },
  { name: 'legal-review-03', share: '0.91M token', detail: '账户剩余预算 12%，已接近阈值。', trend: '预警中' },
];

const watchedAccounts = [
  { name: '增长分析组', reason: '预算使用 86%', action: '建议今日内补充预算或限流。' },
  { name: '法务审阅流', reason: '长上下文任务增多', action: '建议复核 prompt 模板和摘要策略。' },
  { name: '客服 Copilot', reason: '输出 token 偏高', action: '建议排查响应长度配置与系统词。' },
];

type ChannelHealthTone = 'success' | 'warning' | 'danger';

const channelHealth: Array<{
  name: string;
  status: string;
  summary: string;
  tone: ChannelHealthTone;
}> = [
  {
    name: '华东主通道',
    status: '稳定',
    summary: '成功率 99.4%，P95 延迟 780ms。',
    tone: 'success',
  },
  {
    name: '国际备用通道',
    status: '稳定',
    summary: '成功率 98.9%，偶发重试已回落到团队阈值以内。',
    tone: 'success',
  },
  {
    name: '嵌入服务',
    status: '稳定',
    summary: '调用量平稳，批处理窗口未见积压。',
    tone: 'success',
  },
  {
    name: '推理加速链路',
    status: '需关注',
    summary: 'P95 延迟 1.9s，高于团队阈值 27%。',
    tone: 'danger',
  },
];

const alerts = [
  {
    title: '3 个账户预算接近上限',
    detail: '增长分析组、法务审阅流与财务日报机器人都将在 48 小时内触达预算阈值。',
    level: '高优先级',
  },
  {
    title: '备用通道路由回退次数上升',
    detail: '最近 6 小时内共发生 14 次自动回退，主要集中在国际备用通道。',
    level: '中优先级',
  },
  {
    title: '单 Key 消耗集中度偏高',
    detail: 'prod-growth-01 与 ops-copilot-02 合计占全站 token 的 12.3%。',
    level: '建议跟进',
  },
];

const shortcutActions = [
  {
    label: '查看 Key 与权限',
    to: '/tokens' as const,
    detail: '补充预算、吊销异常 Key，核查逻辑模型绑定。',
  },
  {
    label: '巡检渠道与路由',
    to: '/channels' as const,
    detail: '检查通道状态、测试上游健康，并调整优先级。',
  },
  {
    label: '排查请求日志',
    to: '/logs' as const,
    detail: '按用户、模型和状态筛查异常请求与账单波动。',
  },
];

function getStatusClassName(tone: ChannelHealthTone) {
  if (tone === 'success') {
    return 'app-status-badge--success';
  }

  if (tone === 'warning') {
    return 'app-status-badge--warning';
  }

  return 'app-status-badge--danger';
}

export function IndexRouteComponent() {
  return (
    <div className="space-y-5">
      <span className="sr-only">路由控制台概览</span>
      <PageHeader
        eyebrow="Operator Overview"
        title="Token 使用总览"
        description="先看总 token 消耗、异常账户与渠道健康，再进入 Key、路由和日志的分项处理。"
        meta={overviewMetrics.map((metric) => (
          <MetricTile key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />
        ))}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
        <section className="app-surface grid-glow overflow-hidden rounded-[30px] p-6">
          <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Token Ledger</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">主摘要区</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                总览本月 token 使用、预算压力与近 24 小时运营信号，用于首页首屏快速判断当前是否需要干预。
              </p>
            </div>
            <div className="rounded-full border border-brand/10 bg-brand px-4 py-2 font-mono text-[11px] uppercase tracking-[0.24em] text-white">
              MTD Updated 10:45 CST
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-[28px] bg-brand px-6 py-6 text-white shadow-[0_24px_60px_-34px_rgba(10,34,29,0.7)]">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/62">Month To Date</p>
              <p className="mt-4 text-5xl font-semibold tracking-tight">24.8M</p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78">
                当前总量主要由增长分析、客服 Copilot 与法务审阅流驱动。预算使用仍可控，但头部账户集中度偏高。
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {tokenBreakdown.map((item) => (
                  <article
                    key={item.label}
                    className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm"
                  >
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/60">
                      {item.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{item.value}</p>
                    <p className="mt-2 text-sm leading-6 text-white/72">{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {summarySignals.map((item) => (
                <article key={item.label} className="app-muted-surface rounded-[24px] p-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">{item.label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-brand-strong">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="app-surface rounded-[30px] p-6">
            <div className="flex items-start justify-between gap-4 border-b border-line-soft pb-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Channel Health</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">渠道健康</h2>
              </div>
              <p className="rounded-full border border-brand/10 bg-brand/6 px-3 py-2 text-xs font-medium text-brand-strong">
                核心链路稳定
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {channelHealth.map((item) => (
                <article key={item.name} className="app-muted-surface rounded-[22px] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-brand-strong">{item.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-ink-soft">{item.summary}</p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClassName(item.tone)}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="app-surface rounded-[30px] p-6">
            <div className="border-b border-line-soft pb-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Alerts</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">异常提醒</h2>
            </div>

            <div className="mt-5 space-y-3">
              {alerts.map((item) => (
                <article key={item.title} className="rounded-[22px] border border-alert/18 bg-alert/6 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-base font-semibold tracking-tight text-brand-strong">{item.title}</h3>
                    <span className="rounded-full border border-alert/24 bg-white px-3 py-1 text-xs font-semibold text-alert">
                      {item.level}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.92fr)]">
        <section className="app-surface rounded-[30px] p-6">
          <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Top Consumers</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">高消耗用户</h2>
            </div>
            <p className="text-sm text-ink-soft">按最近 30 日 token 使用量排序，优先暴露集中消耗来源。</p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.03)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold tracking-tight text-brand-strong">高消耗用户</h3>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">Users</p>
              </div>
              <ol className="mt-4 space-y-3">
                {topUsers.map((item, index) => (
                  <li key={item.name} className="rounded-[20px] bg-white px-4 py-4 shadow-[0_16px_36px_-28px_rgba(10,34,29,0.35)]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-brand-strong">{item.name}</p>
                          <p className="mt-2 text-sm leading-6 text-ink-soft">{item.detail}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-brand-strong">{item.share}</p>
                        <p className="mt-2 text-xs text-accent">{item.trend}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.03)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold tracking-tight text-brand-strong">高消耗 Key</h3>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">Keys</p>
              </div>
              <ol className="mt-4 space-y-3">
                {topKeys.map((item, index) => (
                  <li key={item.name} className="rounded-[20px] bg-white px-4 py-4 shadow-[0_16px_36px_-28px_rgba(10,34,29,0.35)]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-brand-strong">{item.name}</p>
                          <p className="mt-2 text-sm leading-6 text-ink-soft">{item.detail}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-brand-strong">{item.share}</p>
                        <p className="mt-2 text-xs text-accent">{item.trend}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="app-surface rounded-[30px] p-6">
          <div className="border-b border-line-soft pb-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Watchlist</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">需要关注的账户</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              当前优先展开 3 个需要立即跟进的账户，剩余 4 个账户继续在预算与异常列表中追踪。
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {watchedAccounts.map((item) => (
              <article key={item.name} className="app-muted-surface rounded-[22px] p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-base font-semibold tracking-tight text-brand-strong">{item.name}</h3>
                  <span className="rounded-full border border-line-strong/60 bg-white px-3 py-1 text-xs font-semibold text-ink-soft">
                    {item.reason}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-soft">{item.action}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="app-surface rounded-[30px] p-6">
          <div className="border-b border-line-soft pb-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Quick Actions</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">快捷操作</h2>
          </div>

          <div className="mt-5 space-y-3">
            {shortcutActions.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                aria-label={item.label}
                className="app-muted-surface block rounded-[22px] p-4 transition hover:border-line-strong hover:bg-white"
              >
                <p className="text-base font-semibold tracking-tight text-brand-strong">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{item.detail}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
