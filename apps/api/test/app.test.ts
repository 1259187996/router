import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

describe('buildApp', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok on /health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('allows logging to be disabled', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const quietApp = await buildApp({ logger: false });

    try {
      const response = await quietApp.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(stdoutWrite).not.toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      await quietApp.close();
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
    }
  });

  it('does not initialize the production database when only importing the app module', () => {
    const result = spawnSync(
      pnpmBin,
      ['exec', 'tsx', '-e', "import('./src/app.ts').then(() => console.log('imported'))"],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'production'
        }
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('imported');
  }, 15_000);
});
