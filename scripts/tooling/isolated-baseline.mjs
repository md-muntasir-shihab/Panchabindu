import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceEntries = ['app', 'src', 'hooks', 'lib', 'public', 'supabase', 'scripts'];
const rootFiles = ['package.json', 'bun.lock', 'tsconfig.json', 'next-env.d.ts',
  'next.config.ts', 'eslint.config.mjs', '.eslintrc.json', 'postcss.config.mjs', 'run-local.cmd'];

export function ordinaryPath(file) {
  if (file.startsWith('\\\\?\\UNC\\')) return `\\\\${file.slice(8)}`;
  if (/^\\\\\?\\[a-z]:\\/i.test(file)) return file.slice(4);
  return file;
}

function canonicalPath(file) {
  let current = path.resolve(ordinaryPath(file));
  const missing = [];
  while (!fs.existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Cannot resolve workspace path.');
    current = parent;
  }
  const resolved = path.join(ordinaryPath(fs.realpathSync(current)), ...missing);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function assertSeparateWorkspace(source, target) {
  const a = canonicalPath(source);
  const b = canonicalPath(target);
  if (a === b || b.startsWith(`${a}${path.sep}`) || a.startsWith(`${b}${path.sep}`)) {
    throw new Error('Baseline workspace must be separate from the project.');
  }
}

export function createOutputDirectory(parent) {
  fs.mkdirSync(parent, { recursive: true });
  // Node on Windows can return a namespaced path; Bun/webpack require an ordinary cwd.
  return ordinaryPath(fs.mkdtempSync(path.join(parent, 'baseline-')));
}

export function syntheticEnvironment(parent = process.env) {
  const names = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
    'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'];
  const env = Object.fromEntries(names.filter((key) => parent[key]).map((key) => [key, parent[key]]));
  return { ...env, CI: '1', NEXT_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1',
    NODE_ENV: 'test', CREDENTIALS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex') };
}

function excludedName(name) {
  return ['.data', '.git', '.next', '.cache', '.supabase', 'node_modules'].includes(name)
    || name === '.env' || name.startsWith('.env.');
}

function assertNotSymlink(file) {
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Unexpected source symlink: ${file}`);
}

function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  assertNotSymlink(directory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedName(entry.name)) return [];
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${file}`);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

export function sourceFingerprint(root) {
  const files = sourceEntries.flatMap((name) => filesIn(path.join(root, name)))
    .concat(rootFiles.map((name) => path.join(root, name)).filter((file) => fs.existsSync(file))).sort();
  return Object.fromEntries(files.map((file) => {
    assertNotSymlink(file);
    return [path.relative(root, file).replaceAll('\\', '/'),
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
  }));
}

export function copySource(root, workspace) {
  assertSeparateWorkspace(root, workspace);
  for (const name of [...sourceEntries, ...rootFiles]) {
    const from = path.join(root, name);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(workspace, name), {
      recursive: true,
      filter(file) {
        if (excludedName(path.basename(file))) return false;
        assertNotSymlink(file);
        return true;
      },
    });
  }
}

function json(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function capture(command, args, cwd, env, logDir, name, timeoutMs = 300_000) {
  const stdout = fs.openSync(path.join(logDir, `${name}.out`), 'w');
  const stderr = fs.openSync(path.join(logDir, `${name}.err`), 'w');
  const startedAt = new Date().toISOString();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ordinaryPath(cwd), env, windowsHide: true, stdio: ['ignore', stdout, stderr] });
    let timedOut = false;
    let spawnError = null;
    const timeout = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    const finish = (exitCode, signal, error) => {
      clearTimeout(timeout);
      fs.closeSync(stdout);
      fs.closeSync(stderr);
      const result = { command: path.basename(command), args, startedAt,
        finishedAt: new Date().toISOString(), exitCode: exitCode ?? null,
        signal: signal ?? null, timedOut, error: error?.message ?? null };
      json(path.join(logDir, `${name}.result.json`), result);
      resolve(result);
    };
    child.once('error', (error) => { spawnError = error; });
    child.once('close', (code, signal) => finish(code, signal, spawnError));
  });
}

export async function runBaseline({ root = projectRoot, outputParent, bun } = {}) {
  root = ordinaryPath(path.resolve(root));
  const parent = ordinaryPath(path.resolve(outputParent ?? path.join(path.dirname(root), '.panchagarh-audit')));
  assertSeparateWorkspace(root, parent);
  const output = createOutputDirectory(parent);
  const workspace = path.join(output, 'workspace');
  const logs = path.join(output, 'logs');
  fs.mkdirSync(workspace);
  fs.mkdirSync(logs);
  const before = sourceFingerprint(root);
  json(path.join(output, 'source-before.json'), before);
  json(path.join(parent, 'latest.json'), { output, workspace, logs, status: 'COPYING' });
  // Explicit allowlist: never copy .data, .env, Git/auth state or existing build output.
  copySource(root, workspace);
  if (!fs.existsSync(path.join(root, 'node_modules'))) throw new Error('Install locked dependencies first.');
  // Real copy on the same drive: no junctions and no dependency writes in the original workspace.
  fs.cpSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), { recursive: true, dereference: true });
  const env = syntheticEnvironment();
  env.HOME = path.join(output, 'home');
  env.USERPROFILE = env.HOME;
  fs.mkdirSync(env.HOME);
  const node = process.execPath;
  const results = {};
  json(path.join(parent, 'latest.json'), { output, workspace, logs, status: 'CHECKING' });
  const checks = [
    ['typecheck', node, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']],
    ['lint', node, ['node_modules/eslint/bin/eslint.js', '.']],
  ];
  const bunPath = bun ?? process.env.PANCHAGARH_BUN ?? path.join(os.homedir(),
    'AppData/Local/npm-cache/_npx/9ec17c29a94a501f/node_modules/bun/bin/bun.exe');
  if (fs.existsSync(bunPath)) checks.push(['unit', bunPath, ['test']]);
  else results.unit = { status: 'BLOCKED', reason: 'Bun executable not found. Set PANCHAGARH_BUN.' };
  await Promise.all(checks.map(async ([name, command, args]) => {
    results[name] = await capture(command, args, workspace, env, logs, name);
  }));
  results.build = await capture(node, ['node_modules/next/dist/bin/next', 'build'], workspace,
    { ...env, NODE_ENV: 'production' }, logs, 'build', 600_000);
  const after = sourceFingerprint(root);
  json(path.join(output, 'source-after.json'), after);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const summary = { output, workspace, logs, status: 'FINISHED', results,
    checksPassed: Object.values(results).every((result) => result.exitCode === 0 && !result.timedOut && !result.error),
    applicationAndConfigUnchanged: unchanged,
    originalDataDirectoryExists: fs.existsSync(path.join(root, '.data')),
    notes: ['Synthetic JSON fixtures only. No database/RLS/browser or production readiness certification.',
      'Only allowlisted source/configuration/scripts are fingerprinted; docs, dependencies and excluded private files are outside that comparison.',
      'A timeout terminates the direct child only; inspect descendant processes before reusing or cleaning the audit directory.',
      'No inherited project/service credentials; network is not an OS-level sandbox.'] };
  json(path.join(output, 'summary.json'), summary);
  json(path.join(parent, 'latest.json'), summary);
  if (!unchanged) throw new Error('Source fingerprint changed during the baseline. Inspect before proceeding.');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runBaseline().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.checksPassed) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}