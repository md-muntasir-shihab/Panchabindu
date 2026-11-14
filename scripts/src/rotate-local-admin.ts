import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiDirectory = path.join(workspaceRoot, 'artifacts/api-server');
const dataDirectory = path.join(apiDirectory, '.data');
const envFile = path.join(dataDirectory, 'sandbox.env');
const credentialsFile = path.join(dataDirectory, 'LOCAL-LOGIN.txt');
type LocalAdminUser = {
  userId: string;
  username: string;
  roleSlug: string;
  internalEmailAlias: string;
  passwordHash: string;
  mustChangePassword: boolean;
  require2fa: boolean;
  totpEnrolled: boolean;
  backupCodeHashes: string[];
  lastUsedTotpStep: number | null;
  failedLoginAttempts: number;
  lockedUntilIso: string | null;
  lastLoginAt: string | null;
};

process.chdir(apiDirectory);
process.loadEnvFile(envFile);
process.env.NODE_ENV = 'development';
if (process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH !== '1') {
  throw new Error('Local sandbox authentication is not enabled.');
}

const servicePath = pathToFileURL(path.join(apiDirectory, 'imported/src/lib/admin/phase4a-service.ts')).href;
const securityPath = pathToFileURL(path.join(apiDirectory, 'imported/src/lib/security/crypto-session.ts')).href;
const [{ readAdminStore, writeAdminStore }, { hashPassword, revokeAllUserSessions }] = await Promise.all([
  import(servicePath),
  import(securityPath),
]);

const adminUsername = 'panchabindu_owner';
const adminPassword = crypto.randomBytes(32).toString('base64url');
const store = readAdminStore();
const admin = store.users.find((user: LocalAdminUser) => user.username === 'admin' && user.roleSlug === 'super_admin')
  ?? store.users.find((user: LocalAdminUser) => user.username === adminUsername && user.roleSlug === 'super_admin');
if (!admin) throw new Error('The local super-admin account was not found.');
if (store.users.some((user: LocalAdminUser) => user.username === adminUsername && user.userId !== admin.userId)) {
  throw new Error('The requested local admin username is already in use.');
}

admin.username = adminUsername;
admin.internalEmailAlias = `${adminUsername}@internal.bongoconsign.local`;
admin.passwordHash = hashPassword(adminPassword);
admin.mustChangePassword = false;
admin.require2fa = false;
admin.totpEnrolled = false;
admin.backupCodeHashes = [];
admin.lastUsedTotpStep = null;
admin.failedLoginAttempts = 0;
admin.lockedUntilIso = null;
admin.lastLoginAt = null;

writeAdminStore(store);
revokeAllUserSessions(admin.userId);

let env = fs.readFileSync(envFile, 'utf8');
const updateEnv = (name: string, value: string) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, line) : `${env.trimEnd()}\n${line}\n`;
};
updateEnv('PANCHABINDU_SANDBOX_ADMIN_USERNAME', adminUsername);
updateEnv('PANCHABINDU_SANDBOX_ADMIN_PASSWORD', adminPassword);
fs.writeFileSync(envFile, env, { mode: 0o600 });
fs.chmodSync(envFile, 0o600);

const credentials = [
  'PRIVATE REPLIT DEVELOPMENT LOGIN — local sandbox only.',
  'Do not share this file or the development preview URL.',
  '',
  'Admin',
  'URL: /admin',
  `Username: ${adminUsername}`,
  `Password: ${adminPassword}`,
  'Two-factor authentication is off in this local sandbox.',
  '',
  'Vendor',
  'URL: /vendor',
  'Username: rupganj_vendor',
  'Password: unchanged; use the password already set for this account.',
  'Two-factor authentication is off in this local sandbox.',
  '',
  'Customer',
  'URL: /account',
  'Sign in using the local test phone OTP shown on the page; customers do not have passwords.',
  '',
  'No Supabase or production account was changed.',
  '',
].join('\n');
fs.writeFileSync(credentialsFile, credentials, { mode: 0o600 });
fs.chmodSync(credentialsFile, 0o600);

console.log('Generated a new local admin username and password, revoked the prior admin sessions, and updated the private credential file. Values were not printed.');
