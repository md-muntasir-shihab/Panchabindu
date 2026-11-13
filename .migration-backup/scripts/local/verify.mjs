import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { capture, copySource, assertSeparateWorkspace } from '../tooling/isolated-baseline.mjs';

import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const parent = path.resolve(root, '..', '.panchagarh-local-checks');
assertSeparateWorkspace(root, parent);
fs.mkdirSync(parent, { recursive: true });
const output = fs.mkdtempSync(path.join(parent, 'check-'));
const workspace = path.join(output, 'workspace');
const logs = path.join(output, 'logs');
fs.mkdirSync(workspace);
fs.mkdirSync(logs);
copySource(root, workspace);
if (!fs.existsSync(path.join(root, 'node_modules'))) throw new Error('Locked node_modules missing; use run-local.cmd or install dependencies in an isolated sandbox.');
// Locked modules are read-only inputs here. Avoid a lengthy duplicate install/copy.
// Junction for module resolution in the disposable workspace. Tests never
// install or write to dependencies; no build/typecheck runs here.
fs.symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { NODE_ENV: 'test', CI: '1', NEXT_TELEMETRY_DISABLED: '1', CREDENTIALS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex') });
const node = process.execPath;
const bun = process.env.PANCHAGARH_BUN || path.join(process.env.USERPROFILE || '', '.bun/bin/bun.exe');
const checks = [
  ['targeted', bun, ['test', 'app/api/vendor/overview/route.test.ts', 'src/lib/db/phase2-migration.test.ts']],
  ['lint', node, [path.join(root, 'node_modules/eslint/bin/eslint.js'), 'app/api/vendor/overview/route.ts', 'app/api/vendor/overview/route.test.ts', 'app/vendor/page.tsx', 'src/components/vendor/vendor-client.tsx', 'src/lib/admin/phase4a-service.ts', 'src/lib/supabase/admin.ts', 'src/lib/db/phase2-migration.test.ts']],
];
const result = [];
for (const [name, command, args] of checks) {
  result.push([name, await capture(command, args, workspace, env, logs, name, name === 'typecheck' ? 120_000 : 300_000)]);
}
const summary = { output, results: Object.fromEntries(result) };
// A successful targeted run is intentionally not a full suite, DB or browser gate.
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (result.some(([, value]) => value.exitCode !== 0 || value.error || value.timedOut)) process.exitCode = 1;