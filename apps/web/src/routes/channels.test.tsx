import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChannelModelRecord,
  ChannelRecord,
  CreateChannelInput,
  CreateLogicalModelInput,
  LogicalModelRecord,
} from '../lib/api-client';
import { fireEvent, render, screen, waitFor, within } from '../test-utils';
import { ChannelsRouteComponent } from './channels';

function getInputElement<T extends HTMLElement>(container: HTMLElement, selector: string) {
  const element = container.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Expected to find element: ${selector}`);
  }

  return element;
}

function setControlValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

describe('ChannelsRouteComponent', () => {
  it('moves focus into the modal, closes on Escape, and restores focus to the trigger', async () => {
    const api = {
      listChannels: vi.fn().mockResolvedValue({ channels: [] }),
      getChannelDetail: vi.fn(),
      createChannel: vi.fn(),
      updateChannel: vi.fn(),
      deleteChannel: vi.fn(),
      createChannelModel: vi.fn(),
      updateChannelModel: vi.fn(),
      deleteChannelModel: vi.fn(),
      testChannel: vi.fn(),
      createLogicalModel: vi.fn(),
      updateLogicalModel: vi.fn(),
      deleteLogicalModel: vi.fn(),
    };

    render(<ChannelsRouteComponent api={api} />);

    const createChannelButton = await screen.findByRole('button', { name: '新增渠道' });
    await userEvent.click(createChannelButton);

    const createChannelDialog = await screen.findByRole('dialog', { name: '新增渠道' });
    const activeElement =
      document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    expect(createChannelDialog).toContainElement(activeElement);

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '新增渠道' })).not.toBeInTheDocument();
    });
  });

  it('creates a preset provider channel with only name and api key', async () => {
    const api = {
      listChannels: vi.fn().mockResolvedValue({ channels: [] }),
      getChannelDetail: vi.fn(),
      createChannel: vi.fn().mockResolvedValue({
        channel: {
          id: 'channel-anthropic',
          name: 'Anthropic 备链',
          provider: 'anthropic',
          baseUrl: 'https://api.anthropic.com/v1',
          defaultModelId: 'claude-sonnet-4-5-20250929',
          status: 'active',
          lastTestStatus: null,
          lastTestError: null,
          lastTestedAt: null,
          createdAt: '2026-04-24T01:00:00.000Z',
          updatedAt: '2026-04-24T01:00:00.000Z',
        },
      }),
      updateChannel: vi.fn(),
      deleteChannel: vi.fn(),
      createChannelModel: vi.fn(),
      updateChannelModel: vi.fn(),
      deleteChannelModel: vi.fn(),
      testChannel: vi.fn(),
      createLogicalModel: vi.fn(),
      updateLogicalModel: vi.fn(),
      deleteLogicalModel: vi.fn(),
    };

    render(<ChannelsRouteComponent api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: '新增渠道' }));
    const createChannelDialog = await screen.findByRole('dialog', { name: '新增渠道' });
    setControlValue(getInputElement<HTMLInputElement>(createChannelDialog, '#channel-name'), 'Anthropic 备链');
    await userEvent.selectOptions(
      getInputElement<HTMLSelectElement>(createChannelDialog, '#channel-provider'),
      'anthropic',
    );
    setControlValue(getInputElement<HTMLInputElement>(createChannelDialog, '#channel-api-key'), 'sk-ant');

    expect(createChannelDialog.querySelector('#channel-base-url')).not.toBeInTheDocument();
    expect(createChannelDialog.querySelector('#channel-default-model')).not.toBeInTheDocument();

    await userEvent.click(within(createChannelDialog).getByRole('button', { name: '保存渠道' }));

    await waitFor(() => {
      expect(api.createChannel).toHaveBeenCalledWith({
        name: 'Anthropic 备链',
        provider: 'anthropic',
        apiKey: 'sk-ant',
      });
    });
  });

  it('renders channel details in a drawer, creates channel models, tests a channel, and creates a channel-scoped logical model', async () => {
    const channels: ChannelRecord[] = [
      {
        id: 'channel-1',
        name: 'OpenAI 主链路',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        defaultModelId: 'gpt-4o',
        status: 'active' as const,
        lastTestStatus: null,
        lastTestError: null,
        lastTestedAt: null,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ];
    const logicalModels: LogicalModelRecord[] = [
      {
        id: 'model-1',
        alias: 'chat-default',
        description: '主对话路由',
        status: 'active' as const,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        routes: [
          {
            id: 'route-1',
            channelId: 'channel-1',
            upstreamModelId: 'gpt-4o',
            inputPricePer1m: '5.0000',
            outputPricePer1m: '15.0000',
            currency: 'USD',
            priority: 10,
            status: 'active' as const,
            channelName: 'OpenAI 主链路',
          },
        ],
      },
    ];
    const channelModels: ChannelModelRecord[] = [
      {
        id: 'channel-model-1',
        channelId: 'channel-1',
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        status: 'active' as const,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'channel-model-2',
        channelId: 'channel-1',
        upstreamModelId: 'gpt-4o-mini',
        inputPricePer1m: '1.0000',
        outputPricePer1m: '2.0000',
        currency: 'USD',
        status: 'active' as const,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ];

    const api = {
      listChannels: vi.fn().mockImplementation(async () => ({ channels })),
      getChannelDetail: vi.fn().mockImplementation(async (channelId: string) => {
        const channel = channels.find((item) => item.id === channelId);

        if (!channel) {
          throw new Error('HTTP_404');
        }

        return {
          channel,
          models: channelModels,
          logicalModels,
        };
      }),
      createChannel: vi.fn().mockImplementation(async (input: CreateChannelInput) => {
        channels.unshift({
          id: 'channel-2',
          name: input.name,
          provider: input.provider ?? 'openai-compatible',
          baseUrl: input.baseUrl ?? 'https://api.openai.com/v1',
          defaultModelId: input.defaultModelId ?? 'gpt-5.5',
          status: 'active',
          lastTestStatus: null,
          lastTestError: null,
          lastTestedAt: null,
          createdAt: '2026-04-24T01:00:00.000Z',
          updatedAt: '2026-04-24T01:00:00.000Z',
        });

        return { channel: channels[0] };
      }),
      updateChannel: vi.fn(),
      deleteChannel: vi.fn(),
      createChannelModel: vi.fn().mockImplementation(async () => {
        const model: ChannelModelRecord = {
          id: 'channel-model-3',
          channelId: 'channel-1',
          upstreamModelId: 'gpt-4o-nano',
          inputPricePer1m: '1.0000',
          outputPricePer1m: '2.0000',
          currency: 'USD',
          status: 'active' as const,
          createdAt: '2026-04-24T04:00:00.000Z',
          updatedAt: '2026-04-24T04:00:00.000Z',
        };

        channelModels.push(model);

        return { model };
      }),
      updateChannelModel: vi.fn(),
      deleteChannelModel: vi.fn(),
      testChannel: vi.fn().mockImplementation(async (channelId: string) => {
        const channel = channels.find((item) => item.id === channelId);

        if (channel) {
          channel.lastTestStatus = 'ok';
          channel.lastTestedAt = '2026-04-24T02:00:00.000Z';
        }

        return { ok: true };
      }),
      createLogicalModel: vi.fn().mockImplementation(async (input: CreateLogicalModelInput) => {
        const logicalModel: LogicalModelRecord = {
          id: 'model-2',
          alias: input.alias,
          description: input.description,
          status: 'active' as const,
          createdAt: '2026-04-24T03:00:00.000Z',
          updatedAt: '2026-04-24T03:00:00.000Z',
          routes: input.routes.map((route, index) => {
            const selectedModel = channelModels.find((model) => model.id === route.channelModelId);

            return {
              id: `route-new-${index}`,
              channelId: route.channelId,
              channelModelId: route.channelModelId,
              upstreamModelId: route.upstreamModelId ?? selectedModel?.upstreamModelId ?? null,
              inputPricePer1m: route.inputPricePer1m ?? selectedModel?.inputPricePer1m ?? '0.0000',
              outputPricePer1m: route.outputPricePer1m ?? selectedModel?.outputPricePer1m ?? '0.0000',
              currency: route.currency ?? selectedModel?.currency ?? 'USD',
              priority: route.priority,
              status: 'active' as const,
              channelName: channels.find((item) => item.id === route.channelId)?.name ?? '',
            };
          }),
        };

        logicalModels.unshift(logicalModel);
        return { logicalModel, routes: logicalModel.routes };
      }),
      updateLogicalModel: vi.fn(),
      deleteLogicalModel: vi.fn(),
    };

    render(<ChannelsRouteComponent api={api} />);

    expect(await screen.findByRole('heading', { name: '渠道策略' })).toBeInTheDocument();
    expect((await screen.findAllByText('OpenAI 主链路')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: '新增渠道' }));
    const createChannelDialog = await screen.findByRole('dialog', { name: '新增渠道' });
    const channelNameInput = getInputElement<HTMLInputElement>(createChannelDialog, '#channel-name');
    await userEvent.click(channelNameInput);
    await userEvent.type(channelNameInput, 'Anthropic 备链');
    expect(channelNameInput).toHaveFocus();
    await userEvent.selectOptions(
      getInputElement<HTMLSelectElement>(createChannelDialog, '#channel-provider'),
      'openai-compatible',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createChannelDialog, '#channel-base-url'),
      'https://api.anthropic.com/v1',
    );
    setControlValue(getInputElement<HTMLInputElement>(createChannelDialog, '#channel-api-key'), 'sk-ant');
    setControlValue(
      getInputElement<HTMLInputElement>(createChannelDialog, '#channel-default-model'),
      'claude-3-7-sonnet',
    );
    await userEvent.click(within(createChannelDialog).getByRole('button', { name: '保存渠道' }));

    await waitFor(() => {
      expect(api.createChannel).toHaveBeenCalledWith({
        name: 'Anthropic 备链',
        provider: 'openai-compatible',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant',
        defaultModelId: 'claude-3-7-sonnet',
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '新增渠道' })).not.toBeInTheDocument();
    });
    expect((await screen.findAllByText('Anthropic 备链')).length).toBeGreaterThan(0);

    const channelRow = screen.getByRole('row', { name: /OpenAI 主链路/i });
    await userEvent.click(within(channelRow).getByRole('button', { name: '测试渠道' }));

    await waitFor(() => {
      expect(api.testChannel).toHaveBeenCalledWith('channel-1');
    });
    expect(await screen.findByText('最近测试通过')).toBeInTheDocument();

    await userEvent.click(within(channelRow).getByRole('button', { name: '查看详情' }));
    const detailDrawer = await screen.findByRole('dialog', { name: '渠道详情' });
    expect(api.getChannelDetail).toHaveBeenCalledWith('channel-1');
    expect(within(detailDrawer).getByText('chat-default')).toBeInTheDocument();
    expect(within(detailDrawer).getAllByText('gpt-4o').length).toBeGreaterThan(0);

    await userEvent.click(within(detailDrawer).getByRole('button', { name: '添加模型' }));
    const createModelDialog = await screen.findByRole('dialog', { name: '添加渠道模型' });
    setControlValue(
      getInputElement<HTMLInputElement>(createModelDialog, '#channel-model-upstream-model-id'),
      'gpt-4o-mini',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createModelDialog, '#channel-model-input-price'),
      '1.0000',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createModelDialog, '#channel-model-output-price'),
      '2.0000',
    );
    setControlValue(getInputElement<HTMLInputElement>(createModelDialog, '#channel-model-currency'), 'USD');
    await userEvent.click(within(createModelDialog).getByRole('button', { name: '保存模型' }));

    await waitFor(() => {
      expect(api.createChannelModel).toHaveBeenCalledWith('channel-1', {
        upstreamModelId: 'gpt-4o-mini',
        inputPricePer1m: '1.0000',
        outputPricePer1m: '2.0000',
        currency: 'USD',
      });
    });
    expect(await within(detailDrawer).findByText('gpt-4o-mini')).toBeInTheDocument();

    await userEvent.click(within(detailDrawer).getByRole('button', { name: '新建逻辑模型' }));
    const createLogicalModelDialog = await screen.findByRole('dialog', { name: '新建逻辑模型' });
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#logical-model-alias'),
      'analysis-default',
    );
    setControlValue(
      getInputElement<HTMLTextAreaElement>(createLogicalModelDialog, '#logical-model-description'),
      '分析任务优先走 OpenAI',
    );
    await userEvent.selectOptions(
      getInputElement<HTMLSelectElement>(createLogicalModelDialog, '#route-channel-model-0'),
      'channel-model-1',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-priority-0'),
      '5',
    );
    await userEvent.click(within(createLogicalModelDialog).getByRole('button', { name: '添加路由' }));
    await userEvent.selectOptions(
      getInputElement<HTMLSelectElement>(createLogicalModelDialog, '#route-channel-model-1'),
      'channel-model-2',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-priority-1'),
      '10',
    );
    await userEvent.click(
      within(createLogicalModelDialog).getByRole('button', { name: '保存逻辑模型' }),
    );

    await waitFor(() => {
      expect(api.createLogicalModel).toHaveBeenCalledWith({
        alias: 'analysis-default',
        description: '分析任务优先走 OpenAI',
        routes: [
          {
            channelId: 'channel-1',
            channelModelId: 'channel-model-1',
            priority: 5,
          },
          {
            channelId: 'channel-1',
            channelModelId: 'channel-model-2',
            priority: 10,
          },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '新建逻辑模型' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText('analysis-default')).toBeInTheDocument();
  });

  it('shows loading feedback while a channel test request is running', async () => {
    const channels: ChannelRecord[] = [
      {
        id: 'channel-1',
        name: 'OpenAI 主链路',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        defaultModelId: 'gpt-4o',
        status: 'active',
        lastTestStatus: null,
        lastTestError: null,
        lastTestedAt: null,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ];
    let resolveTestRequest!: (value: { ok: boolean }) => void;
    const testRequest = new Promise<{ ok: boolean }>((resolve) => {
      resolveTestRequest = resolve;
    });
    const api = {
      listChannels: vi.fn().mockResolvedValue({ channels }),
      getChannelDetail: vi.fn(),
      createChannel: vi.fn(),
      updateChannel: vi.fn(),
      deleteChannel: vi.fn(),
      createChannelModel: vi.fn(),
      updateChannelModel: vi.fn(),
      deleteChannelModel: vi.fn(),
      testChannel: vi.fn().mockReturnValue(testRequest),
      createLogicalModel: vi.fn(),
      updateLogicalModel: vi.fn(),
      deleteLogicalModel: vi.fn(),
    };

    render(<ChannelsRouteComponent api={api} />);

    const channelRow = await screen.findByRole('row', { name: /OpenAI 主链路/i });
    const testButton = within(channelRow).getByRole('button', { name: '测试渠道' });
    await userEvent.click(testButton);

    expect(api.testChannel).toHaveBeenCalledTimes(1);
    expect(api.testChannel).toHaveBeenCalledWith('channel-1');
    expect(within(channelRow).getByRole('button', { name: '测试中...' })).toBeDisabled();

    await userEvent.click(within(channelRow).getByRole('button', { name: '测试中...' }));
    expect(api.testChannel).toHaveBeenCalledTimes(1);

    resolveTestRequest({ ok: true });
    await waitFor(() => {
      expect(within(channelRow).getByRole('button', { name: '测试渠道' })).not.toBeDisabled();
    });
  });

  it('updates channels, channel models, and logical models from the channel drawer', async () => {
    const channels: ChannelRecord[] = [
      {
        id: 'channel-1',
        name: 'OpenAI 主链路',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        defaultModelId: 'gpt-4o',
        status: 'active',
        lastTestStatus: 'ok',
        lastTestError: null,
        lastTestedAt: '2026-04-24T00:00:00.000Z',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ];
    const channelModels: ChannelModelRecord[] = [
      {
        id: 'channel-model-1',
        channelId: 'channel-1',
        upstreamModelId: 'gpt-4o',
        inputPricePer1m: '5.0000',
        outputPricePer1m: '15.0000',
        currency: 'USD',
        status: 'active',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'channel-model-2',
        channelId: 'channel-1',
        upstreamModelId: 'gpt-4o-mini',
        inputPricePer1m: '0.5000',
        outputPricePer1m: '1.5000',
        currency: 'USD',
        status: 'active',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ];
    const logicalModels: LogicalModelRecord[] = [
      {
        id: 'logical-model-1',
        alias: 'chat-default',
        description: '主对话路由',
        status: 'active',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        routes: [
          {
            id: 'route-1',
            channelId: 'channel-1',
            channelModelId: 'channel-model-1',
            upstreamModelId: 'gpt-4o',
            inputPricePer1m: '5.0000',
            outputPricePer1m: '15.0000',
            currency: 'USD',
            priority: 10,
            status: 'active',
            channelName: 'OpenAI 主链路',
          },
        ],
      },
    ];

    const api = {
      listChannels: vi.fn().mockImplementation(async () => ({ channels })),
      getChannelDetail: vi.fn().mockImplementation(async () => ({
        channel: channels[0],
        models: channelModels,
        logicalModels,
      })),
      createChannel: vi.fn(),
      updateChannel: vi.fn().mockImplementation(async (_channelId: string, input: Partial<ChannelRecord> & { apiKey?: string }) => {
        channels[0] = {
          ...channels[0],
          ...input,
          updatedAt: '2026-04-24T06:00:00.000Z',
        };

        return { channel: channels[0] };
      }),
      deleteChannel: vi.fn(),
      createChannelModel: vi.fn(),
      updateChannelModel: vi.fn().mockImplementation(async (_channelId: string, modelId: string, input: Partial<ChannelModelRecord>) => {
        const modelIndex = channelModels.findIndex((model) => model.id === modelId);
        channelModels[modelIndex] = {
          ...channelModels[modelIndex],
          ...input,
          updatedAt: '2026-04-24T07:00:00.000Z',
        };

        return { model: channelModels[modelIndex] };
      }),
      deleteChannelModel: vi.fn(),
      testChannel: vi.fn(),
      createLogicalModel: vi.fn(),
      updateLogicalModel: vi.fn().mockImplementation(async (_logicalModelId: string, input: Partial<CreateLogicalModelInput>) => {
        logicalModels[0] = {
          ...logicalModels[0],
          alias: input.alias ?? logicalModels[0].alias,
          description: input.description ?? logicalModels[0].description,
          updatedAt: '2026-04-24T08:00:00.000Z',
          routes: input.routes
            ? input.routes.map((nextRoute, index) => {
                const selectedModel = channelModels.find((model) => model.id === nextRoute.channelModelId);

                return {
                  id: `route-updated-${index + 1}`,
                  channelId: nextRoute.channelId,
                  channelModelId: nextRoute.channelModelId,
                  upstreamModelId: selectedModel?.upstreamModelId ?? null,
                  inputPricePer1m: selectedModel?.inputPricePer1m ?? '0.0000',
                  outputPricePer1m: selectedModel?.outputPricePer1m ?? '0.0000',
                  currency: selectedModel?.currency ?? 'USD',
                  priority: nextRoute.priority,
                  status: 'active' as const,
                  channelName: channels[0].name,
                };
              })
            : logicalModels[0].routes,
        };

        return { logicalModel: logicalModels[0], routes: logicalModels[0].routes };
      }),
      deleteLogicalModel: vi.fn(),
    };

    render(<ChannelsRouteComponent api={api} />);

    const channelRow = await screen.findByRole('row', { name: /OpenAI 主链路/i });
    await userEvent.click(within(channelRow).getByRole('button', { name: '查看详情' }));
    const detailDrawer = await screen.findByRole('dialog', { name: '渠道详情' });

    await userEvent.click(within(detailDrawer).getByRole('button', { name: '编辑渠道' }));
    const editChannelDialog = await screen.findByRole('dialog', { name: '编辑渠道' });
    setControlValue(getInputElement<HTMLInputElement>(editChannelDialog, '#edit-channel-name'), 'OpenAI 高优先级链路');
    setControlValue(getInputElement<HTMLInputElement>(editChannelDialog, '#edit-channel-base-url'), 'https://gateway.openai.example/v1');
    setControlValue(getInputElement<HTMLInputElement>(editChannelDialog, '#edit-channel-api-key'), 'sk-updated');
    setControlValue(getInputElement<HTMLInputElement>(editChannelDialog, '#edit-channel-default-model'), 'gpt-4.1');
    await userEvent.click(within(editChannelDialog).getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(api.updateChannel).toHaveBeenCalledWith('channel-1', {
        name: 'OpenAI 高优先级链路',
        provider: 'openai-compatible',
        baseUrl: 'https://gateway.openai.example/v1',
        apiKey: 'sk-updated',
        defaultModelId: 'gpt-4.1',
      });
    });
    expect(await within(detailDrawer).findByText('OpenAI 高优先级链路')).toBeInTheDocument();

    await userEvent.click(within(detailDrawer).getByRole('button', { name: '编辑 gpt-4o' }));
    const editModelDialog = await screen.findByRole('dialog', { name: '编辑渠道模型' });
    setControlValue(getInputElement<HTMLInputElement>(editModelDialog, '#edit-channel-model-upstream-model-id'), 'gpt-4.1');
    setControlValue(getInputElement<HTMLInputElement>(editModelDialog, '#edit-channel-model-input-price'), '2.0000');
    setControlValue(getInputElement<HTMLInputElement>(editModelDialog, '#edit-channel-model-output-price'), '8.0000');
    setControlValue(getInputElement<HTMLInputElement>(editModelDialog, '#edit-channel-model-currency'), 'USD');
    await userEvent.click(within(editModelDialog).getByRole('button', { name: '保存模型修改' }));

    await waitFor(() => {
      expect(api.updateChannelModel).toHaveBeenCalledWith('channel-1', 'channel-model-1', {
        upstreamModelId: 'gpt-4.1',
        inputPricePer1m: '2.0000',
        outputPricePer1m: '8.0000',
        currency: 'USD',
      });
    });
    expect(await within(detailDrawer).findByText('gpt-4.1')).toBeInTheDocument();

    await userEvent.click(within(detailDrawer).getByRole('button', { name: '编辑 chat-default' }));
    const editLogicalModelDialog = await screen.findByRole('dialog', { name: '编辑逻辑模型' });
    setControlValue(getInputElement<HTMLInputElement>(editLogicalModelDialog, '#edit-logical-model-alias'), 'chat-fast');
    setControlValue(getInputElement<HTMLTextAreaElement>(editLogicalModelDialog, '#edit-logical-model-description'), '更快响应链路');
    await userEvent.selectOptions(
      getInputElement<HTMLSelectElement>(editLogicalModelDialog, '#edit-route-channel-model-0'),
      'channel-model-2',
    );
    setControlValue(getInputElement<HTMLInputElement>(editLogicalModelDialog, '#edit-route-priority-0'), '3');
    await userEvent.click(within(editLogicalModelDialog).getByRole('button', { name: '添加路由' }));
    await userEvent.selectOptions(
      getInputElement<HTMLSelectElement>(editLogicalModelDialog, '#edit-route-channel-model-1'),
      'channel-model-1',
    );
    setControlValue(getInputElement<HTMLInputElement>(editLogicalModelDialog, '#edit-route-priority-1'), '8');
    await userEvent.click(within(editLogicalModelDialog).getByRole('button', { name: '保存逻辑模型修改' }));

    await waitFor(() => {
      expect(api.updateLogicalModel).toHaveBeenCalledWith('logical-model-1', {
        alias: 'chat-fast',
        description: '更快响应链路',
        routes: [
          {
            channelId: 'channel-1',
            channelModelId: 'channel-model-2',
            priority: 3,
          },
          {
            channelId: 'channel-1',
            channelModelId: 'channel-model-1',
            priority: 8,
          },
        ],
      });
    });
    expect(await within(detailDrawer).findByText('chat-fast')).toBeInTheDocument();
  });
});
