import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../test-utils';
import { IndexRouteComponent } from './index';

describe('IndexRouteComponent', () => {
  it('renders a token-led operations homepage for operators', () => {
    render(<IndexRouteComponent />);

    expect(screen.getByRole('heading', { name: 'Token 使用总览' })).toBeInTheDocument();
    expect(screen.getByText('本月 token')).toBeInTheDocument();
    expect(screen.getByText('活跃 Key')).toBeInTheDocument();
    expect(screen.getByText('异常账户')).toBeInTheDocument();
    expect(screen.getAllByText('高消耗用户').length).toBeGreaterThan(0);
    expect(screen.getAllByText('渠道健康').length).toBeGreaterThan(0);
    expect(screen.getByText('异常提醒')).toBeInTheDocument();
    expect(screen.getByText('快捷操作')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看 Key 与权限' })).toHaveAttribute('href', '/tokens');
    expect(screen.getByRole('link', { name: '巡检渠道与路由' })).toHaveAttribute('href', '/channels');
    expect(screen.getByRole('link', { name: '排查请求日志' })).toHaveAttribute('href', '/logs');
    expect(screen.queryByText('暂无内容')).not.toBeInTheDocument();
    expect(screen.queryByText('search-batch')).not.toBeInTheDocument();
    expect(screen.queryByText(/后续 Task 3/i)).not.toBeInTheDocument();
  });

  it('uses app surface primitives as the only shared surface API', () => {
    const sourceFiles = [
      'src/styles.css',
      'src/components/app-shell.tsx',
      'src/router.tsx',
      'src/routes/login.tsx',
      'src/routes/channels.tsx',
      'src/routes/tokens.tsx',
      'src/routes/logs.tsx',
      'src/routes/logs.$logId.tsx',
    ];

    for (const file of sourceFiles) {
      const content = readFileSync(resolve(process.cwd(), file), 'utf8');

      expect(content).not.toContain('surface-panel');
      expect(content).not.toContain('surface-card');
    }
  });
});
