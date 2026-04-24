import { execSync, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { request } from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runtimeDir = path.join(rootDir, '.playwright-runtime');
const processFile = path.join(runtimeDir, 'e2e-processes.json');
const e2eDatabaseUrl = 'postgres://router:router@127.0.0.1:5432/router_e2e';

function e2eEnv(extra: Record<string, string> = {}) {
  return {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl,
    TEST_DATABASE_URL: 'postgres://router:router@127.0.0.1:5432/router_test',
    CREATE_DATABASE_BEFORE_MIGRATE: 'true',
    HOST: '127.0.0.1',
    PORT: '3001',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD_HASH: 'change-me',
    CHANNEL_KEY_ENCRYPTION_SECRET: 'dev-test-channel-key-encryption-secret-32',
    ALLOW_PRIVATE_UPSTREAM_BASE_URLS: 'true',
    CHANNEL_TEST_TIMEOUT_MS: '5000',
    MOCK_UPSTREAM_HOST: '127.0.0.1',
    MOCK_UPSTREAM_PORT: '4010',
    ...extra,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port: number, host: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port });

      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (connected) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${host}:${port}`);
}

async function waitForPostgres(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      execSync('docker compose exec -T postgres pg_isready -U router -d router', {
        cwd: rootDir,
        env: process.env,
        stdio: 'ignore',
      });
      return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error('Timed out waiting for postgres readiness');
}

async function waitForHttp(urlString: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = request(urlString, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) < 500);
      });

      req.once('error', () => resolve(false));
      req.end();
    });

    if (ok) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${urlString}`);
}

function spawnDetached(command: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.env.SHELL ?? 'zsh', ['-lc', command], {
    cwd: rootDir,
    detached: true,
    env,
    stdio: 'ignore',
  });

  child.unref();
  return child.pid;
}

async function stopProcesses(pids: number[]) {
  for (const pid of pids) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // ignore missing process groups
    }
  }
}

export default async function globalSetup() {
  await fs.mkdir(runtimeDir, { recursive: true });

  try {
    const raw = await fs.readFile(processFile, 'utf8');
    const previous = JSON.parse(raw) as { pids?: number[] };
    await stopProcesses(previous.pids ?? []);
  } catch {
    // ignore missing runtime file
  }

  execSync('docker compose up -d postgres', {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });

  await waitForPort(5432, '127.0.0.1', 30_000);
  await waitForPostgres(30_000);

  execSync('pnpm --filter @router/api db:migrate', {
    cwd: rootDir,
    env: e2eEnv(),
    stdio: 'inherit',
  });
  execSync('pnpm --filter @router/api db:seed-e2e', {
    cwd: rootDir,
    env: e2eEnv(),
    stdio: 'inherit',
  });

  const pids = [
    spawnDetached('pnpm --filter @router/api exec tsx scripts/mock-upstream.ts', e2eEnv()),
    spawnDetached('pnpm --filter @router/api exec tsx src/server.ts', e2eEnv()),
    spawnDetached(
      'pnpm --filter @router/web exec vite --host 127.0.0.1 --port 3000',
      e2eEnv({
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3001',
      }),
    ),
  ].filter((pid): pid is number => typeof pid === 'number');

  await fs.writeFile(processFile, JSON.stringify({ pids }, null, 2));

  try {
    await waitForHttp('http://127.0.0.1:4010/health', 30_000);
    await waitForHttp('http://127.0.0.1:3001/health', 30_000);
    await waitForHttp('http://127.0.0.1:3000/login', 30_000);
  } catch (error) {
    await stopProcesses(pids);
    throw error;
  }
}
