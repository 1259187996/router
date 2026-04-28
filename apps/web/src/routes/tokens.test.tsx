import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateTokenInput, LogicalModelRecord, TokenRecord, UpdateTokenInput } from '../lib/api-client';
import { render, screen, waitFor, within } from '../test-utils';
import { TokensRouteComponent } from './tokens';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TokensRouteComponent', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('lists masked tokens, creates a token with a copy dialog, edits a token, and deletes with confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    let tokenState: TokenRecord[] = [
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
        rawToken: 'rt_existing_visible',
      },
      {
        id: 'token-archived',
        name: '旧版 SDK',
        logicalModelId: 'model-2',
        budgetLimitUsd: '12.00',
        budgetUsedUsd: '12.00',
        budgetStatus: 'exhausted' as const,
        status: 'expired' as const,
        expiresAt: '2027-01-01T00:00:00.000Z',
        lastUsedAt: '2026-04-23T09:00:00.000Z',
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-23T09:00:00.000Z',
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
      listTokens: vi.fn().mockImplementation(async () => ({
        tokens: tokenState.map((token) => ({ ...token })),
      })),
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels }),
      getToken: vi.fn(),
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

        tokenState = [token, ...tokenState];
        return { token: { ...token } };
      }),
      updateToken: vi.fn().mockImplementation(async (tokenId: string, input: UpdateTokenInput) => {
        tokenState = tokenState.map((token) =>
          token.id === tokenId
            ? {
                ...token,
                ...input,
                expiresAt:
                  input.expiresAt === undefined
                    ? token.expiresAt
                    : input.expiresAt,
                updatedAt: '2026-04-24T04:00:00.000Z',
              }
            : token,
        );

        return {
          token: {
            ...tokenState.find((token) => token.id === tokenId)!,
          },
        };
      }),
      deleteToken: vi.fn().mockImplementation(async (tokenId: string) => {
        tokenState = tokenState.filter((token) => token.id !== tokenId);
      }),
    };

    render(<TokensRouteComponent api={api} />);

    expect(await screen.findByRole("heading", { name: "令牌管理" })).toBeInTheDocument();
    expect(await screen.findByText("SDK 生产")).toBeInTheDocument();
    expect(await screen.findByText("chat-default")).toBeInTheDocument();
    const existingTokenRow = screen.getByRole('row', { name: /SDK 生产/i });
    expect(within(existingTokenRow).getByText('****')).toBeInTheDocument();
    expect(within(existingTokenRow).queryByText('rt_existing_visible')).not.toBeInTheDocument();
    await userEvent.click(within(existingTokenRow).getByRole('button', { name: '显示 SDK 生产 token' }));
    expect(within(existingTokenRow).getByText('rt_existing_visible')).toBeInTheDocument();
    await userEvent.click(within(existingTokenRow).getByRole('button', { name: '复制 SDK 生产 token' }));
    expect(writeText).toHaveBeenCalledWith('rt_existing_visible');
    expect(toast.success).toHaveBeenCalledWith('令牌已复制');

    await userEvent.click(screen.getByRole("button", { name: "新建令牌" }));
    expect(await screen.findByRole("dialog", { name: "新建令牌" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建令牌" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("令牌名称"), "分析 SDK");
    await userEvent.selectOptions(screen.getByLabelText("逻辑模型"), "model-2");
    await userEvent.type(screen.getByLabelText("预算上限"), "25.00");
    await userEvent.type(screen.getByLabelText("过期时间"), "2026-10-01T08:30");
    expect(screen.getByRole("button", { name: "创建令牌" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "创建令牌" }));

    await waitFor(() => {
      expect(api.createToken).toHaveBeenCalledWith({
        name: "分析 SDK",
        logicalModelId: "model-2",
        budgetLimitUsd: "25.00",
        expiresAt: "2026-10-01T00:30:00.000Z",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "新建令牌" })).not.toBeInTheDocument();
    });
    const createdDialog = await screen.findByRole('dialog', { name: '令牌已创建' });
    expect(within(createdDialog).getByText('rt_visible_once')).toBeInTheDocument();
    await userEvent.click(within(createdDialog).getByRole('button', { name: '复制令牌' }));
    expect(writeText).toHaveBeenCalledWith('rt_visible_once');
    await userEvent.click(within(createdDialog).getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '令牌已创建' })).not.toBeInTheDocument();
    });
    const createdTokenRow = screen.getByRole("row", { name: /分析 SDK/i });
    expect(within(createdTokenRow).getByText("analysis-default")).toBeInTheDocument();

    const tokenRow = screen.getByRole("row", { name: /SDK 生产/i });
    const detailsTrigger = within(tokenRow).getByRole("button", { name: "查看 SDK 生产 详情" });
    await userEvent.click(detailsTrigger);
    const detailsDrawer = await screen.findByRole("dialog", { name: "令牌详情" });
    expect(within(detailsDrawer).getByRole("heading", { name: "令牌详情" })).toBeInTheDocument();
    expect(within(detailsDrawer).getByText("SDK 生产")).toBeInTheDocument();
    expect(within(detailsDrawer).getByText("chat-default")).toBeInTheDocument();
    expect(within(detailsDrawer).getByText("$32.10 / $100.00")).toBeInTheDocument();
    expect(within(detailsDrawer).getByText("model-1")).toBeInTheDocument();

    await userEvent.click(within(detailsDrawer).getByRole('button', { name: '编辑令牌' }));
    const editDialog = await screen.findByRole('dialog', { name: '编辑令牌' });
    const nameInput = screen.getByLabelText('令牌名称');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'SDK 生产重命名');
    const budgetInput = screen.getByLabelText('预算上限');
    await userEvent.clear(budgetInput);
    await userEvent.type(budgetInput, '150.00');
    await userEvent.selectOptions(screen.getByLabelText('状态'), 'active');
    await userEvent.click(within(editDialog).getByRole('button', { name: '保存令牌' }));

    await waitFor(() => {
      expect(api.updateToken).toHaveBeenCalledWith('token-1', {
        name: 'SDK 生产重命名',
        logicalModelId: 'model-1',
        budgetLimitUsd: '150.00',
        expiresAt: '2026-12-31T00:00:00.000Z',
        status: 'active',
      });
    });
    expect((await screen.findAllByText('SDK 生产重命名')).length).toBeGreaterThan(0);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '令牌详情' })).not.toBeInTheDocument();
    });

    await userEvent.click(within(tokenRow).getByRole('button', { name: '删除' }));
    const deleteDialog = await screen.findByRole('dialog', { name: '删除令牌' });
    expect(within(deleteDialog).getByText(/删除后该 token 将立即不可用/)).toBeInTheDocument();
    await userEvent.click(within(deleteDialog).getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(api.deleteToken).toHaveBeenCalledWith('token-1');
    });
    await waitFor(() => {
      expect(screen.queryByRole('row', { name: /SDK 生产重命名/i })).not.toBeInTheDocument();
    });
  });

  it('fetches the raw token on demand before revealing or copying from the list', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    const token: TokenRecord = {
      id: 'token-needs-detail',
      name: '按需展示',
      logicalModelId: 'model-1',
      budgetLimitUsd: '100.00',
      budgetUsedUsd: '0.00',
      budgetStatus: 'available',
      status: 'active',
      expiresAt: null,
      lastUsedAt: null,
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:00.000Z',
    };
    const logicalModels: LogicalModelRecord[] = [
      {
        id: 'model-1',
        alias: 'chat-default',
        description: '默认对话模型',
        status: 'active',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        routes: [],
      },
    ];
    const api = {
      listTokens: vi.fn().mockResolvedValue({ tokens: [token] }),
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels }),
      getToken: vi.fn().mockResolvedValue({
        token: {
          ...token,
          rawToken: 'rt_detail_visible',
        },
      }),
      createToken: vi.fn(),
      updateToken: vi.fn(),
      deleteToken: vi.fn(),
    };

    render(<TokensRouteComponent api={api} />);

    const tokenRow = await screen.findByRole('row', { name: /按需展示/i });
    expect(within(tokenRow).getByText('****')).toBeInTheDocument();

    await userEvent.click(within(tokenRow).getByRole('button', { name: '显示 按需展示 token' }));
    expect(await within(tokenRow).findByText('rt_detail_visible')).toBeInTheDocument();
    expect(api.getToken).toHaveBeenCalledWith('token-needs-detail');

    await userEvent.click(within(tokenRow).getByRole('button', { name: '复制 按需展示 token' }));
    expect(writeText).toHaveBeenCalledWith('rt_detail_visible');
    expect(toast.success).toHaveBeenCalledWith('令牌已复制');
  });

  it('shows a clear failure message when token creation is rejected by the backend', async () => {
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
    ];
    const api = {
      listTokens: vi.fn().mockResolvedValue({ tokens: [] }),
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels }),
      getToken: vi.fn(),
      createToken: vi.fn().mockRejectedValue(new Error('HTTP_400')),
      updateToken: vi.fn(),
      deleteToken: vi.fn(),
    };

    render(<TokensRouteComponent api={api} />);

    expect(await screen.findByRole("heading", { name: "令牌管理" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "新建令牌" }));

    await userEvent.type(screen.getByLabelText('令牌名称'), '失败令牌');
    await userEvent.selectOptions(screen.getByLabelText('逻辑模型'), 'model-1');
    await userEvent.type(screen.getByLabelText('预算上限'), '12.00');
    await userEvent.click(screen.getByRole('button', { name: '创建令牌' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/创建失败/);
    expect(api.createToken).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: '新建令牌' })).toBeInTheDocument();
  });

  it('shows a clear empty state when no logical models are available', async () => {
    const api = {
      listTokens: vi.fn().mockResolvedValue({ tokens: [] }),
      listLogicalModels: vi.fn().mockResolvedValue({ logicalModels: [] }),
      getToken: vi.fn(),
      createToken: vi.fn(),
      updateToken: vi.fn(),
      deleteToken: vi.fn(),
    };

    render(<TokensRouteComponent api={api} />);

    expect(await screen.findByRole("heading", { name: "令牌管理" })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "新建令牌" }));

    expect(await screen.findByRole('dialog', { name: '新建令牌' })).toBeInTheDocument();
    expect(await screen.findByText(/还没有可绑定的逻辑模型/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建令牌' })).toBeDisabled();
  });
});
