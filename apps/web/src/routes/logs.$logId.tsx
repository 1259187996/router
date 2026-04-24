import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '../components/status-badge';
import type { AppApi, LogDetailRouteRecord } from '../lib/api-client';
import {
  formatDateTime,
  formatDuration,
  formatJson,
  formatTokenSummary,
  formatUsd,
  getAttemptStatusLabel,
  getFailureStageLabel,
  getRequestStatusLabel,
} from '../lib/log-format';

const logDetailQueryKey = (logId: string) => ['log-detail', logId] as const;

type LogDetailRouteApi = Pick<AppApi, 'getLogDetail'>;

function buildPriceBreakdown(
  inputTokens: number | null,
  outputTokens: number | null,
  finalRoute: LogDetailRouteRecord | null,
) {
  if (!finalRoute || inputTokens == null || outputTokens == null) {
    return [];
  }

  const inputPrice = Number.parseFloat(finalRoute.inputPricePer1m);
  const outputPrice = Number.parseFloat(finalRoute.outputPricePer1m);

  if (Number.isNaN(inputPrice) || Number.isNaN(outputPrice)) {
    return [];
  }

  return [
    {
      label: '输入费用',
      expression: `${inputTokens} x ${finalRoute.inputPricePer1m} / 1M`,
      amount: formatUsd(((inputTokens * inputPrice) / 1_000_000).toFixed(4)),
    },
    {
      label: '输出费用',
      expression: `${outputTokens} x ${finalRoute.outputPricePer1m} / 1M`,
      amount: formatUsd(((outputTokens * outputPrice) / 1_000_000).toFixed(4)),
    },
  ];
}

function DetailMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="surface-panel rounded-[28px] p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-accent">{label}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-brand-strong">{value}</p>
      <p className="mt-3 text-sm text-ink-soft">{detail}</p>
    </article>
  );
}

function JsonPanel({ title, body }: { title: string; body: string }) {
  return (
    <article className="surface-card rounded-[24px] p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">{title}</p>
      <pre className="mt-4 overflow-x-auto rounded-[18px] bg-[rgba(18,70,61,0.06)] p-4 font-mono text-xs leading-6 text-ink">
        {body}
      </pre>
    </article>
  );
}

