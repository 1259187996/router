import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test-utils';
import { LogDetailRouteComponent } from './logs.$logId';

describe('LogDetailRouteComponent', () => {
  it('renders settlement detail, attempts, and pricing explanation', async () => {
    const api = {
      getLogDetail: vi.fn().mockResolvedValue({
        log: {
          id: 'log-1',
          endpointType: 'responses',
          logicalModelAlias: 'analysis-default',
          finalUpstreamModelId: 'gpt-4.1-mini',
          requestStatus: 'success',
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
            eventTypes: [
              'response.in_progress',
              'response.output_text.delta',
              'response.completed',
            ],
          },
          rawUpstreamPriceUsd: '0.0790',
          settlementPriceUsd: '0.0821',
          inputTokens: 1000,
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
          status: 'active',
        },
        finalRoute: {
          id: 'route-1',
          upstreamModelId: 'gpt-4.1-mini',
          inputPricePer1m: '50.0000',
          outputPricePer1m: '160.5000',
          currency: 'USD',
          priority: 1,
          status: 'active',
        },
        attempts: [
          {
            id: 'attempt-1',
            requestLogId: 'log-1',
            attemptIndex: 1,
            attemptStatus: 'succeeded',
            failureStage: null,
            errorSummary: null,
            startedAt: '2026-04-24T08:00:00.000Z',
            finishedAt: '2026-04-24T08:00:00.842Z',
            channel: {
              id: 'channel-1',
              name: 'openai-main',
              baseUrl: 'https://api.openai.com/v1',
              defaultModelId: 'gpt-4.1-mini',
              status: 'active',
            },
            route: {
              id: 'route-1',
              upstreamModelId: 'gpt-4.1-mini',
              inputPricePer1m: '50.0000',
              outputPricePer1m: '160.5000',
              currency: 'USD',
              priority: 1,
              status: 'active',
            },
          },
        ],
      }),
    };

    render(<LogDetailRouteComponent api={api} logId="log-1" />);

    expect(await screen.findByRole('heading', { name: '请求详情' })).toBeInTheDocument();
    expect((await screen.findAllByText('$0.0790')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('$0.0821')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('openai-main')).length).toBeGreaterThan(0);
    expect(await screen.findByText('1000 x 50.0000 / 1M')).toBeInTheDocument();
    expect(await screen.findByText('200 x 160.5000 / 1M')).toBeInTheDocument();
    expect(await screen.findByText(/response\.output_text\.delta/)).toBeInTheDocument();
  });
});
