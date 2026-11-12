import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSeparateWorkspace, syntheticEnvironment, sourceFingerprint, capture,
  ordinaryPath, createOutputDirectory, copySource } from './isolated-baseline.mjs';

test('normalizes Windows namespaced paths without changing ordinary paths', () => {
  assert.equal(ordinaryPath('\\\\?\\F:\\CODE\\audit'), 'F:\\CODE\\audit');
  assert.equal(ordinaryPath('\\\\?\\UNC\\server\\share\\audit'), '\\\\server\\share\\audit');
  assert.equal(ordinaryPath('/tmp/audit'), '/tmp/audit');
});

test('creates ordinary output paths whether the parent exists or is new', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-output-'));
  try {
    const parent = path.join(root, 'new-parent');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const output = createOutputDirectory(parent);
      assert.equal(output.startsWith('\\\\?\\'), false);
      assert.equal(path.dirname(output), parent);
      assert.equal(fs.statSync(output).isDirectory(), true);
    }
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('rejects workspace targets equal to, inside, or above the source', () => {
  const root = path.join(os.tmpdir(), 'panchagarh-source');
  assert.throws(() => assertSeparateWorkspace(root, root));
  assert.throws(() => assertSeparateWorkspace(root, path.join(root, 'nested')));
  assert.throws(() => assertSeparateWorkspace(root, os.tmpdir()));
  assert.doesNotThrow(() => assertSeparateWorkspace(root, path.join(os.tmpdir(), 'panchagarh-isolated')));
});

test('does not pass inherited secrets or Node injection settings to checks', () => {
  const env = syntheticEnvironment({ PATH: 'test-path', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    NODE_OPTIONS: '--require malicious.cjs', SMS_API_KEY: 'synthetic', GITHUB_TOKEN: 'synthetic' });
  assert.equal(env.PATH, 'test-path');
  assert.equal(env.NODE_ENV, 'test');
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'NODE_OPTIONS', 'SMS_API_KEY', 'GITHUB_TOKEN']) {
    assert.equal(env[key], undefined);
  }
  assert.equal(env.CREDENTIALS_ENCRYPTION_KEY.length, 64);
});

test('fingerprints source while excluding existing data and env files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-fingerprint-'));
  try {
    fs.mkdirSync(path.join(root, 'app'));
    fs.mkdirSync(path.join(root, '.data'));
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'synthetic source');
    fs.writeFileSync(path.join(root, '.data', 'private.json'), 'synthetic private data');
    fs.writeFileSync(path.join(root, '.env'), 'synthetic=private');
    const before = sourceFingerprint(root);
    assert.deepEqual(Object.keys(before), ['app/page.tsx']);
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'changed synthetic source');
    assert.notDeepEqual(sourceFingerprint(root), before);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('copies source and scripts without nested data, environment or cached state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-copy-'));
  try {
    const source = path.join(root, 'source');
    const target = path.join(root, 'workspace');
    fs.mkdirSync(path.join(source, 'app'), { recursive: true });
    fs.mkdirSync(path.join(source, 'scripts'));
    fs.writeFileSync(path.join(source, 'app', 'page.tsx'), 'synthetic source');
    fs.writeFileSync(path.join(source, 'scripts', 'check.mjs'), 'synthetic script');
    fs.writeFileSync(path.join(source, 'run-local.cmd'), 'synthetic launcher');
    fs.writeFileSync(path.join(source, '.env'), 'synthetic private');
    fs.writeFileSync(path.join(source, 'app', '.env.local'), 'synthetic private');
    for (const excluded of ['.data', '.git', '.next', '.supabase', 'node_modules']) {
      fs.mkdirSync(path.join(source, 'app', excluded));
      fs.writeFileSync(path.join(source, 'app', excluded, 'private'), 'synthetic private');
    }
    copySource(source, target);
    assert.deepEqual(Object.keys(sourceFingerprint(target)), ['app/page.tsx', 'run-local.cmd', 'scripts/check.mjs']);
    assert.deepEqual(fs.readdirSync(target), ['app', 'run-local.cmd', 'scripts']);
    assert.deepEqual(fs.readdirSync(path.join(target, 'app')), ['page.tsx']);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('rejects source symlinks and workspace aliases into the source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-links-'));
  try {
    const source = path.join(root, 'source');
    const linked = path.join(root, 'alias');
    fs.mkdirSync(path.join(source, 'app'), { recursive: true });
    fs.symlinkSync(source, linked, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assertSeparateWorkspace(source, path.join(linked, 'nested')));
    fs.symlinkSync(path.join(source, 'app'), path.join(source, 'src'),
      process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => sourceFingerprint(source), /symlink/);
    assert.throws(() => copySource(source, path.join(root, 'workspace')), /symlink/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('captures real child exit codes and stdout without relying on terminal integration', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-capture-'));
  try {
    const result = await capture(process.execPath, ['-e', 'console.log("synthetic"); process.exitCode=7'],
      root, syntheticEnvironment(), root, 'test');
    assert.equal(result.exitCode, 7);
    assert.equal(result.timedOut, false);
    assert.match(fs.readFileSync(path.join(root, 'test.out'), 'utf8'), /synthetic/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('records a missing executable once without unhandled descriptor errors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-spawn-error-'));
  try {
    const result = await capture(path.join(root, 'missing-executable'), [], root,
      syntheticEnvironment(), root, 'missing');
    assert.match(result.error, /ENOENT|Executable not found/);
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.signal, null);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'missing.result.json'), 'utf8')), result);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('records direct-child timeout rather than reporting a passing check', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-timeout-'));
  try {
    const result = await capture(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], root,
      syntheticEnvironment(), root, 'timeout', 100);
    assert.equal(result.timedOut, true);
  } finally { fs.rmSync(root, { recursive: true }); }
});