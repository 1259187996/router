import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable } from '../components/data-table';
import { DrawerShell } from '../components/drawer-shell';
import { ModalShell } from '../components/modal-shell';
import { StatusBadge } from '../components/status-badge';
import type { AppApi, TokenRecord } from '../lib/api-client';

const tokensQueryKey = ['tokens'] as const;
const logicalModelsQueryKey = ['logical-models'] as const;

const fieldClassName =
  'mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10';

type TokensRouteApi = Pick<AppApi, 'listTokens' | 'listLogicalModels' | 'createToken' | 'revokeToken'>;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '未设置';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function getTokenStatusLabel(status: TokenRecord['status']) {
  if (status === 'active') {
    return '运行中';
  }

  if (status === 'revoked') {
    return '已吊销';
  }

  if (status === 'expired') {
    return '已过期';
  }

  if (status === 'exhausted') {
    return '已耗尽';
  }

  return status;
}

function getBudgetStatusLabel(status: TokenRecord['budgetStatus']) {
  if (status === 'available') {
    return '可用';
  }

  if (status === 'exhausted') {
    return '已耗尽';
  }

  return status;
}

function getExpiryStatusTokens(tokens: TokenRecord[]) {
  return tokens.filter((token) => {
    if (!token.expiresAt) {
      return false;
    }

    return new Date(token.expiresAt).getTime() < Date.now();
  }).length;
}

