import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const processFile = path.join(rootDir, '.playwright-runtime', 'e2e-processes.json');

export default async function globalTeardown() {
  try {
    const raw = await fs.readFile(processFile, 'utf8');
    const runtime = JSON.parse(raw) as { pids?: number[] };

    for (const pid of runtime.pids ?? []) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        // ignore missing process groups
      }
    }

    await fs.rm(processFile, { force: true });
  } catch {
    // ignore missing runtime file
  }
}
