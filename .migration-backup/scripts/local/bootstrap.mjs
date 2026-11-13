import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { copySource, assertSeparateWorkspace } from '../tooling/isolated-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sandbox = path.resolve(root, '..', '.panchagarh-local-sandbox');

export function validateLocalSandbox(target) {
  const marker = path.join(target, '.panchagarh-synthetic-only');
  if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink() ||
      !fs.statSync(target).isDirectory() ||
      !fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() ||
      fs.readFileSync(marker, 'utf8') !== 'Synthetic local test data only\n') {
    throw new Error('Refusing to use an unmarked or invalid synthetic sandbox.');
  }
  const checkUnexpectedEnvs = (directory) => {
    // Bun dependencies and generated files are not source-copy destinations.
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink in synthetic sandbox.');
      if (entry.name === '.env' || (entry.name.startsWith('.env.') && file !== path.join(target, '.env.local'))) {
        throw new Error('Unexpected environment file in synthetic sandbox.');
      }
      if (entry.isDirectory() && !['node_modules', '.next', '.bun-cache'].includes(entry.name)) {
        checkUnexpectedEnvs(file);
      }
    }
  };
  checkUnexpectedEnvs(target);
  const envPath = path.join(target, '.env.local');
  const loginPath = path.join(target, 'LOCAL-LOGIN.txt');
  if (!fs.existsSync(envPath) || !fs.existsSync(loginPath) ||
      fs.lstatSync(envPath).isSymbolicLink() || fs.lstatSync(loginPath).isSymbolicLink()) {
    throw new Error('Incomplete synthetic sandbox credentials.');
  }
  const lines = fs.readFileSync(envPath, 'utf8').trimEnd().split(/\r?\n/);
  const keys = ['APP_URL', 'PANCHAGARH_ENABLE_SANDBOX_AUTH', 'NEXT_PUBLIC_ENABLE_DEMO_MODE',
    'CREDENTIALS_ENCRYPTION_KEY', 'PANCHAGARH_SANDBOX_ADMIN_PASSWORD', 'PANCHAGARH_SANDBOX_VENDOR_PASSWORD'];
  if (lines.length !== keys.length || lines.some((line, index) => !line.startsWith(`${keys[index]}=`))) {
    throw new Error('Unexpected or missing synthetic sandbox environment setting.');
  }
  const values = lines.map(line => line.slice(line.indexOf('=') + 1));
  if (values[0] !== 'http://127.0.0.1:3000' || values[1] !== '1' || values[2] !== 'true' ||
      !/^[0-9a-f]{64}$/.test(values[3]) ||
      !/^[A-Za-z0-9_-]{32}$/.test(values[4]) ||
      !/^[A-Za-z0-9_-]{32}$/.test(values[5])) {
    throw new Error('Invalid synthetic sandbox environment value.');
  }
}

export function prepareLocalSandbox(source = root, target = sandbox) {
  assertSeparateWorkspace(source, target);
  if (fs.existsSync(target)) {
    const marker = path.join(target, '.panchagarh-synthetic-only');
    if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory() ||
        !fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() ||
        fs.readFileSync(marker, 'utf8') !== 'Synthetic local test data only\n') {
      throw new Error('Refusing to use a pre-existing non-sandbox directory.');
    }
    if (fs.existsSync(path.join(target, '.env.local')) || fs.existsSync(path.join(target, 'LOCAL-LOGIN.txt'))) {
      validateLocalSandbox(target);
    } else if (fs.existsSync(path.join(target, '.data'))) {
      throw new Error('Refusing to generate new credentials over pre-existing sandbox data.');
    } else if (fs.readdirSync(target).some(name => name === '.env' || name.startsWith('.env.'))) {
      throw new Error('Unexpected environment file in synthetic sandbox.');
    }
  }
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, '.panchagarh-synthetic-only'), 'Synthetic local test data only\n', { flag: 'wx' });
  }
  // No .data, .env, credentials, .git or symlinks are copied from the workspace.
  copySource(source, target);
  const envPath = path.join(target, '.env.local');
  if (!fs.existsSync(envPath)) {
    const adminPassword = crypto.randomBytes(24).toString('base64url');
    const vendorPassword = crypto.randomBytes(24).toString('base64url');
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(envPath, [
      'APP_URL=http://127.0.0.1:3000',
      'PANCHAGARH_ENABLE_SANDBOX_AUTH=1',
      'NEXT_PUBLIC_ENABLE_DEMO_MODE=true',
      `CREDENTIALS_ENCRYPTION_KEY=${key}`,
      `PANCHAGARH_SANDBOX_ADMIN_PASSWORD=${adminPassword}`,
      `PANCHAGARH_SANDBOX_VENDOR_PASSWORD=${vendorPassword}`,
      '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(target, 'LOCAL-LOGIN.txt'), [
      'PRIVATE SYNTHETIC SANDBOX — never expose the dev server to the internet.',
      'Admin: http://127.0.0.1:3000/admin ; username: admin',
      `Initial admin password: ${adminPassword}`,
      'First login: choose a new password, enroll an authenticator app using the shown URI, and enter its current code.',
      'Vendor: http://127.0.0.1:3000/vendor ; username: rupganj_vendor',
      `Initial vendor password: ${vendorPassword}`,
      'First login: choose a new password and enroll an authenticator app. The vendor portal is read-only and partial.',
      'Customer: http://127.0.0.1:3000/account ; enter your own synthetic Bangladesh test phone (e.g. 01700000000); request the displayed sandbox OTP. There is NO customer password.',
      'No real SMS, real payment, courier booking or PostgreSQL is connected.',
      'Do not delete .data or rerun bootstrap to reset an existing account: passwords rotate on first login.',
      '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
  }
  validateLocalSandbox(target);
  // Dependencies are installed separately from the frozen lockfile in the sandbox;
  // never link node_modules from the real project into a writable sandbox.
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${prepareLocalSandbox()}\n`); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}