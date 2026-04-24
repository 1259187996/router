import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CreateTokenInput, LogicalModelRecord, TokenRecord } from '../lib/api-client';
import { render, screen, waitFor, within } from '../test-utils';
import { TokensRouteComponent } from './tokens';

describe('TokensRouteComponent', () => {
  it('lists tokens, creates a token, and revokes a token', async () => {
    const tokens: TokenRecord[] = [
      {
        id: 'token-1',
        name: 'SDK 生产',
        logicalModelId: 'model-1',
        budgetLimitUsd: '100.00',
        budgetUsedUsd: '32.10',
        budgetStatus: 'available' as const,
        status: 'active' as const,
        expiresAt: '2026-12-31T00:00:00.000Z',
        lastUsedAt: null,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ];
    const logicalModels: LogicalModelRecord[] = [
      {
        id: 'model-1',
        alias: 'chat-default',
        description: '默认对话模型',
        status: 'active' as const,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        routes: [],
      },
      {
        id: 'model-2',
        alias: 'analysis-default',
        description: '分析模型',
        status: 'active' as const,
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        routes: [],
      },
    ];

    const api = {
      listTokens: vi.fn().mockImplementation(async () => ({ tokens })),
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels }),
      createToken: vi.fn().mockImplementation(async (input: CreateTokenInput) => {
        const token = {
          id: 'token-2',
          name: input.name,
          logicalModelId: input.logicalModelId,
          budgetLimitUsd: input.budgetLimitUsd,
          budgetUsedUsd: '0.00',
          budgetStatus: 'available' as const,
          status: 'active' as const,
          expiresAt: input.expiresAt,
          lastUsedAt: null,
          createdAt: '2026-04-24T02:00:00.000Z',
          updatedAt: '2026-04-24T02:00:00.000Z',
          rawToken: 'rt_visible_once',
        };

        tokens.unshift(token);
        return { token };
      }),
      revokeToken: vi.fn().mockImplementation(async (tokenId: string) => {
        const token = tokens.find((item) => item.id === tokenId);

        if (token) {
          token.status = 'revoked';
          token.updatedAt = '2026-04-24T03:00:00.000Z';
        }
      }),
    };

    render(<TokensRouteComponent api={api} />);

    expect(await screen.findByText('令牌管理')).toBeInTheDocument();
    expect(await screen.findByText('SDK 生产')).toBeInTheDocument();
    expect(await screen.findByText('chat-default')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '新建令牌' }));
    await userEvent.type(screen.getByLabelText('令牌名称'), '分析 SDK');
    await userEvent.selectOptions(screen.getByLabelText('逻辑模型'), 'model-2');
    await userEvent.type(screen.getByLabelText('预算上限'), '25.00');
    await userEvent.type(screen.getByLabelText('过期时间'), '2026-10-01T08:30');
    await userEvent.click(screen.getByRole('button', { name: '创建令牌' }));

    await waitFor(() => {
      expect(api.createToken).toHaveBeenCalledWith({
        name: '分析 SDK',
        logicalModelId: 'model-2',
        budgetLimitUsd: '25.00',
        expiresAt: '2026-10-01T00:30:00.000Z',
      });
    });
    expect(await screen.findByText('rt_visible_once')).toBeInTheDocument();
    expect(screen.getByText('analysis-default')).toBeInTheDocument();

    const tokenRow = screen.getByRole('row', { name: /SDK 生产/i });
    await userEvent.click(within(tokenRow).getByRole('button', { name: '吊销' }));

    await waitFor(() => {
      expect(api.revokeToken).toHaveBeenCalledWith('token-1');
    });
    expect(await screen.findByText('已吊销')).toBeInTheDocument();
  });

  it('shows a clear empty state when no logical models are available', async () => {
    const api = {
      listTokens: vi.fn().mockResolvedValue({ tokens: [] }),
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels: [] }),
      createToken: vi.fn(),
      revokeToken: vi.fn(),
    };

    render(<TokensRouteComponent api={api} />);

    await userEvent.click(await screen.findByRole('button', { name: '新建令牌' }));

    expect(await screen.findByText(/还没有可绑定的逻辑模型/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建令牌' })).toBeDisabled();
  });
});
