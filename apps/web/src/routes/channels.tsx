import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable } from '../components/data-table';
import { MetricTile } from '../components/metric-tile';
import { ModalShell } from '../components/modal-shell';
import { PageHeader } from '../components/page-header';
import { StatusBadge } from '../components/status-badge';
import type { AppApi } from '../lib/api-client';

const channelsQueryKey = ['channels'] as const;
const logicalModelsQueryKey = ['logical-models'] as const;
const fieldClassName =
  'mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10';

type ChannelsRouteApi = Pick<
  AppApi,
  'listChannels' | 'createChannel' | 'testChannel' | 'listLogicalModels' | 'createLogicalModel'
>;

type RouteDraft = {
  channelId: string;
  upstreamModelId: string;
  inputPricePer1m: string;
  outputPricePer1m: string;
  currency: string;
  priority: string;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return '未记录';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function getTestStatusLabel(status: string | null) {
  if (status === 'ok') {
    return '最近测试通过';
  }

  if (status === 'failed') {
    return '最近测试失败';
  }

  return '未测试';
}

function getLogicalModelDescription(value: string) {
  return value.trim().length > 0 ? value : '未填写说明';
}

function emptyRouteDraft(): RouteDraft {
  return {
    channelId: '',
    upstreamModelId: '',
    inputPricePer1m: '0.0000',
    outputPricePer1m: '0.0000',
    currency: 'USD',
    priority: '1',
  };
}

export function ChannelsRouteComponent({ api }: { api: ChannelsRouteApi }) {
  const queryClient = useQueryClient();
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [isCreateLogicalModelModalOpen, setIsCreateLogicalModelModalOpen] = useState(false);
  const [channelForm, setChannelForm] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    defaultModelId: '',
  });
  const [logicalModelForm, setLogicalModelForm] = useState({
    alias: '',
    description: '',
  });
  const [routeDrafts, setRouteDrafts] = useState<RouteDraft[]>([emptyRouteDraft()]);

  const channelsQuery = useQuery({
    queryKey: channelsQueryKey,
    queryFn: () => api.listChannels(),
  });
  const logicalModelsQuery = useQuery({
    queryKey: logicalModelsQueryKey,
    queryFn: () => api.listLogicalModels(),
  });

  const createChannelMutation = useMutation({
    mutationFn: () => api.createChannel(channelForm),
    onSuccess: async () => {
      setChannelForm({
        name: '',
        baseUrl: '',
        apiKey: '',
        defaultModelId: '',
      });
      setIsCreateChannelModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: channelsQueryKey });
    },
  });

  const testChannelMutation = useMutation({
    mutationFn: (channelId: string) => api.testChannel(channelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: channelsQueryKey });
    },
  });

  const createLogicalModelMutation = useMutation({
    mutationFn: () =>
      api.createLogicalModel({
        alias: logicalModelForm.alias,
        description: logicalModelForm.description,
        routes: routeDrafts.map((route) => ({
          channelId: route.channelId,
          upstreamModelId: route.upstreamModelId,
          inputPricePer1m: route.inputPricePer1m,
          outputPricePer1m: route.outputPricePer1m,
          currency: route.currency,
          priority: Number(route.priority),
        })),
      }),
    onSuccess: async () => {
      setLogicalModelForm({
        alias: '',
        description: '',
      });
      setRouteDrafts([emptyRouteDraft()]);
      setIsCreateLogicalModelModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: logicalModelsQueryKey });
    },
  });

  const channels = channelsQuery.data?.channels ?? [];
  const logicalModels = logicalModelsQuery.data?.logicalModels ?? [];
  const activeChannels = channels.filter((channel) => channel.status === 'active').length;
  const testedChannels = channels.filter((channel) => channel.lastTestStatus === 'ok').length;
  const routeCount = logicalModels.reduce((total, logicalModel) => total + logicalModel.routes.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Channel Console"
        title="渠道策略"
        description="统一管理 OpenAI-compatible 渠道、默认模型与逻辑别名映射，把链路健康、测试结果和价格编排收敛到同一个运营台。"
        actions={
          <>
            <button
              type="button"
              className="rounded-full border border-white/18 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/18"
              onClick={() => setIsCreateLogicalModelModalOpen(true)}
            >
              新建逻辑模型
            </button>
            <button
              type="button"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-brand-strong transition hover:bg-white/90"
              onClick={() => setIsCreateChannelModalOpen(true)}
            >
              新增渠道
            </button>
          </>
        }
        meta={
          <>
            <MetricTile
              label="渠道总数"
              value={`${channels.length}`.padStart(2, '0')}
              detail="接入出口资产"
            />
            <MetricTile
              label="活跃渠道"
              value={`${activeChannels}`.padStart(2, '0')}
              detail="当前可用链路"
            />
            <MetricTile
              label="测试通过"
              value={`${testedChannels}`.padStart(2, '0')}
              detail="最近一次测试成功"
            />
            <MetricTile
              label="逻辑模型"
              value={`${logicalModels.length}`.padStart(2, '0')}
              detail="策略别名映射"
            />
            <MetricTile
              label="生效路由"
              value={`${routeCount}`.padStart(2, '0')}
              detail="优先级编排条目"
            />
            <MetricTile label="接入规范" value="OA" detail="OpenAI-compatible" />
          </>
        }
      />

      <section className="app-surface rounded-[30px] p-6">
        <div className="flex flex-col gap-4 border-b border-line-soft pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Channel Matrix
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
              渠道列表
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
              同一个 Base URL 会根据你实际调用的网关路径，自动转发到
              <span className="font-mono text-[13px] text-brand-strong"> /v1/chat/completions</span>
              、
              <span className="font-mono text-[13px] text-brand-strong"> /v1/embeddings</span>
              和
              <span className="font-mono text-[13px] text-brand-strong"> /v1/responses</span>
              ，因此页面只保留一个统一的 OpenAI-compatible 接入视图。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[22px] border border-line-soft bg-white/72 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Health</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-brand-strong">
                {`${activeChannels}/${channels.length || 0}`}
              </p>
              <p className="mt-2 text-sm text-ink-soft">活跃状态与库存规模同屏观察。</p>
            </article>
            <article className="rounded-[22px] border border-line-soft bg-white/72 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                Last Checks
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-brand-strong">
                {`${testedChannels}`.padStart(2, '0')}
              </p>
              <p className="mt-2 text-sm text-ink-soft">已通过最近一次健康测试的渠道数量。</p>
            </article>
          </div>
        </div>

        <div className="mt-6">
          <DataTable caption="渠道列表">
            <thead className="border-b border-line-soft bg-[rgba(18,70,61,0.04)] font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">渠道</th>
                <th className="px-4 py-3 font-medium">Base URL</th>
                <th className="px-4 py-3 font-medium">默认模型</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">最近测试</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr
                  key={channel.id}
                  className="border-b border-line-soft/70 last:border-b-0 hover:bg-[rgba(18,70,61,0.03)]"
                >
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-ink">{channel.name}</p>
                    <p className="mt-1 text-xs text-ink-soft">{channel.id}</p>
                  </td>
                  <td className="px-4 py-4 align-top font-mono text-xs text-ink-soft">
                    {channel.baseUrl}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-brand-strong">{channel.defaultModelId}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <StatusBadge
                      status={channel.status}
                      label={channel.status === 'active' ? 'active' : 'disabled'}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm font-medium text-ink">
                      {getTestStatusLabel(channel.lastTestStatus)}
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">{formatDateTime(channel.lastTestedAt)}</p>
                    {channel.lastTestError ? (
                      <p className="mt-2 text-xs text-alert">{channel.lastTestError}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top text-right">
                    <button
                      type="button"
                      className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
                      onClick={() => testChannelMutation.mutate(channel.id)}
                    >
                      测试渠道
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]">
        <section className="app-surface rounded-[30px] p-6">
          <div className="flex flex-col gap-4 border-b border-line-soft pb-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Strategy Registry
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                逻辑模型编排
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-soft">
                以逻辑别名聚合多条路由，便于运营同屏核对渠道、价格、优先级与上游模型。
              </p>
            </div>
            <div className="rounded-[22px] border border-line-soft bg-white/72 px-4 py-4 text-sm text-ink-soft">
              新建逻辑模型后，routes 会按优先级直接出现在这里，便于复核编排结果。
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {logicalModels.map((logicalModel) => (
              <article key={logicalModel.id} className="app-muted-surface rounded-[24px] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-brand-strong">{logicalModel.alias}</h3>
                      <StatusBadge
                        status={logicalModel.status}
                        label={logicalModel.status === 'active' ? 'active' : logicalModel.status}
                      />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink-soft">
                      {getLogicalModelDescription(logicalModel.description)}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[240px]">
                    <div className="rounded-[20px] border border-line-soft bg-white/80 px-4 py-3">
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                        Routes
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                        {logicalModel.routes.length}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-line-soft bg-white/80 px-4 py-3">
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                        Updated
                      </p>
                      <p className="mt-2 text-sm font-medium text-ink">
                        {formatDateTime(logicalModel.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {logicalModel.routes.map((route) => (
                    <div
                      key={route.id}
                      className="grid gap-3 rounded-[20px] border border-line-soft bg-white/72 px-4 py-4 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_0.6fr]"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">{route.channelName}</p>
                        <p className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-accent">
                          {route.upstreamModelId}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-ink-soft">输入 / 输出</p>
                        <p className="mt-1 text-sm text-ink">
                          {route.inputPricePer1m} / {route.outputPricePer1m}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-ink-soft">币种</p>
                        <p className="mt-1 text-sm text-ink">{route.currency}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-ink-soft">优先级</p>
                        <p className="mt-1 text-sm text-ink">{route.priority}</p>
                      </div>
                      <div className="md:text-right">
                        <StatusBadge status={route.status} label={route.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="app-surface rounded-[30px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Intake Pattern
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">录入方式</h2>
            <div className="mt-5 space-y-3 text-sm leading-6 text-ink-soft">
              <p>新增渠道和新建逻辑模型都迁移到标准弹窗，避免录入区长期占据页面宽度。</p>
              <p>主页面专注于状态、表格和编排结果，录入动作按需打开，减少运营切换成本。</p>
            </div>
          </section>

          <section className="app-surface rounded-[30px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
              Route Rules
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">编排提醒</h2>
            <div className="mt-5 grid gap-3">
              {[
                ['统一接入', '渠道默认按 OpenAI-compatible 能力接入，不再拆分 API 类型。'],
                ['多路优先级', '一个逻辑模型可挂多条 route，优先级越大越靠前。'],
                ['价格复核', '录入时保持输入与输出价格成对更新，便于后续费用解释。'],
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
        open={isCreateChannelModalOpen}
        onClose={() => setIsCreateChannelModalOpen(false)}
        eyebrow="Channel Intake"
        title="新增渠道"
        description="补充上游出口的基础信息，页面会继续沿用统一的 OpenAI-compatible 接入语义。"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            createChannelMutation.mutate();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-ink">API 类型</span>
            <div className="mt-2 rounded-[18px] border border-line-soft bg-[rgba(18,70,61,0.05)] px-4 py-3">
              <p className="font-medium text-brand-strong">OpenAI-compatible</p>
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                自动兼容 `chat/completions`、`embeddings`、`responses` 三类常用接口。
              </p>
            </div>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">渠道名称</span>
              <input
                value={channelForm.name}
                onChange={(event) => setChannelForm((current) => ({ ...current, name: event.target.value }))}
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">默认模型</span>
              <input
                value={channelForm.defaultModelId}
                onChange={(event) =>
                  setChannelForm((current) => ({ ...current, defaultModelId: event.target.value }))
                }
                className={fieldClassName}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-ink">Base URL</span>
            <input
              value={channelForm.baseUrl}
              onChange={(event) => setChannelForm((current) => ({ ...current, baseUrl: event.target.value }))}
              className={fieldClassName}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">API Key</span>
            <input
              value={channelForm.apiKey}
              onChange={(event) => setChannelForm((current) => ({ ...current, apiKey: event.target.value }))}
              className={fieldClassName}
            />
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-full border border-line-strong bg-white px-5 py-3 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
              onClick={() => setIsCreateChannelModalOpen(false)}
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
            >
              保存渠道
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={isCreateLogicalModelModalOpen}
        onClose={() => setIsCreateLogicalModelModalOpen(false)}
        eyebrow="Strategy Composer"
        title="新建逻辑模型"
        description="为逻辑别名补充说明并录入 routes，保持与当前后端数据结构一致。"
        size="xl"
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            createLogicalModelMutation.mutate();
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink">逻辑模型别名</span>
                <input
                  value={logicalModelForm.alias}
                  onChange={(event) =>
                    setLogicalModelForm((current) => ({ ...current, alias: event.target.value }))
                  }
                  className={fieldClassName}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">说明</span>
                <textarea
                  value={logicalModelForm.description}
                  onChange={(event) =>
                    setLogicalModelForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={5}
                  className={fieldClassName}
                />
              </label>
              <div className="rounded-[22px] border border-line-soft bg-[rgba(18,70,61,0.04)] p-4 text-sm leading-6 text-ink-soft">
                <p className="font-medium text-brand-strong">录入提醒</p>
                <p className="mt-2">一个逻辑模型可以挂多条 route；运营台会按优先级展示这些编排结果。</p>
              </div>
            </div>

            <div className="space-y-4">
              {routeDrafts.map((route, index) => (
                <div
                  key={`draft-${index}`}
                  className="rounded-[24px] border border-line-soft bg-[rgba(18,70,61,0.04)] p-4"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                      Route {index + 1}
                    </p>
                    {routeDrafts.length > 1 ? (
                      <button
                        type="button"
                        className="text-sm text-alert"
                        onClick={() =>
                          setRouteDrafts((current) =>
                            current.filter((_, routeIndex) => routeIndex !== index),
                          )
                        }
                      >
                        删除
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-4">
                    <label className="block">
                      <span className="text-sm font-medium text-ink">关联渠道</span>
                      <select
                        value={route.channelId}
                        onChange={(event) =>
                          setRouteDrafts((current) =>
                            current.map((item, routeIndex) =>
                              routeIndex === index ? { ...item, channelId: event.target.value } : item,
                            ),
                          )
                        }
                        className={fieldClassName}
                      >
                        <option value="">选择渠道</option>
                        {channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-ink">上游模型</span>
                      <input
                        value={route.upstreamModelId}
                        onChange={(event) =>
                          setRouteDrafts((current) =>
                            current.map((item, routeIndex) =>
                              routeIndex === index
                                ? { ...item, upstreamModelId: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className={fieldClassName}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-ink">输入价格</span>
                        <input
                          value={route.inputPricePer1m}
                          onChange={(event) =>
                            setRouteDrafts((current) =>
                              current.map((item, routeIndex) =>
                                routeIndex === index
                                  ? { ...item, inputPricePer1m: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className={fieldClassName}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-ink">输出价格</span>
                        <input
                          value={route.outputPricePer1m}
                          onChange={(event) =>
                            setRouteDrafts((current) =>
                              current.map((item, routeIndex) =>
                                routeIndex === index
                                  ? { ...item, outputPricePer1m: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className={fieldClassName}
                        />
                      </label>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-ink">币种</span>
                        <input
                          value={route.currency}
                          onChange={(event) =>
                            setRouteDrafts((current) =>
                              current.map((item, routeIndex) =>
                                routeIndex === index ? { ...item, currency: event.target.value } : item,
                              ),
                            )
                          }
                          className={fieldClassName}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-ink">优先级</span>
                        <input
                          value={route.priority}
                          onChange={(event) =>
                            setRouteDrafts((current) =>
                              current.map((item, routeIndex) =>
                                routeIndex === index ? { ...item, priority: event.target.value } : item,
                              ),
                            )
                          }
                          className={fieldClassName}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-line-soft pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
              onClick={() => setRouteDrafts((current) => [...current, emptyRouteDraft()])}
            >
              添加路由
            </button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                className="rounded-full border border-line-strong bg-white px-5 py-3 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
                onClick={() => setIsCreateLogicalModelModalOpen(false)}
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
              >
                保存逻辑模型
              </button>
            </div>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
