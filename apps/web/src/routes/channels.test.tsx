import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
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
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels: [] }),
      createChannel: vi.fn(),
      testChannel: vi.fn(),
      createLogicalModel: vi.fn(),
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
    expect(createChannelButton).toHaveFocus();
  });

  it('renders channels and logical model routes, creates a channel, tests a channel, and creates a logical model', async () => {
    const channels: ChannelRecord[] = [
      {
        id: 'channel-1',
        name: 'OpenAI 主链路',
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

    const api = {
      listChannels: vi.fn().mockImplementation(async () => ({ channels })),
      listLogicalModels: vi.fn().mockImplementation(async () => ({ logicalModels })),
      createChannel: vi.fn().mockImplementation(async (input: CreateChannelInput) => {
        channels.unshift({
          id: 'channel-2',
          name: input.name,
          baseUrl: input.baseUrl,
          defaultModelId: input.defaultModelId,
          status: 'active',
          lastTestStatus: null,
          lastTestError: null,
          lastTestedAt: null,
          createdAt: '2026-04-24T01:00:00.000Z',
          updatedAt: '2026-04-24T01:00:00.000Z',
        });

        return { channel: channels[0] };
      }),
      testChannel: vi.fn().mockImplementation(async (channelId: string) => {
        const channel = channels.find((item) => item.id === channelId);

        if (channel) {
          channel.lastTestStatus = 'ok';
          channel.lastTestedAt = '2026-04-24T02:00:00.000Z';
        }

        return { ok: true };
      }),
      createLogicalModel: vi.fn().mockImplementation(async (input: CreateLogicalModelInput) => {
        const logicalModel = {
          id: 'model-2',
          alias: input.alias,
          description: input.description,
          status: 'active' as const,
          createdAt: '2026-04-24T03:00:00.000Z',
          updatedAt: '2026-04-24T03:00:00.000Z',
          routes: input.routes.map((route, index) => ({
            id: `route-new-${index}`,
            channelId: route.channelId,
            upstreamModelId: route.upstreamModelId,
            inputPricePer1m: route.inputPricePer1m,
            outputPricePer1m: route.outputPricePer1m,
            currency: route.currency,
            priority: route.priority,
            status: 'active' as const,
            channelName: channels.find((item) => item.id === route.channelId)?.name ?? '',
          })),
        };

        logicalModels.unshift(logicalModel);
        return { logicalModel, routes: logicalModel.routes };
      }),
    };

    render(<ChannelsRouteComponent api={api} />);

    expect(await screen.findByRole('heading', { level: 1, name: '渠道策略' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByText('OpenAI-compatible')).toBeInTheDocument();
    expect((await screen.findAllByText('OpenAI 主链路')).length).toBeGreaterThan(0);
    expect(await screen.findByText('chat-default')).toBeInTheDocument();
    expect((await screen.findAllByText('gpt-4o')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: '新增渠道' }));
    const createChannelDialog = await screen.findByRole('dialog', { name: '新增渠道' });
    setControlValue(
      getInputElement<HTMLInputElement>(createChannelDialog, '#channel-name'),
      'Anthropic 备链',
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

    await userEvent.click(screen.getByRole('button', { name: '新建逻辑模型' }));
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
      getInputElement<HTMLSelectElement>(createLogicalModelDialog, '#route-channel-0'),
      'channel-1',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-upstream-model-0'),
      'o4-mini',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-input-price-0'),
      '1.2000',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-output-price-0'),
      '4.8000',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-currency-0'),
      'USD',
    );
    setControlValue(
      getInputElement<HTMLInputElement>(createLogicalModelDialog, '#route-priority-0'),
      '5',
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
            upstreamModelId: 'o4-mini',
            inputPricePer1m: '1.2000',
            outputPricePer1m: '4.8000',
            currency: 'USD',
            priority: 5,
          },
        ],
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '新建逻辑模型' })).not.toBeInTheDocument();
    });
    expect(await screen.findByText('analysis-default')).toBeInTheDocument();
  });
});
