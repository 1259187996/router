import { parse } from 'dotenv';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(apiRoot, '..', '..');
const envFiles = [resolve(repoRoot, '.env'), resolve(apiRoot, '.env')];

export function loadEnvFiles() {
  const fileEnv: Record<string, string> = {};

  for (const path of envFiles) {
    if (existsSync(path)) {
      Object.assign(fileEnv, parse(readFileSync(path)));
    }
  }

  for (const [key, value] of Object.entries(fileEnv)) {
    process.env[key] ??= value;
  }
}
