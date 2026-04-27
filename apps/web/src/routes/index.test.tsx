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
});
