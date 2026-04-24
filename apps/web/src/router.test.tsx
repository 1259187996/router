import { createMemoryHistory } from '@tanstack/history';
import { describe, expect, it, vi } from 'vitest';
import { screen, renderRouter } from './test-utils';
import { createAppRouter } from './router';

describe('app router auth flow', () => {
  it('redirects anonymous visitors from the console shell to /login', async () => {
    const api = {
      login: vi.fn(),
      getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    });

    renderRouter(router);

    expect(await screen.findByRole('heading', { name: /控制台登录/i })).toBeInTheDocument();
    expect(api.getCurrentUser).toHaveBeenCalled();
  });

  it('redirects authenticated visitors away from /login into the console shell', async () => {
    const api = {
      login: vi.fn(),
      getCurrentUser: vi.fn().mockResolvedValue({
        user: {
          email: 'admin@example.com',
          role: 'admin',
        },
      }),
    };
    const router = createAppRouter({
      api,
      history: createMemoryHistory({
        initialEntries: ['/login'],
      }),
    });

    renderRouter(router);

    expect(await screen.findByText(/路由控制台概览/i)).toBeInTheDocument();
  });
});
