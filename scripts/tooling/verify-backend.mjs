import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copySource, syntheticEnvironment } from './isolated-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-backend-checks-'));
const workspace = path.join(output, 'workspace');
copySource(root, workspace);
fs.symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const environment = { ...syntheticEnvironment(), PANCHAGARH_ENABLE_SANDBOX_AUTH: '1' };
const results = [];
function run(name, args) {
  fs.rmSync(path.join(workspace, '.data'), { recursive: true, force: true });
  const result = spawnSync(process.execPath, args, { cwd: workspace, env: environment, encoding: 'utf8', timeout: 180_000, maxBuffer: 12 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, name.replace(/[^a-z0-9-]/gi, '_') + '.log'), (result.stdout ?? '') + '\n' + (result.stderr ?? ''));
  results.push({ name, exitCode: result.status, error: result.error?.message ?? null });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${name}`);
}
function tests(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? tests(path.join(directory, entry.name)) : /\.test\.(tsx?|mjs)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}
run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']);
run('lint', ['node_modules/eslint/bin/eslint.js', '.']);
for (const file of ['app', 'src', 'scripts'].flatMap(directory => tests(path.join(workspace, directory))).sort()) {
  const name = path.relative(workspace, file);
  run(name, ['--import', path.join(workspace, 'scripts/tooling/register-typescript.mjs'), '--test', file]);
}
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ results, output }, null, 2));
console.log(`Verification logs: ${output}`);
process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0;
