import { QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { RouterProvider, type AnyRouter } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { createAppQueryClient } from './lib/query-client';

export * from '@testing-library/react';
export { screen };

export function render(ui: ReactElement) {
  const queryClient = createAppQueryClient();

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

export function renderRouter(router: AnyRouter) {
  const queryClient = createAppQueryClient();

  return rtlRender(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
