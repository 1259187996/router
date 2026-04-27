import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../test-utils';
import { IndexRouteComponent } from './index';

describe('IndexRouteComponent', () => {
  it('renders the usage-led overview sections for operators', () => {
    render(<IndexRouteComponent />);

    expect(screen.getByRole('heading', { name: 'Token 使用总览' })).toBeInTheDocument();
    expect(screen.getByText('高消耗用户')).toBeInTheDocument();
    expect(screen.getByText('渠道健康')).toBeInTheDocument();
    expect(screen.getByText('异常提醒')).toBeInTheDocument();
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
