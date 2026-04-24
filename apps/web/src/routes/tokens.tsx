import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable } from '../components/data-table';
import { StatusBadge } from '../components/status-badge';
import type { AppApi } from '../lib/api-client';

const tokensQueryKey = ['tokens'] as const;
const logicalModelsQueryKey = ['logical-models'] as const;

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

export function TokensRouteComponent({ api }: { api: TokensRouteApi }) {
  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
      setIsDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.revokeToken(tokenId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tokensQueryKey });
    },
  });

  const tokens = tokensQuery.data?.tokens ?? [];
  const logicalModels = logicalModelsQuery.data?.logicalModels ?? [];
  const hasLogicalModels = logicalModels.length > 0;
  const logicalModelAliasById = new Map(logicalModels.map((model) => [model.id, model.alias]));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_400px]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: '令牌总数', value: `${tokens.length}`.padStart(2, '0'), detail: 'API 使用资产' },
            {
              label: '活跃令牌',
              value: `${tokens.filter((token) => token.status === 'active').length}`.padStart(2, '0'),
              detail: '当前可调用',
            },
            {
              label: '逻辑模型映射',
              value: `${logicalModels.length}`.padStart(2, '0'),
              detail: '用于令牌授权',
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
          <div className="flex flex-col gap-4 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Tokens</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                令牌管理
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                将令牌与逻辑模型绑定，控制预算、过期时间和吊销状态，形成统一对外授权面。
              </p>
            </div>
            <button
              type="button"
              className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
              onClick={() => setIsDrawerOpen(true)}
            >
              新建令牌
            </button>
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
                {tokens.map((token) => (
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
                      <p className="font-medium text-brand-strong">
                        {logicalModelAliasById.get(token.logicalModelId) ?? token.logicalModelId}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm text-ink">${token.budgetUsedUsd} / ${token.budgetLimitUsd}</p>
                      <p className="mt-1">
                        <StatusBadge status={token.budgetStatus} label={token.budgetStatus} />
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-ink-soft">
                      {formatDateTime(token.expiresAt)}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <StatusBadge
                        status={token.status}
                        label={token.status === 'revoked' ? '已吊销' : token.status}
                      />
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      {token.status === 'active' ? (
                        <button
                          type="button"
                          className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
                          onClick={() => revokeTokenMutation.mutate(token.id)}
                        >
                          吊销
                        </button>
                      ) : (
                        <span className="text-sm text-ink-soft">不可操作</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        {isDrawerOpen ? (
          <section className="surface-panel grid-glow rounded-[30px] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Token Intake
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
                  新建令牌
                </h3>
              </div>
              <button
                type="button"
                className="rounded-full border border-line-soft px-3 py-2 text-sm text-ink-soft"
                onClick={() => setIsDrawerOpen(false)}
              >
                关闭
              </button>
            </div>

            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!hasLogicalModels) {
                  return;
                }
                createTokenMutation.mutate();
              }}
            >
              <label className="block">
                <span className="text-sm font-medium text-ink">令牌名称</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">逻辑模型</span>
                {!hasLogicalModels ? (
                  <p className="mt-2 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    还没有可绑定的逻辑模型。请先到渠道页创建并保存一个逻辑模型，再回来发放令牌。
                  </p>
                ) : null}
                <select
                  value={form.logicalModelId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, logicalModelId: event.target.value }))
                  }
                  disabled={!hasLogicalModels}
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                >
                  <option value="">选择逻辑模型</option>
                  {logicalModels.map((logicalModel) => (
                    <option key={logicalModel.id} value={logicalModel.id}>
                      {logicalModel.alias}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">预算上限</span>
                <input
                  value={form.budgetLimitUsd}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, budgetLimitUsd: event.target.value }))
                  }
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">过期时间</span>
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>

              <button
                type="submit"
                disabled={!hasLogicalModels}
                className="w-full rounded-full bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-strong"
              >
                创建令牌
              </button>
            </form>
          </section>
        ) : (
          <section className="surface-panel rounded-[30px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Token Drawer</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">新建令牌</h3>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              点击左侧按钮打开侧边录入面板，创建新的调用令牌。
            </p>
          </section>
        )}

        <section className="surface-panel rounded-[30px] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Secret Window</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
            新令牌回显
          </h3>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            原始令牌只在创建当次展示，便于接入方复制到部署环境。列表中的内容仅为令牌 ID，
            不能直接当作 Bearer token 使用。
          </p>

          <div className="mt-5 rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.05)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Raw Token</p>
            <p className="mt-3 break-all font-mono text-sm text-brand-strong">
              {newlyCreatedToken ?? '创建后显示'}
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
