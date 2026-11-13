import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateLocalSandbox } from './bootstrap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sandbox = path.resolve(root, '..', '.panchagarh-local-sandbox');
validateLocalSandbox(sandbox);

// No inherited database/service credentials, proxy settings, or global app secrets.
const allowed = ['Path', 'PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS'];
const env = Object.fromEntries(allowed.filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: 'development', APP_URL: 'http://127.0.0.1:3000',
  PANCHAGARH_ENABLE_SANDBOX_AUTH: '1', NEXT_TELEMETRY_DISABLED: '1',
  BUN_INSTALL_CACHE_DIR: path.join(sandbox, '.bun-cache') });

const bun = process.platform === 'win32' ? path.join(process.env.USERPROFILE || '', '.bun', 'bin', 'bun.exe') : 'bun';
if (!fs.existsSync(bun) && process.platform === 'win32') {
  throw new Error('Bun executable not found in the current Windows user profile.');
}
if (!fs.existsSync(path.join(sandbox, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next'))) {
  console.log('Installing frozen dependencies ONLY into the synthetic sandbox.');
  const installed = spawnSync(bun, ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: sandbox, env, stdio: 'inherit', windowsHide: true });
  if (installed.error || installed.status !== 0) throw new Error('Sandbox dependency install failed.');
}
console.log(`Private login instructions: ${path.join(sandbox, 'LOCAL-LOGIN.txt')}`);
console.log('Listening only at http://127.0.0.1:3000 ; stop with Ctrl+C.');
const server = spawn(bun, ['run', 'dev', '--hostname', '127.0.0.1', '--port', '3000'],
  { cwd: sandbox, env, stdio: 'inherit', windowsHide: true });
server.once('error', error => { console.error(error.message); process.exitCode = 1; });
server.once('close', code => { process.exitCode = code ?? 1; });