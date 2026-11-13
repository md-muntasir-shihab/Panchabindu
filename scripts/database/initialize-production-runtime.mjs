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
  console.log(`Runtime state already initialized at revision ${current.revision}; nothing was changed.`);
  process.exit(0);
}

await rpc(rootUrl, serviceKey, 'erp_initialize_runtime_state', {
  initial_documents: documents,
});
console.log('Initialized the empty production runtime state. No existing data was overwritten.');
