// A disposable, offline preview for imported workspaces. Never loads .env files,
// repository .data, Supabase credentials, or real integration configuration.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.VERCEL_ENV) {
  console.error('The disposable preview cannot run as a production or Vercel server.');
  process.exit(1);
}
const rawPort = process.env.PORT || '3000';
if (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535) {
  console.error('PORT must be a number between 0 and 65535.');
  process.exit(1);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'panchabindu-preview-'));
fs.mkdirSync(path.join(fixture, '.data'), { mode: 0o700 });
const secret = () => randomBytes(32).toString('hex');
const child = fork(path.join(root, 'scripts/src/sandbox-fixture-app.mjs'), [], {
  cwd: fixture,
  execArgv: ['--import', require.resolve('tsx/esm')],
  // Allowlist, never spread process.env: no credentials or inherited .env.
  env: {
    PATH: process.env.PATH || '',
    HOME: fixture,
    TMPDIR: fixture,
    NODE_ENV: 'development',
    LOG_LEVEL: 'silent',
    PORT: Number(rawPort) ? rawPort : '3000',
    BASE_PATH: '/',
    TSX_TSCONFIG_PATH: path.join(root, 'artifacts/api-server/tsconfig.json'),
    PANCHABINDU_SANDBOX_FIXTURE: fixture,
    PANCHABINDU_ISOLATED_PREVIEW: '1',
    PANCHABINDU_PREVIEW_PORT: rawPort,
    PANCHABINDU_PERSISTENCE: 'json',
    PANCHABINDU_ENABLE_SANDBOX_AUTH: '1',
    PANCHABINDU_SANDBOX_DISABLE_2FA: '1',
    PANCHABINDU_SANDBOX_ADMIN_USERNAME: 'preview_admin',
    PANCHABINDU_SANDBOX_ADMIN_PASSWORD: secret(),
    PANCHABINDU_SANDBOX_VENDOR_PASSWORD: secret(),
    CREDENTIALS_ENCRYPTION_KEY: secret(),
    SESSION_SECRET: secret(),
  },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});
let ready = false;
child.on('message', message => {
  if (message?.type !== 'ready') return;
  ready = true;
  console.log(`DEMO PREVIEW ready on port ${message.port}. Sample data only; changes reset when stopped.`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(`Preview failed: ${error.message}`); });
child.on('exit', (code, signal) => {
  fs.rmSync(fixture, { recursive: true, force: true });
  if (!ready && code !== 0) console.error('Preview could not start. Check the port and dependencies.');
  process.exit(code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1));
});
