import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChannelRecord,
  CreateChannelInput,
  CreateLogicalModelInput,
  LogicalModelRecord,
} from '../lib/api-client';
import { render, screen, waitFor, within } from '../test-utils';
import { ChannelsRouteComponent } from './channels';

describe('ChannelsRouteComponent', () => {
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

    expect(await screen.findByText('渠道策略')).toBeInTheDocument();
    expect(await screen.findByText('OpenAI-compatible')).toBeInTheDocument();
    expect((await screen.findAllByText('OpenAI 主链路')).length).toBeGreaterThan(0);
    expect(await screen.findByText('chat-default')).toBeInTheDocument();
    expect((await screen.findAllByText('gpt-4o')).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: '新增渠道' }));
    await userEvent.type(screen.getByLabelText('渠道名称'), 'Anthropic 备链');
    await userEvent.type(screen.getByLabelText('Base URL'), 'https://api.anthropic.com/v1');
    await userEvent.type(screen.getByLabelText('API Key'), 'sk-ant');
    await userEvent.type(screen.getByLabelText('默认模型'), 'claude-3-7-sonnet');
    await userEvent.click(screen.getByRole('button', { name: '保存渠道' }));

    await waitFor(() => {
      expect(api.createChannel).toHaveBeenCalledWith({
        name: 'Anthropic 备链',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant',
        defaultModelId: 'claude-3-7-sonnet',
      });
    });
    expect((await screen.findAllByText('Anthropic 备链')).length).toBeGreaterThan(0);

    const channelRow = screen.getByRole('row', { name: /OpenAI 主链路/i });
    await userEvent.click(within(channelRow).getByRole('button', { name: '测试渠道' }));

    await waitFor(() => {
      expect(api.testChannel).toHaveBeenCalledWith('channel-1');
    });
    expect(await screen.findByText('最近测试通过')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('逻辑模型别名'), 'analysis-default');
    await userEvent.type(screen.getByLabelText('说明'), '分析任务优先走 OpenAI');
    await userEvent.selectOptions(screen.getByLabelText('关联渠道'), 'channel-1');
    await userEvent.clear(screen.getByLabelText('上游模型'));
    await userEvent.type(screen.getByLabelText('上游模型'), 'o4-mini');
    await userEvent.clear(screen.getByLabelText('输入价格'));
    await userEvent.type(screen.getByLabelText('输入价格'), '1.2000');
    await userEvent.clear(screen.getByLabelText('输出价格'));
    await userEvent.type(screen.getByLabelText('输出价格'), '4.8000');
    await userEvent.clear(screen.getByLabelText('币种'));
    await userEvent.type(screen.getByLabelText('币种'), 'USD');
    await userEvent.clear(screen.getByLabelText('优先级'));
    await userEvent.type(screen.getByLabelText('优先级'), '5');
    await userEvent.click(screen.getByRole('button', { name: '保存逻辑模型' }));

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
    expect(await screen.findByText('analysis-default')).toBeInTheDocument();
  });
});
