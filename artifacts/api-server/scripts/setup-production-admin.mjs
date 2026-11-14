// One-time, operator-run bootstrap for an already initialized production database.
// Never expose this operation as an HTTP endpoint or commit its output file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as OTPAuth from 'otpauth';

const defaultFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/PRODUCTION-ADMIN-LOGIN.txt');

function encryptedSecret(secret, masterKey) {
  const key = crypto.createHmac('sha256', masterKey).update('panchagarh-kdf-v1:aes-256-gcm-at-rest').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function setupProductionAdmin({ env = process.env, fetchImpl = fetch, loginFile = defaultFile } = {}) {
  const masterKey = env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const rawUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  if (!masterKey || masterKey.length < 32 || /^0+$/.test(masterKey) || /placeholder|replace|your-/i.test(masterKey)) throw new Error('CREDENTIALS_ENCRYPTION_KEY must be the production key (at least 32 characters).');
  if (!serviceKey || !rawUrl) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('SUPABASE_URL must be a valid HTTPS project URL.');
  const root = url.href.replace(/\/$/, '');
  const headers = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rpc = async (name, body) => {
    const response = await fetchImpl(`${root}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${name} failed (HTTP ${response.status}).`);
    return response.json();
  };
  const state = await rpc('erp_read_runtime_state', {});
  const store = state?.documents?.['erp-admin-store.json'];
  if (!state?.revision || !store || !Array.isArray(store.users) || !Array.isArray(store.roles) || !Array.isArray(store.auditLogs)) throw new Error('Initialized runtime database required before creating an admin.');
  if (!store.roles.some(role => role.roleSlug === 'super_admin')) throw new Error('The initialized runtime must include the super_admin role.');
  if (store.users.some(user => user.roleSlug === 'super_admin' || String(user.username).toLowerCase() === 'admin')) throw new Error('An admin account already exists; nothing was changed.');

  const password = crypto.randomBytes(32).toString('base64url');
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const now = new Date().toISOString();
  const user = {
    userId: crypto.randomUUID(), username: 'admin', internalEmailAlias: 'admin@internal.bongoconsign.local',
    displayNameBn: 'সুপার অ্যাডমিন', displayNameEn: 'Super Admin', roleSlug: 'super_admin', vendorId: null,
    passwordHash: passwordHash(password), mustChangePassword: true, totpEnrolled: false, require2fa: false,
    totpSecretEncrypted: encryptedSecret(secret, masterKey), lastUsedTotpStep: null, backupCodeHashes: [],
    maxDiscountBp: 5000, maskCustomerPiiForVendor: false, isActive: true, failedLoginAttempts: 0,
    lockedUntilIso: null, lastLoginAt: null, createdAt: now,
  };

  // Write the credential before committing: if the connection fails after the
  // server commits, the only copy is not lost. Never overwrite an existing file.
  fs.mkdirSync(path.dirname(loginFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(loginFile, `PRIVATE PRODUCTION ADMIN CREDENTIALS\nUsername: admin\nTemporary password: ${password}\n\nOpen /admin. Change this password and enroll an authenticator on first login.\nIf setup reported an error, check the database before retrying; the commit may have succeeded.\n`, { flag: 'wx', mode: 0o600 });
  try {
    await rpc('erp_commit_runtime_state', { expected_revision: String(state.revision), changes: { 'erp-admin-store.json': { ...store, users: [...store.users, user] } } });
  } catch {
    throw new Error(`Database update failed or its result is unknown. Keep ${loginFile} private and check the database before retrying.`);
  }
  return { loginFile, username: 'admin' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  setupProductionAdmin().then(({ loginFile }) => {
    console.log(`Created admin. Read the temporary password privately from ${loginFile}.`);
  }).catch(error => {
    console.error(error instanceof Error ? error.message : 'Admin setup failed.');
    process.exitCode = 1;
  });
}
