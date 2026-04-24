import { useQuery } from '@tanstack/react-query';
import { DataTable } from '../components/data-table';
import { StatusBadge } from '../components/status-badge';
import type { AppApi } from '../lib/api-client';
import {
  formatDateTime,
  formatDuration,
  formatTokenSummary,
  formatUsd,
  getRequestStatusLabel,
  parseUsd,
} from '../lib/log-format';

const logsQueryKey = ['logs'] as const;

type LogsRouteApi = Pick<AppApi, 'listLogs'>;

export function LogsRouteComponent({ api }: { api: LogsRouteApi }) {
  const logsQuery = useQuery({
    queryKey: logsQueryKey,
    queryFn: () => api.listLogs(),
  });

  const logs = logsQuery.data?.logs ?? [];
  const settledTotal = logs.reduce((total, log) => total + parseUsd(log.settlementPriceUsd), 0);
  const successCount = logs.filter((log) => log.requestStatus === 'success').length;
  const reviewCount = logs.filter((log) => log.requestStatus !== 'success').length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: '请求总数', value: `${logs.length}`.padStart(2, '0'), detail: '按单次请求审计' },
            { label: '成功请求', value: `${successCount}`.padStart(2, '0'), detail: '已完成结算' },
            {
              label: '待关注',
              value: `${reviewCount}`.padStart(2, '0'),
              detail: '异常、失败或待复核',
            },
            {
              label: '累计结算',
              value: formatUsd(settledTotal.toFixed(4)),
              detail: '当前列表内费用合计',
            },
          ].map((metric) => (
            <article key={metric.label} className="surface-panel rounded-[28px] p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-accent">
                {metric.label}
              </p>
              <p className="mt-4 text-4xl font-semibold tracking-tight text-brand-strong">
                {metric.value}
              </p>
              <p className="mt-3 text-sm text-ink-soft">{metric.detail}</p>
            </article>
          ))}
        </div>

        <section className="surface-panel rounded-[30px] p-6">
          <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Request Ledger
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                请求日志
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                以单次请求为粒度展示接口类型、最终路由、token 消耗、上游原价与本地结算费用。
              </p>
            </div>
            <div className="rounded-[20px] border border-line-soft bg-white/72 px-4 py-3 text-sm text-ink-soft">
              单击详情可查看完整路由尝试、事件摘要和费用解释。
            </div>
          </div>

          <div className="mt-6">
            <DataTable caption="请求日志列表">
              <thead className="border-b border-line-soft bg-[rgba(18,70,61,0.04)] font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">请求</th>
                  <th className="px-4 py-3 font-medium">路由结果</th>
                  <th className="px-4 py-3 font-medium">Token / 费用</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-line-soft/70 last:border-b-0 hover:bg-[rgba(18,70,61,0.03)]"
                  >
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium text-ink">{log.endpointType}</p>
                      <p className="mt-1 text-sm text-brand-strong">{log.logicalModelAlias}</p>
                      <p className="mt-1 text-xs text-ink-soft">{formatDateTime(log.startedAt)}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium text-ink">{log.finalUpstreamModelId ?? '--'}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        HTTP {log.httpStatusCode ?? '--'} / {formatDuration(log.durationMs)}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium text-brand-strong">{formatUsd(log.settlementPriceUsd)}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        上游原价 {formatUsd(log.rawUpstreamPriceUsd)}
                      </p>
                      <p className="mt-2 text-sm text-ink">{formatTokenSummary(log.inputTokens, log.outputTokens)}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge
                        status={log.requestStatus}
                        label={getRequestStatusLabel(log.requestStatus)}
                      />
                      <p className="mt-2 text-xs text-ink-soft">{log.errorSummary ?? '无错误摘要'}</p>
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      <a
                        href={`/logs/${log.id}`}
                        className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
                      >
                        查看详情
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        <section className="surface-panel rounded-[30px] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Read Cost</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
            费用怎么看
          </h3>
          <div className="mt-5 space-y-3 text-sm leading-6 text-ink-soft">
            <p>本地结算费用基于最终命中的逻辑路由价格表和实际 usage 计算。</p>
            <p>上游原价是上游返回的费用快照；如果上游没有提供，这里会显示为空。</p>
            <p>详情页会继续展开价格公式、失败切换链路和原始 usage。</p>
          </div>
        </section>

        <section className="surface-panel rounded-[30px] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Status Lens</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
            状态提示
          </h3>
          <div className="mt-5 grid gap-3">
            {[
              ['成功', '请求完成并且 usage 已被结算。'],
              ['需复核', '响应返回成功，但 usage 不完整或不能自动结算。'],
              ['流中断', '流式传输中途失败，需要结合尝试时间线排查。'],
            ].map(([label, detail]) => (
              <article key={label} className="surface-card rounded-[22px] p-4">
                <p className="font-medium text-ink">{label}</p>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{detail}</p>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
