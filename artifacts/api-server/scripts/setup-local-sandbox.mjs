import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(packageDir, '.data');
const envFile = path.join(dataDir, 'sandbox.env');
const loginFile = path.join(dataDir, 'LOCAL-LOGIN.txt');
const lockFile = path.join(dataDir, 'sandbox-setup.lock');

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
fs.chmodSync(dataDir, 0o700);

let lock;
let createdEnv = false;
let createdLogin = false;
try {
  lock = fs.openSync(lockFile, 'wx', 0o600);
  if (fs.existsSync(envFile) || fs.existsSync(loginFile) || fs.existsSync(path.join(dataDir, 'erp-admin-store.json'))) {
    throw new Error('Existing sandbox credentials or admin accounts were found. Nothing was replaced. Contact the project owner to recover the existing login.');
  }

  const adminPassword = crypto.randomBytes(32).toString('base64url');
  const vendorPassword = crypto.randomBytes(32).toString('base64url');
  const encryptionKey = crypto.randomBytes(32).toString('hex');

  const env = [
    'PANCHAGARH_ENABLE_SANDBOX_AUTH=1',
    'PANCHAGARH_SANDBOX_DISABLE_2FA=1',
    'PANCHAGARH_SANDBOX_ADMIN_USERNAME=panchagarh_owner',
    `PANCHAGARH_SANDBOX_ADMIN_PASSWORD=${adminPassword}`,
    `PANCHAGARH_SANDBOX_VENDOR_PASSWORD=${vendorPassword}`,
    `CREDENTIALS_ENCRYPTION_KEY=${encryptionKey}`,
    '',
  ].join('\n');

  fs.writeFileSync(envFile, env, { flag: 'wx', mode: 0o600 });
  createdEnv = true;
  fs.writeFileSync(loginFile, [
    'PRIVATE REPLIT DEVELOPMENT LOGINS — not production accounts.',
    'Do not share these credentials or the development preview URL.',
    '',
    'Admin',
    'URL: /admin',
    'Username: panchagarh_owner',
    `One-time initial password: ${adminPassword}`,
    'On first login, choose a new password. Two-factor authentication is disabled in this local sandbox.',
    '',
    'Vendor',
    'URL: /vendor',
    'Username: rupganj_vendor',
    `One-time initial password: ${vendorPassword}`,
    'On first login, choose a new password. Two-factor authentication is disabled in this local sandbox.',
    '',
    'Customer',
    'URL: /account',
    'Customers sign in with a phone number and a local test OTP. Customers do not have passwords.',
    '',
    'Local sandbox only. No Supabase, production accounts, live SMS, payment or courier service is enabled.',
    'Delete this file after recording the one-time passwords securely. Do not rerun the setup to reset accounts.',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  createdLogin = true;
} catch (error) {
  if (createdEnv) fs.rmSync(envFile, { force: true });
  if (createdLogin) fs.rmSync(loginFile, { force: true });
  throw error;
} finally {
  if (lock !== undefined) fs.closeSync(lock);
  fs.rmSync(lockFile, { force: true });
}

process.stdout.write('Created private, local-only initial admin and vendor accounts. Read the one-time credentials from artifacts/api-server/.data/LOCAL-LOGIN.txt. No existing files or orders were replaced.\n');
