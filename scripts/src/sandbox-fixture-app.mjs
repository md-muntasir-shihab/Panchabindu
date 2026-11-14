// Test-only entry point. Do not use the development launcher or load .env files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

const fixture = process.env.PANCHABINDU_SANDBOX_FIXTURE;
assert.ok(fixture && process.send, 'Start this app through test:sandbox');
assert.equal(process.cwd(), fixture);
assert.equal(fs.lstatSync(path.join(fixture, '.data')).isSymbolicLink(), false);

// Fail on access to ANY other .data directory, even metadata probes. Thus a
// missing real .data and a populated real .data have identical test behavior.
function guard(target) {
  if (target instanceof URL) target = fileURLToPath(target);
  if (typeof target !== 'string' && !Buffer.isBuffer(target)) return;
  const resolved = path.resolve(String(target));
  if (resolved.split(path.sep).includes('.data') &&
      !resolved.startsWith(`${fixture}${path.sep}`)) {
    throw new Error('Sandbox tests cannot access non-fixture account data');
  }
}
for (const method of [
  'access', 'appendFile', 'chmod', 'chown', 'copyFile', 'cp', 'lstat', 'mkdir',
  'open', 'opendir', 'readFile', 'readdir', 'readlink', 'realpath', 'rename',
  'rm', 'rmdir', 'stat', 'truncate', 'unlink', 'utimes', 'writeFile',
]) {
  for (const name of [method, `${method}Sync`]) {
    if (typeof fs[name] !== 'function') continue;
    const original = fs[name];
    fs[name] = function (target, ...args) {
      guard(target);
      if (['copyFile', 'cp', 'rename'].includes(method)) guard(args[0]);
      return original.call(this, target, ...args);
    };
    // Vite uses realpathSync.native; preserve and guard this Node API too.
    if (original.native) {
      fs[name].native = function (target, ...args) {
        guard(target);
        return original.native.call(this, target, ...args);
      };
    }
  }
  if (typeof fs.promises[method] === 'function') {
    const original = fs.promises[method];
    fs.promises[method] = async function (target, ...args) {
      guard(target);
      if (['copyFile', 'cp', 'rename'].includes(method)) guard(args[0]);
      return original.call(this, target, ...args);
    };
  }
}
for (const method of ['existsSync', 'createReadStream', 'createWriteStream', 'watch']) {
  const original = fs[method];
  fs[method] = function (target, ...args) {
    guard(target);
    return original.call(this, target, ...args);
  };
}

// The real API runs, but it cannot reach SMS, database, courier or other services.
const denyNetwork = () => { throw new Error('Outbound network is forbidden in sandbox fixtures'); };
globalThis.fetch = async () => denyNetwork();
http.request = http.get = https.request = https.get = denyNetwork;
net.connect = net.createConnection = tls.connect = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
syncBuiltinESMExports();

const root = fileURLToPath(new URL('../../', import.meta.url));
const web = path.join(root, 'artifacts/panchabindu');
const require = createRequire(path.join(web, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const { default: app } = await import('../../artifacts/api-server/src/app.ts');
const vite = await createServer({
  configFile: path.join(web, 'vite.config.ts'),
  envFile: false,
  cacheDir: path.join(fixture, 'vite-cache'),
  server: { middlewareMode: true, hmr: false, watch: null },
});
app.use(vite.middlewares);
const server = http.createServer(app);
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
process.env.APP_URL = `http://127.0.0.1:${server.address().port}`;
process.send({ type: 'ready', port: server.address().port });

async function shutdown() {
  server.closeAllConnections();
  await Promise.all([vite.close(), new Promise((resolve) => server.close(resolve))]);
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.once('disconnect', shutdown);
