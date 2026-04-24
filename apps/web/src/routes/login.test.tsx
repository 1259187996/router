import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import { LoginRouteComponent } from './login';

describe('LoginRouteComponent', () => {
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
