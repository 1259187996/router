import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import { LoginRouteComponent } from './login';
import { within } from '@testing-library/react';

describe('LoginRouteComponent', () => {
  it('keeps the login heading primary while scoping desktop and mobile copy to dedicated regions', () => {
    render(<LoginRouteComponent api={{ login: vi.fn() }} />);

    expect(screen.getByRole('heading', { level: 1, name: '控制台登录' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);

    const brandCover = screen.getByRole('region', { name: '登录品牌封面' });
    expect(within(brandCover).getByText('统一分发外部模型渠道')).toBeInTheDocument();
    expect(within(brandCover).getByText('按 Key / 用户查看 token 消耗')).toBeInTheDocument();

    const mobileHint = screen.getByRole('region', { name: '移动端登录提示' });
    expect(within(mobileHint).getByText('统一接入、权限发放与消耗追踪')).toBeInTheDocument();
  });

  it('submits email and password through the api client and enters the console', async () => {
    const login = vi.fn().mockResolvedValue({ user: { email: 'admin@example.com' } });
    const onAuthenticated = vi.fn();

    render(<LoginRouteComponent api={{ login }} onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText(/邮箱/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/密码/i), 'Admin123!Admin123!');
    await userEvent.click(screen.getByRole('button', { name: /登录/i }));

    expect(login).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'Admin123!Admin123!',
    });
    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });
});
