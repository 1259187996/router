import { spawnSync } from 'node:child_process';

const forwardedArgs = process.argv.slice(2);
const normalizedArgs = forwardedArgs[0] === '--' ? forwardedArgs.slice(1) : forwardedArgs;
const rewrittenArgs = normalizedArgs.map((arg) =>
  arg.startsWith('apps/api/') ? arg.replace(/^apps\/api\//, '') : arg
);
const vitestArgs = rewrittenArgs.length > 0 ? ['run', ...rewrittenArgs] : ['run'];
const vitestBin = process.platform === 'win32' ? 'vitest.cmd' : 'vitest';

const result = spawnSync(vitestBin, vitestArgs, {
  stdio: 'inherit',
  shell: true
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
