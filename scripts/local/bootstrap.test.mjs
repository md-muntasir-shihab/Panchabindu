import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLocalSandbox, validateLocalSandbox } from './bootstrap.mjs';

test('launcher copies source without workspace data or credentials; credentials persist on rerun', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-local-test-'));
  const target = path.join(parent, 'sandbox');
  try {
    assert.equal(prepareLocalSandbox(root, target), target);
    const login = fs.readFileSync(path.join(target, 'LOCAL-LOGIN.txt'), 'utf8');
    const env = fs.readFileSync(path.join(target, '.env.local'), 'utf8');
    assert.match(login, /admin/);
    assert.match(login, /rupganj_vendor/);
    assert.match(login, /NO customer password/i);
    assert.match(env, /PANCHAGARH_ENABLE_SANDBOX_AUTH=1/);
    assert.doesNotMatch(env, /your-project-ref|SERVICE_ROLE_KEY|Admin#2026/);
    assert.equal(fs.existsSync(path.join(target, '.data')), false);
    assert.equal(prepareLocalSandbox(root, target), target);
    assert.equal(fs.readFileSync(path.join(target, '.env.local'), 'utf8'), env);
    assert.equal(fs.readFileSync(path.join(target, 'LOCAL-LOGIN.txt'), 'utf8'), login);
    fs.mkdirSync(path.join(parent, 'unmarked'));
    assert.throws(() => prepareLocalSandbox(root, path.join(parent, 'unmarked')), /non-sandbox/);
    for (const tamper of [
      `${env}SUPABASE_SERVICE_ROLE_KEY=forbidden\n`,
      env.replace('APP_URL=http://127.0.0.1:3000', 'APP_URL=http://0.0.0.0:3000'),
      env.replace('PANCHAGARH_ENABLE_SANDBOX_AUTH=1', 'PANCHAGARH_ENABLE_SANDBOX_AUTH=1\nPANCHAGARH_ENABLE_SANDBOX_AUTH=1'),
    ]) {
      fs.writeFileSync(path.join(target, '.env.local'), tamper);
      assert.throws(() => validateLocalSandbox(target), /synthetic sandbox environment/);
      assert.throws(() => prepareLocalSandbox(root, target), /synthetic sandbox environment/);
    }
    fs.writeFileSync(path.join(target, '.env.local'), env);
    fs.renameSync(path.join(target, 'LOCAL-LOGIN.txt'), path.join(target, 'LOCAL-LOGIN.missing'));
    assert.throws(() => prepareLocalSandbox(root, target), /Incomplete synthetic sandbox credentials/);
    fs.renameSync(path.join(target, 'LOCAL-LOGIN.missing'), path.join(target, 'LOCAL-LOGIN.txt'));
    fs.writeFileSync(path.join(target, '.env.production'), 'forbidden');
    assert.throws(() => validateLocalSandbox(target), /Unexpected environment file/);
    fs.rmSync(path.join(target, '.env.production'));
    fs.writeFileSync(path.join(target, 'app', '.env.local'), 'forbidden');
    assert.throws(() => validateLocalSandbox(target), /Unexpected environment file/);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('Windows launcher delegates to the isolated environment starter', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const launcher = fs.readFileSync(path.join(root, 'run-local.cmd'), 'utf8');
  const starter = fs.readFileSync(path.join(root, 'scripts/local/start.mjs'), 'utf8');
  assert.match(launcher, /scripts\\local\\start\.mjs/);
  assert.match(starter, /const allowed = \[/);
  assert.match(starter, /127\.0\.0\.1/);
  assert.doesNotMatch(starter, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});