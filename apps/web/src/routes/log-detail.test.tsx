import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '../test-utils';
import { LogDetailRouteComponent } from './logs.$logId';

describe('LogDetailRouteComponent', () => {
  it('keeps log deep links working by rendering the drawer above the ledger', async () => {
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
          eventTypes: [
            'response.in_progress',
            'response.output_text.delta',
            'response.completed',
          ],
        },
        rawUpstreamPriceUsd: '0.0790',
        settlementPriceUsd: '0.0821',
        inputTokens: 1000,
        cachedInputTokens: 250,
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

    const api = {
      getLogDetail: vi.fn().mockResolvedValue(detailResponse),
    };

    render(<LogDetailRouteComponent api={api} logId="log-1" onClose={vi.fn()} />);

    await waitFor(() => expect(api.getLogDetail).toHaveBeenCalledWith("log-1"));

    const detailDrawer = await screen.findByRole("dialog", { name: "请求详情" });
    expect(detailDrawer).toHaveClass('lg:max-w-4xl');

    await waitFor(() => {
      expect(within(detailDrawer).getAllByText("$0.0790").length).toBeGreaterThan(0);
    });
    expect(within(detailDrawer).getAllByText("$0.0821").length).toBeGreaterThan(0);
    expect(within(detailDrawer).getAllByText("openai-main").length).toBeGreaterThan(0);
    expect(within(detailDrawer).getByText("750 x 50.0000 / 1M")).toBeInTheDocument();
    expect(within(detailDrawer).getByText("250 x 5.0000 / 1M")).toBeInTheDocument();
    expect(within(detailDrawer).getByText("200 x 160.5000 / 1M")).toBeInTheDocument();
  });
});
