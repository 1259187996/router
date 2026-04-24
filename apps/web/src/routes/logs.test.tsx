import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '../test-utils';
import { LogsRouteComponent } from './logs';

describe('LogsRouteComponent', () => {
  it('renders request rows with endpoint, cost, token usage, and status', async () => {
    const api = {
      listLogs: vi.fn().mockResolvedValue({
        logs: [
          {
            id: 'log-1',
            endpointType: 'responses',
            logicalModelAlias: 'analysis-default',
            finalUpstreamModelId: 'gpt-4.1-mini',
            requestStatus: 'success',
            httpStatusCode: 200,
            settlementPriceUsd: '0.0821',
            rawUpstreamPriceUsd: '0.0790',
            inputTokens: 1000,
            outputTokens: 200,
            durationMs: 842,
            errorSummary: null,
            startedAt: '2026-04-24T08:00:00.000Z',
          },
        ],
      }),
    };

    render(<LogsRouteComponent api={api} />);

    expect(await screen.findByRole('heading', { name: '请求日志' })).toBeInTheDocument();
    const row = await screen.findByRole('row', { name: /responses/i });

    expect(within(row).getByText('responses')).toBeInTheDocument();
    expect(within(row).getByText('analysis-default')).toBeInTheDocument();
    expect(within(row).getByText('$0.0821')).toBeInTheDocument();
    expect(within(row).getByText('输入 1000 / 输出 200')).toBeInTheDocument();
    expect(within(row).getByText('成功')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '查看详情' })).toHaveAttribute('href', '/logs/log-1');
  });
});