export function TokensRouteComponent({ api }: { api: TokensRouteApi }) {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    logicalModelId: '',
    budgetLimitUsd: '',
    expiresAt: '',
  });

  const tokensQuery = useQuery({
    queryKey: tokensQueryKey,
    queryFn: () => api.listTokens(),
  });
  const logicalModelsQuery = useQuery({
    queryKey: logicalModelsQueryKey,
    queryFn: () => api.listLogicalModels(),
  });

  const createTokenMutation = useMutation({
    mutationFn: () =>
      api.createToken({
        name: form.name,
        logicalModelId: form.logicalModelId,
        budgetLimitUsd: form.budgetLimitUsd,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }),
    onSuccess: async (result) => {
      setNewlyCreatedToken(result.token.rawToken ?? null);
      setForm({
        name: '',
        logicalModelId: '',
        budgetLimitUsd: '',
        expiresAt: '',
      });
      setIsCreateModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.revokeToken(tokenId),
    onSuccess: async (_result, tokenId) => {
      setSelectedTokenId((current) => (current === tokenId ? null : current));
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
    },
  });

  const tokens = tokensQuery.data?.tokens ?? [];
  const logicalModels = logicalModelsQuery.data?.logicalModels ?? [];
  const hasLogicalModels = logicalModels.length > 0;
  const logicalModelAliasById = new Map(logicalModels.map((model) => [model.id, model.alias]));
  const selectedToken = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const activeTokensCount = tokens.filter((token) => token.status === 'active').length;
  const budgetLimitedTokensCount = tokens.filter((token) => token.budgetLimitUsd !== '0.00').length;
  const expiredTokensCount = getExpiryStatusTokens(tokens);
  const selectedTokenModelAlias = selectedToken
    ? logicalModelAliasById.get(selectedToken.logicalModelId) ?? selectedToken.logicalModelId
    : null;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_340px]">
        <section className="space-y-5">
          <h1 className="sr-only">令牌管理</h1>

          <section className="app-surface rounded-[32px] px-6 py-6 sm:px-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Token Console
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-strong">
                  令牌管理
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-soft">
                  页面主体保持令牌表格优先，录入动作进入标准弹窗，存量令牌的预算、状态和过期信息通过详情抽屉查看。
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.05)] px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                    Raw Token Policy
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">
                    原始 token 仅在创建成功当次展示一次，不进入列表回显。
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  新建令牌
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: '令牌总数', value: `${tokens.length}`.padStart(2, '0'), detail: '表格中的全部授权资产' },
              {
                label: '活跃令牌',
                value: `${activeTokensCount}`.padStart(2, '0'),
                detail: '当前可调用、可继续分发',
              },
              {
                label: '预算受控',
                value: `${budgetLimitedTokensCount}`.padStart(2, '0'),
                detail: `已过期 ${`${expiredTokensCount}`.padStart(2, '0')} 个`,
              },
            ].map((metric) => (
              <article key={metric.label} className="app-surface rounded-[28px] p-5">
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

          <section className="app-surface rounded-[32px] p-6">
            <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Token Inventory
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                  令牌列表
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                  运营台优先展示表格，详情信息放入右侧抽屉，便于在不离开列表上下文的前提下完成核对与吊销。
                </p>
              </div>
              <div className="rounded-[22px] border border-line-soft bg-[rgba(18,70,61,0.04)] px-4 py-3 text-sm text-ink-soft">
                先看清单，再按需打开详情或执行吊销。
              </div>
            </div>

            <div className="mt-6">
              <DataTable caption="令牌列表">
                <thead className="border-b border-line-soft bg-[rgba(18,70,61,0.04)] font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">令牌</th>
                    <th className="px-4 py-3 font-medium">逻辑模型</th>
                    <th className="px-4 py-3 font-medium">预算</th>
                    <th className="px-4 py-3 font-medium">到期时间</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-ink-soft" colSpan={6}>
                        还没有令牌。点击右上角“新建令牌”开始发放。
                      </td>
                    </tr>
                  ) : null}

                  {tokens.map((token) => {
                    const logicalModelAlias =
                      logicalModelAliasById.get(token.logicalModelId) ?? token.logicalModelId;

                    return (
                      <tr
                        key={token.id}
                        className="border-b border-line-soft/70 last:border-b-0 hover:bg-[rgba(18,70,61,0.03)]"
                      >
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-ink">{token.name}</p>
                          <p className="mt-1 text-xs text-ink-soft">
                            令牌 ID: <span className="font-mono">{token.id}</span>
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-brand-strong">{logicalModelAlias}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm text-ink">
                            ${token.budgetUsedUsd} / ${token.budgetLimitUsd}
                          </p>
                          <p className="mt-1">
                            <StatusBadge
                              status={token.budgetStatus}
                              label={getBudgetStatusLabel(token.budgetStatus)}
                            />
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-ink-soft">
                          {formatDateTime(token.expiresAt)}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <StatusBadge status={token.status} label={getTokenStatusLabel(token.status)} />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
                              onClick={() => setSelectedTokenId(token.id)}
                            >
                              查看 {token.name} 详情
                            </button>
                            {token.status === 'active' ? (
                              <button
                                type="button"
                                className="rounded-full border border-line-soft bg-[rgba(120,26,34,0.04)] px-4 py-2 text-sm font-medium text-alert transition hover:border-alert/40 hover:bg-[rgba(120,26,34,0.08)]"
                                onClick={() => revokeTokenMutation.mutate(token.id)}
                              >
                                吊销
                              </button>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-line-soft px-4 py-2 text-sm text-ink-soft">
                                不可操作
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <section className="app-surface rounded-[30px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              State Window
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
              一次性原始令牌
            </h3>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              创建成功后仅在这里展示原始 token。复制后请立即放入部署环境，列表中不会再次回显。
            </p>

            <div className="mt-5 rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.05)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                    Raw Token
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">
                    {newlyCreatedToken ? '当前会话中最近一次创建结果' : '尚未创建新的令牌'}
                  </p>
                </div>
                <span className="rounded-full border border-line-soft px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  One-Time
                </span>
              </div>
              <p className="mt-4 break-all rounded-[18px] bg-white/80 px-4 py-3 font-mono text-sm text-brand-strong">
                {newlyCreatedToken ?? '创建成功后显示'}
              </p>
            </div>
          </section>

          <section className="app-surface rounded-[30px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Detail Flow
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
              详情抽屉说明
            </h3>
            <div className="mt-4 grid gap-3">
              {[
                ['查看详情', '每个令牌都有独立详情入口，右侧抽屉展示预算、状态、绑定模型与时间信息。'],
                ['表格优先', '主体区域仍旧保留为列表视图，适合运营台快速扫表、筛查异常与执行吊销。'],
                ['信息分层', '创建动作、详情核对与原始 token 展示分层承载，避免把所有内容堆在一个侧栏里。'],
              ].map(([label, detail]) => (
                <article key={label} className="app-muted-surface rounded-[22px] p-4">
                  <p className="font-medium text-ink">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{detail}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <ModalShell
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        eyebrow="Token Intake"
        title="新建令牌"
        description="补充令牌名称、绑定模型、预算和过期时间。创建完成后，原始 token 会在页面右侧状态区仅展示一次。"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasLogicalModels) {
              return;
            }
            createTokenMutation.mutate();
          }}
        >
          <div className="block">
            <label htmlFor="token-name" className="text-sm font-medium text-ink">
              令牌名称
            </label>
            <input
              id="token-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className={fieldClassName}
            />
          </div>

          <div className="block">
            <label htmlFor="token-model" className="text-sm font-medium text-ink">
              逻辑模型
            </label>
            {!hasLogicalModels ? (
              <p className="mt-2 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                还没有可绑定的逻辑模型。请先到渠道页创建并保存一个逻辑模型，再回来发放令牌。
              </p>
            ) : null}
            <select
              id="token-model"
              value={form.logicalModelId}
              onChange={(event) =>
                setForm((current) => ({ ...current, logicalModelId: event.target.value }))
              }
              disabled={!hasLogicalModels}
              className={fieldClassName}
            >
              <option value="">选择逻辑模型</option>
              {logicalModels.map((logicalModel) => (
                <option key={logicalModel.id} value={logicalModel.id}>
                  {logicalModel.alias}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block">
              <label htmlFor="token-budget-limit" className="text-sm font-medium text-ink">
                预算上限
              </label>
              <input
                id="token-budget-limit"
                type="text"
                value={form.budgetLimitUsd}
                onChange={(event) =>
                  setForm((current) => ({ ...current, budgetLimitUsd: event.target.value }))
                }
                className={fieldClassName}
              />
            </div>

            <div className="block">
              <label htmlFor="token-expires-at" className="text-sm font-medium text-ink">
                过期时间
              </label>
              <input
                id="token-expires-at"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                className={fieldClassName}
              />
            </div>
          </div>

          <div className="rounded-[22px] border border-line-soft bg-[rgba(18,70,61,0.04)] p-4 text-sm leading-6 text-ink-soft">
            <p className="font-medium text-brand-strong">创建提示</p>
            <p className="mt-2">
              预算、过期时间和逻辑模型绑定仍沿用现有业务语义，不改动后端数据结构与创建接口。
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-full border border-line-strong bg-white px-5 py-3 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
              onClick={() => setIsCreateModalOpen(false)}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!hasLogicalModels}
              className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-brand/60"
            >
              创建令牌
            </button>
          </div>
        </form>
      </ModalShell>

      <DrawerShell
        open={selectedToken !== null}
        onClose={() => setSelectedTokenId(null)}
        eyebrow="Token Profile"
        title="令牌详情"
        description={
          selectedToken ? `查看 ${selectedToken.name} 的预算、绑定模型、状态与生命周期信息。` : undefined
        }
        width="md"
      >
        {selectedToken ? (
          <div className="space-y-5">
            <section className="rounded-[26px] border border-line-soft bg-[rgba(18,70,61,0.05)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                    Token Snapshot
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                    {selectedToken.name}
                  </h3>
                  <p className="mt-2 break-all font-mono text-xs text-ink-soft">{selectedToken.id}</p>
                </div>
                <StatusBadge
                  status={selectedToken.status}
                  label={getTokenStatusLabel(selectedToken.status)}
                />
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              {[
                ['绑定模型', selectedTokenModelAlias ?? '未设置'],
                ['预算状态', getBudgetStatusLabel(selectedToken.budgetStatus)],
                ['预算用量', `$${selectedToken.budgetUsedUsd} / $${selectedToken.budgetLimitUsd}`],
                ['过期时间', formatDateTime(selectedToken.expiresAt)],
              ].map(([label, value]) => (
                <article key={label} className="app-muted-surface rounded-[22px] p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">{label}</p>
                  <p className="mt-3 text-base font-medium text-ink">{value}</p>
                </article>
              ))}
            </section>

            <section className="rounded-[26px] border border-line-soft bg-white/80 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                Lifecycle
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[
                  ['最后使用', formatDateTime(selectedToken.lastUsedAt)],
                  ['创建时间', formatDateTime(selectedToken.createdAt)],
                  ['更新时间', formatDateTime(selectedToken.updatedAt)],
                  ['逻辑模型 ID', selectedToken.logicalModelId],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-sm font-medium text-ink">{label}</p>
                    <p className="mt-2 break-all text-sm leading-6 text-ink-soft">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </DrawerShell>
    </>
  );
}
