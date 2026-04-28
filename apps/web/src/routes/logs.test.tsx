import { createMemoryHistory } from '@tanstack/history';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAppRouter } from '../router';
import { render, renderRouter, screen, waitFor, within } from '../test-utils';
import { LogsRouteComponent } from './logs';

describe('LogsRouteComponent', () => {
  const logs = [
    {
      id: 'log-1',
      endpointType: 'responses',
      logicalModelAlias: 'analysis-default',
      finalUpstreamModelId: 'gpt-4.1-mini',
      requestStatus: 'success' as const,
      httpStatusCode: 200,
      settlementPriceUsd: '0.0821',
      rawUpstreamPriceUsd: '0.0790',
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 200,
      durationMs: 842,
      errorSummary: null,
      startedAt: '2026-04-24T08:00:00.000Z',
    },
  ];

  const detailResponse = {
    log: {
      id: 'log-1',
      endpointType: 'responses',
      logicalModelAlias: 'analysis-default',
      finalUpstreamModelId: 'gpt-4.1-mini',
      requestStatus: 'success' as const,
      httpStatusCode: 200,
      rawRequestSummary: {
        stream: true,
      },
      rawUsageJson: {
        input_tokens: 1000,
        output_tokens: 200,
        total_tokens: 1200,
      },
      eventSummaryJson: {
        kind: 'responses_stream',
        eventTypes: ['response.in_progress', 'response.output_text.delta', 'response.completed'],
      },
      rawUpstreamPriceUsd: '0.0790',
      settlementPriceUsd: '0.0821',
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 200,
      durationMs: 842,
      errorSummary: null,
      startedAt: '2026-04-24T08:00:00.000Z',
      finishedAt: '2026-04-24T08:00:00.842Z',
    },
    finalChannel: {
      id: 'channel-1',
      name: 'openai-main',
      baseUrl: 'https://api.openai.com/v1',
      defaultModelId: 'gpt-4.1-mini',
      status: 'active' as const,
    },
    finalRoute: {
      id: 'route-1',
      upstreamModelId: 'gpt-4.1-mini',
      inputPricePer1m: '50.0000',
      cachedInputPricePer1m: '5.0000',
      outputPricePer1m: '160.5000',
      currency: 'USD',
      priority: 1,
      status: 'active' as const,
    },
    attempts: [
      {
        id: 'attempt-1',
        requestLogId: 'log-1',
        attemptIndex: 1,
        attemptStatus: 'succeeded' as const,
        failureStage: null,
        errorSummary: null,
        startedAt: '2026-04-24T08:00:00.000Z',
        finishedAt: '2026-04-24T08:00:00.842Z',
        channel: {
          id: 'channel-1',
          name: 'openai-main',
          baseUrl: 'https://api.openai.com/v1',
          defaultModelId: 'gpt-4.1-mini',
          status: 'active' as const,
        },
        route: {
          id: 'route-1',
          upstreamModelId: 'gpt-4.1-mini',
          inputPricePer1m: '50.0000',
          cachedInputPricePer1m: '5.0000',
          outputPricePer1m: '160.5000',
          currency: 'USD',
          priority: 1,
          status: 'active' as const,
        },
      },
    ],
  };

  it('renders request rows with endpoint, cost, token usage, and detail trigger', async () => {
    const api = {
      listLogs: vi.fn().mockResolvedValue({
        logs,
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        summary: {
          totalRequests: 12,
          successfulRequests: 9,
          attentionRequests: 3,
          totalTokens: 9876,
          inputTokens: 8000,
          cachedInputTokens: 3000,
          outputTokens: 1876,
          settlementPriceUsd: '12.3400',
        },
      }),
      listTokens: vi.fn().mockResolvedValue({
        tokens: [
          {
            id: 'token-1',
            name: 'SDK 生产',
            logicalModelId: 'model-1',
            budgetLimitUsd: '10.00',
            budgetUsedUsd: '1.00',
            budgetStatus: 'available' as const,
            status: 'active' as const,
            expiresAt: null,
            lastUsedAt: null,
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:00.000Z',
          },
        ],
      }),
    };

    render(<LogsRouteComponent api={api} />);

    expect(await screen.findByRole("heading", { name: "请求日志" })).toBeInTheDocument();
    expect(await screen.findByText('9,876')).toBeInTheDocument();
    expect(await screen.findByText('输入 8,000 / 缓存 3,000 / 输出 1,876')).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /responses/i });

    expect(within(row).getByText('responses')).toBeInTheDocument();
    expect(within(row).getByText('analysis-default')).toBeInTheDocument();
    expect(within(row).getByText('$0.0821')).toBeInTheDocument();
    expect(within(row).getByText('输入 1000 / 缓存 100 / 输出 200')).toBeInTheDocument();
    expect(within(row).getByText('成功')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '查看详情' })).toBeInTheDocument();
    expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();
  });

  it('filters request logs by token and requests the next page', async () => {
    const api = {
      listLogs: vi.fn().mockImplementation(async (params?: { apiTokenId?: string; page?: number; pageSize?: number }) => ({
        logs,
        pagination: {
          page: params?.page ?? 1,
          pageSize: params?.pageSize ?? 20,
          total: 30,
          totalPages: 2,
        },
        summary: {
          totalRequests: 30,
          successfulRequests: 24,
          attentionRequests: 6,
          totalTokens: 12345,
          inputTokens: 10000,
          cachedInputTokens: 4000,
          outputTokens: 2345,
          settlementPriceUsd: '9.8765',
        },
      })),
      listTokens: vi.fn().mockResolvedValue({
        tokens: [
          {
            id: 'token-1',
            name: 'SDK 生产',
            logicalModelId: 'model-1',
            budgetLimitUsd: '10.00',
            budgetUsedUsd: '1.00',
            budgetStatus: 'available' as const,
            status: 'active' as const,
            expiresAt: null,
            lastUsedAt: null,
            createdAt: '2026-04-24T00:00:00.000Z',
            updatedAt: '2026-04-24T00:00:00.000Z',
          },
        ],
      }),
    };

    render(<LogsRouteComponent api={api} />);

    expect(await screen.findByRole('heading', { name: '请求日志' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'SDK 生产' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('按令牌筛选'), 'token-1');

    await waitFor(() => {
      expect(api.listLogs).toHaveBeenLastCalledWith({
        apiTokenId: 'token-1',
        page: 1,
        pageSize: 20,
      });
    });

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => {
      expect(api.listLogs).toHaveBeenLastCalledWith({
        apiTokenId: 'token-1',
        page: 2,
        pageSize: 20,
      });
    });
  });

  it('opens the log detail drawer on top of the ledger when operators inspect a request', async () => {
    const api = {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn().mockResolvedValue({
        user: {
          email: 'admin@example.com',
          role: 'admin',
        },
      }),
      listLogs: vi.fn().mockResolvedValue({ logs }),
      listTokens: vi.fn().mockResolvedValue({ tokens: [] }),
      getLogDetail: vi.fn().mockResolvedValue(detailResponse),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({
        initialEntries: ['/logs'],
      }),
    });

    renderRouter(router);

    const row = await screen.findByRole('row', { name: /responses/i });
    await userEvent.click(within(row).getByRole('button', { name: '查看详情' }));

    const detailDrawer = await screen.findByRole('dialog', { name: '请求详情' });
    expect(within(detailDrawer).getByText('价格解释')).toBeInTheDocument();
    expect(within(detailDrawer).getAllByText('openai-main').length).toBeGreaterThan(0);
  });
});