export function LogDetailRouteComponent({
  api,
  logId,
}: {
  api: LogDetailRouteApi;
  logId: string;
}) {
  const detailQuery = useQuery({
    queryKey: logDetailQueryKey(logId),
    queryFn: () => api.getLogDetail(logId),
  });

  const detail = detailQuery.data;
  const log = detail?.log;
  const finalChannel = detail?.finalChannel;
  const finalRoute = detail?.finalRoute ?? null;
  const attempts = detail?.attempts ?? [];
  const priceBreakdown = buildPriceBreakdown(log?.inputTokens ?? null, log?.outputTokens ?? null, finalRoute);

  return (
    <div className="space-y-4">
      <section className="surface-panel rounded-[30px] p-6">
        <div className="flex flex-col gap-4 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <a href="/logs" className="text-sm font-medium text-accent transition hover:text-brand-strong">
              返回请求日志
            </a>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Request Detail
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
              请求详情
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
              按单次请求拆解最终命中的渠道、价格表、usage 与失败切换过程。
            </p>
          </div>
          <div className="rounded-[22px] border border-line-soft bg-white/72 px-4 py-3 text-right">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Log ID</p>
            <p className="mt-2 font-mono text-sm text-brand-strong">{logId}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailMetric
            label="请求状态"
            value={log ? getRequestStatusLabel(log.requestStatus) : '--'}
            detail={log ? `${log.endpointType} / ${log.logicalModelAlias}` : '等待加载详情'}
          />
          <DetailMetric
            label="本地结算"
            value={formatUsd(log?.settlementPriceUsd)}
            detail={finalRoute ? `${finalRoute.currency} / P${finalRoute.priority}` : '未命中最终价格表'}
          />
          <DetailMetric
            label="上游原价"
            value={formatUsd(log?.rawUpstreamPriceUsd)}
            detail={log?.finalUpstreamModelId ?? '未记录上游模型'}
          />
          <DetailMetric
            label="Token / 耗时"
            value={formatDuration(log?.durationMs)}
            detail={formatTokenSummary(log?.inputTokens, log?.outputTokens)}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_380px]">
        <section className="space-y-4">
          <section className="surface-panel rounded-[30px] p-6">
            <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Pricing Explain
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
                  价格解释
                </h3>
              </div>
              <StatusBadge
                status={log?.requestStatus ?? 'in_progress'}
                label={log ? getRequestStatusLabel(log.requestStatus) : '加载中'}
              />
            </div>

            {priceBreakdown.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {priceBreakdown.map((item) => (
                  <article key={item.label} className="surface-card rounded-[22px] p-5">
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="mt-3 font-mono text-sm text-brand-strong">{item.expression}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-brand-strong">
                      {item.amount}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-line-soft bg-white/72 p-5 text-sm leading-6 text-ink-soft">
                当前请求缺少价格表或 usage 明细，无法自动展开费用公式。
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="surface-card rounded-[22px] p-5">
                <p className="text-sm font-medium text-ink">结算对照</p>
                <div className="mt-4 space-y-3 text-sm text-ink-soft">
                  <div className="flex items-center justify-between gap-3">
                    <span>本地结算</span>
                    <span className="font-mono text-brand-strong">{formatUsd(log?.settlementPriceUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>上游原价</span>
                    <span className="font-mono text-brand-strong">{formatUsd(log?.rawUpstreamPriceUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>完成时间</span>
                    <span className="font-mono text-brand-strong">{formatDateTime(log?.finishedAt)}</span>
                  </div>
                </div>
              </article>

              <article className="surface-card rounded-[22px] p-5">
                <p className="text-sm font-medium text-ink">最终路由</p>
                <div className="mt-4 space-y-3 text-sm text-ink-soft">
                  <div className="flex items-center justify-between gap-3">
                    <span>渠道</span>
                    <span className="font-medium text-ink">{finalChannel?.name ?? '--'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>上游模型</span>
                    <span className="font-medium text-ink">{finalRoute?.upstreamModelId ?? '--'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>价格表</span>
                    <span className="font-mono text-brand-strong">
                      {finalRoute ? `${finalRoute.inputPricePer1m} / ${finalRoute.outputPricePer1m}` : '--'}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="surface-panel rounded-[30px] p-6">
            <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Attempt Timeline
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
                  路由尝试时间线
                </h3>
              </div>
              <p className="text-sm text-ink-soft">
                共 {attempts.length} 次尝试 {attempts.length > 1 ? '/ 发生过切换' : '/ 未发生切换'}
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {attempts.map((attempt) => (
                <article key={attempt.id} className="surface-card rounded-[24px] p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-brand-strong">
                          Attempt {attempt.attemptIndex}
                        </p>
                        <StatusBadge
                          status={attempt.attemptStatus}
                          label={getAttemptStatusLabel(attempt.attemptStatus)}
                        />
                      </div>
                      <p className="mt-3 text-sm font-medium text-ink">{attempt.channel.name}</p>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-accent">
                        {attempt.route.upstreamModelId ?? '--'}
                      </p>
                    </div>

                    <div className="grid gap-2 text-sm text-ink-soft sm:grid-cols-2 lg:text-right">
                      <p>开始：{formatDateTime(attempt.startedAt)}</p>
                      <p>结束：{formatDateTime(attempt.finishedAt)}</p>
                      <p>失败阶段：{getFailureStageLabel(attempt.failureStage)}</p>
                      <p>错误摘要：{attempt.errorSummary ?? '--'}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <JsonPanel title="Event Summary" body={formatJson(log?.eventSummaryJson)} />
          <JsonPanel title="Raw Usage" body={formatJson(log?.rawUsageJson)} />
          <JsonPanel title="Request Summary" body={formatJson(log?.rawRequestSummary)} />
        </aside>
      </div>
    </div>
  );
}
