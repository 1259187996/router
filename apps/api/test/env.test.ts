import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runTsx(source: string, env: NodeJS.ProcessEnv) {
  return spawnSync(pnpmBin, ['exec', 'tsx', '-e', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...env
    }
  });
}

describe('env parsing', () => {
  it.each([
    { rawValue: undefined, expected: 'false' },
    { rawValue: 'false', expected: 'false' },
    { rawValue: 'true', expected: 'true' }
  ])('parses CREATE_DATABASE_BEFORE_MIGRATE=$rawValue as $expected', ({ rawValue, expected }) => {
    const result = runTsx(
      "import('./src/env.ts').then(({ env }) => console.log(String(env.CREATE_DATABASE_BEFORE_MIGRATE)))",
      {
        NODE_ENV: 'test',
        ...(rawValue === undefined ? {} : { CREATE_DATABASE_BEFORE_MIGRATE: rawValue })
      }
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(expected);
  });
});

describe('drizzle config env contract', () => {
  it('fails fast in production when DATABASE_URL is missing', () => {
    const result = runTsx(
      "import('./drizzle.config.ts').then((config) => console.log(config.default.dbCredentials.url))",
      {
        NODE_ENV: 'production'
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('postgres://router:router@localhost:5432/router');
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('fails fast in production when CHANNEL_KEY_ENCRYPTION_SECRET is missing', () => {
    const result = runTsx("import('./src/env.ts').then(({ env }) => console.log(env.HOST))", {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://router:router@localhost:5432/router'
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('CHANNEL_KEY_ENCRYPTION_SECRET');
  });
});
