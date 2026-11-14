import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '../.data/sandbox.env');
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

// This flag is only for the managed development workflow. Production starts
// the built server directly and never reads the local sandbox env file.
process.env.NODE_ENV = 'development';
if (process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH === '1') {
  process.env.PANCHABINDU_SANDBOX_DISABLE_2FA ??= '1';
}
const build = spawnSync('pnpm', ['run', 'build'], { cwd: path.resolve(here, '..'), env: process.env, stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, ['--enable-source-maps', 'dist/index.mjs'], {
  cwd: path.resolve(here, '..'), env: process.env, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
