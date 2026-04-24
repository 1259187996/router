import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable } from '../components/data-table';
import { StatusBadge } from '../components/status-badge';
import type { AppApi } from '../lib/api-client';

const channelsQueryKey = ['channels'] as const;
const logicalModelsQueryKey = ['logical-models'] as const;

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
  const [isChannelDrawerOpen, setIsChannelDrawerOpen] = useState(false);
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
      setIsChannelDrawerOpen(false);
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
      await queryClient.invalidateQueries({ queryKey: logicalModelsQueryKey });
    },
  });

  const channels = channelsQuery.data?.channels ?? [];
  const logicalModels = logicalModelsQuery.data?.logicalModels ?? [];
  const activeChannels = channels.filter((channel) => channel.status === 'active').length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_400px]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: '渠道总数', value: `${channels.length}`.padStart(2, '0'), detail: '接入出口资产' },
            {
              label: '活跃渠道',
              value: `${activeChannels}`.padStart(2, '0'),
              detail: '当前可用链路',
            },
            {
              label: '逻辑模型',
              value: `${logicalModels.length}`.padStart(2, '0'),
              detail: '策略别名映射',
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
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Channels
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                渠道策略
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
                当前渠道统一按 <span className="font-semibold text-brand-strong">OpenAI-compatible</span>{' '}
                接入。
                同一个 Base URL 会根据你实际调用的网关路径，自动转发到
                <span className="font-mono text-[13px] text-brand-strong"> /v1/chat/completions</span>
                、
                <span className="font-mono text-[13px] text-brand-strong"> /v1/embeddings</span>
                和
                <span className="font-mono text-[13px] text-brand-strong"> /v1/responses</span>
                ，不需要再选额外的 API 类型。
              </p>
            </div>
            <button
              type="button"
              className="rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-strong"
              onClick={() => setIsChannelDrawerOpen(true)}
            >
              新增渠道
            </button>
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
                      <StatusBadge status={channel.status} label={channel.status === 'active' ? 'active' : 'disabled'} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-medium text-ink">
                        {getTestStatusLabel(channel.lastTestStatus)}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {formatDateTime(channel.lastTestedAt)}
                      </p>
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

        <section className="surface-panel rounded-[30px] p-6">
          <div className="flex flex-col gap-3 border-b border-line-soft pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Logical Models
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                逻辑模型与多路由优先级
              </h3>
            </div>
            <p className="max-w-xl text-sm leading-6 text-ink-soft">
              现有 routes 在下方直接展开，便于运营同屏对照别名、价格、优先级和上游模型。
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            {logicalModels.map((logicalModel) => (
              <article key={logicalModel.id} className="surface-card rounded-[24px] p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-semibold text-brand-strong">{logicalModel.alias}</h4>
                        <StatusBadge status={logicalModel.status} label="active" />
                      </div>
                    <p className="mt-2 text-sm leading-6 text-ink-soft">
                      {getLogicalModelDescription(logicalModel.description)}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-line-soft bg-white/70 px-4 py-3 text-right">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                      Routes
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-brand-strong">
                      {logicalModel.routes.length}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {logicalModel.routes.map((route) => (
                    <div
                      key={route.id}
                      className="grid gap-3 rounded-[20px] border border-line-soft bg-white/72 px-4 py-4 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.6fr]"
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
      </section>

      <aside className="space-y-4">
        {isChannelDrawerOpen ? (
          <section className="surface-panel grid-glow rounded-[30px] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                  Channel Intake
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
                  新增渠道
                </h3>
              </div>
              <button
                type="button"
                className="rounded-full border border-line-soft px-3 py-2 text-sm text-ink-soft"
                onClick={() => setIsChannelDrawerOpen(false)}
              >
                关闭
              </button>
            </div>

            <form
              className="mt-6 space-y-4"
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
              <label className="block">
                <span className="text-sm font-medium text-ink">渠道名称</span>
                <input
                  value={channelForm.name}
                  onChange={(event) => setChannelForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Base URL</span>
                <input
                  value={channelForm.baseUrl}
                  onChange={(event) =>
                    setChannelForm((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">API Key</span>
                <input
                  value={channelForm.apiKey}
                  onChange={(event) => setChannelForm((current) => ({ ...current, apiKey: event.target.value }))}
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">默认模型</span>
                <input
                  value={channelForm.defaultModelId}
                  onChange={(event) =>
                    setChannelForm((current) => ({ ...current, defaultModelId: event.target.value }))
                  }
                  className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-full bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-strong"
              >
                保存渠道
              </button>
            </form>
          </section>
        ) : (
          <section className="surface-panel rounded-[30px] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Channel Drawer</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">新增渠道</h3>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              点击左侧按钮展开侧边录入面板，创建新的上游渠道。
            </p>
          </section>
        )}

        <section className="surface-panel rounded-[30px] p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">Strategy Editor</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-brand-strong">
            逻辑模型编辑区
          </h3>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createLogicalModelMutation.mutate();
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-ink">逻辑模型别名</span>
              <input
                value={logicalModelForm.alias}
                onChange={(event) =>
                  setLogicalModelForm((current) => ({ ...current, alias: event.target.value }))
                }
                className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">说明</span>
              <textarea
                value={logicalModelForm.description}
                onChange={(event) =>
                  setLogicalModelForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>

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
                          setRouteDrafts((current) => current.filter((_, routeIndex) => routeIndex !== index))
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
                              routeIndex === index ? { ...item, channelId: event.target.value } : item
                            )
                          )
                        }
                        className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
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
                                : item
                            )
                          )
                        }
                        className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
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
                                  : item
                              )
                            )
                          }
                          className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
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
                                  : item
                              )
                            )
                          }
                          className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
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
                                routeIndex === index ? { ...item, currency: event.target.value } : item
                              )
                            )
                          }
                          className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-ink">优先级</span>
                        <input
                          value={route.priority}
                          onChange={(event) =>
                            setRouteDrafts((current) =>
                              current.map((item, routeIndex) =>
                                routeIndex === index ? { ...item, priority: event.target.value } : item
                              )
                            )
                          }
                          className="mt-2 block w-full rounded-[18px] border border-line-strong bg-white/72 px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-medium text-brand-strong transition hover:border-brand hover:text-brand"
              onClick={() => setRouteDrafts((current) => [...current, emptyRouteDraft()])}
            >
              添加路由
            </button>

            <button
              type="submit"
              className="w-full rounded-full bg-brand px-5 py-3 text-base font-semibold text-white transition hover:bg-brand-strong"
            >
              保存逻辑模型
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}
