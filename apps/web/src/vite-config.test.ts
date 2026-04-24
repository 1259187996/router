// @vitest-environment node

import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

describe('vite config', () => {
  it('proxies auth and internal api requests to the backend during development', () => {
    expect(viteConfig.server?.proxy).toMatchObject({
      '/auth': {
        target: expect.any(String),
      },
      '/internal': {
        target: expect.any(String),
      },
    });
  });
});
