import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seedPath = path.join(root, 'scripts', 'database', 'runtime-state-seed.json');

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function projectUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a plain HTTPS project URL.');
  }
  return url.href.replace(/\/$/, '');
}

function bootstrapPassword(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (value.length < 24) throw new Error(`${name} must be at least 24 characters.`);
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function encryptSecret(secret, masterKey) {
  const key = crypto.createHmac('sha256', masterKey).update('panchagarh-kdf-v1:aes-256-gcm-at-rest').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

function createBootstrapUsers(documents) {
  const adminPassword = bootstrapPassword('PANCHAGARH_BOOTSTRAP_ADMIN_PASSWORD');
  const vendorPassword = bootstrapPassword('PANCHAGARH_BOOTSTRAP_VENDOR_PASSWORD');
  if (!adminPassword && !vendorPassword) return null;
  if (!adminPassword || !vendorPassword) {
    throw new Error('Both PANCHAGARH_BOOTSTRAP_ADMIN_PASSWORD and PANCHAGARH_BOOTSTRAP_VENDOR_PASSWORD are required together.');
  }
  const masterKey = requiredEnv('CREDENTIALS_ENCRYPTION_KEY');
  if (masterKey.length < 32 || /^0+$/.test(masterKey) || /placeholder|replace|your-/i.test(masterKey)) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a non-placeholder key of at least 32 characters.');
  }
  const now = new Date().toISOString();
  const totpSecret = () => encryptSecret(crypto.randomBytes(20).toString('base64url'), masterKey);
  const common = {
    mustChangePassword: true,
    totpEnrolled: false,
    require2fa: false,
    lastUsedTotpStep: null,
    backupCodeHashes: [],
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntilIso: null,
    lastLoginAt: null,
    createdAt: now,
  };
  const users = [
    {
      ...common,
      userId: 'usr-super-admin',
      username: 'admin',
      internalEmailAlias: 'admin@internal.bongoconsign.local',
      displayNameBn: 'সুপার অ্যাডমিন',
      displayNameEn: 'Super Admin',
      roleSlug: 'super_admin',
      vendorId: null,
      passwordHash: hashPassword(adminPassword),
      totpSecretEncrypted: totpSecret(),
      maxDiscountBp: 5000,
      maskCustomerPiiForVendor: false,
    },
    {
      ...common,
      userId: 'usr-vendor-001',
      username: 'rupganj_vendor',
      internalEmailAlias: 'rupganj_vendor@internal.bongoconsign.local',
      displayNameBn: 'রূপগঞ্জ উইভার্স',
      displayNameEn: 'Rupganj Weavers',
      roleSlug: 'vendor',
      vendorId: '00000000-0000-4000-8000-000000000901',
      passwordHash: hashPassword(vendorPassword),
      totpSecretEncrypted: totpSecret(),
      maxDiscountBp: 0,
      maskCustomerPiiForVendor: true,
    },
  ];
  const adminStore = documents['erp-admin-store.json'];
  adminStore.users = users;
  adminStore.roles = adminStore.roles.map((role) => ({ ...role, require2fa: false }));
  return users;
}

async function rpc(rootUrl, serviceKey, name, body) {
  const response = await fetch(`${rootUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${name} returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`${name} failed (HTTP ${response.status}): ${data?.message || data?.hint || text || 'unknown error'}`);
  }
  return data;
}

const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const rootUrl = projectUrl(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'));
const documents = JSON.parse(await fs.readFile(seedPath, 'utf8'));
const current = await rpc(rootUrl, serviceKey, 'erp_read_runtime_state', {});

if (current?.revision && current?.documents) {
  const existingUsers = current.documents['erp-admin-store.json']?.users;
  if (Array.isArray(existingUsers) && existingUsers.length > 0) {
    console.log(`Runtime state already initialized at revision ${current.revision}; existing accounts were preserved.`);
    process.exit(0);
  }
  const users = createBootstrapUsers(current.documents);
  if (!users) {
    console.log(`Runtime state already initialized at revision ${current.revision}; no bootstrap passwords were supplied.`);
    process.exit(0);
  }
  await rpc(rootUrl, serviceKey, 'erp_commit_runtime_state', {
    expected_revision: String(current.revision),
    changes: { 'erp-admin-store.json': current.documents['erp-admin-store.json'] },
  });
  console.log(`Added ${users.length} bootstrap accounts with 2FA disabled by default.`);
  process.exit(0);
}

createBootstrapUsers(documents);
await rpc(rootUrl, serviceKey, 'erp_initialize_runtime_state', {
  initial_documents: documents,
});
console.log('Initialized the empty production runtime state without overwriting existing data.');
