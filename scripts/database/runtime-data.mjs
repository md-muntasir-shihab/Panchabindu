import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const DOCUMENT_NAMES = [
  'erp-store.json', 'erp-admin-store.json', 'erp-security-sessions.json', 'erp-phase3-store.json',
  'erp-phase4b-store.json', 'erp-phase4c-store.json', 'erp-phase4-gl-store.json',
  'erp-phase5-courier-notif-store.json', 'erp-phase6-store.json', 'erp-phase7-store.json',
];

export function backupEnvelope(documents, revision = null) {
  if (!documents || typeof documents !== 'object' || Array.isArray(documents) ||
      Object.keys(documents).length !== DOCUMENT_NAMES.length || DOCUMENT_NAMES.some(name => !documents[name] || typeof documents[name] !== 'object' || Array.isArray(documents[name]))) {
    throw new Error('INVALID_BACKUP_DOCUMENTS');
  }
  const serialized = JSON.stringify(documents);
  return { format: 'PANCHAGARH_RUNTIME_BACKUP', version: 1, createdAt: new Date().toISOString(), revision,
    sha256: crypto.createHash('sha256').update(serialized).digest('hex'), documents,
  };
}

export function verifyBackup(envelope) {
  if (envelope?.format !== 'PANCHAGARH_RUNTIME_BACKUP' || envelope.version !== 1) throw new Error('INVALID_BACKUP_FORMAT');
  const expected = backupEnvelope(envelope.documents, envelope.revision);
  if (typeof envelope.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.sha256) ||
      !crypto.timingSafeEqual(Buffer.from(envelope.sha256, 'hex'), Buffer.from(expected.sha256, 'hex'))) throw new Error('BACKUP_CHECKSUM_MISMATCH');
  return expected.documents;
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your-project-ref') || key.includes('your-supabase')) throw new Error('DATABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const option = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
  if (mode === 'verify') {
    verifyBackup(JSON.parse(fs.readFileSync(option('--input'), 'utf8')));
    console.log('Backup format and checksum verified. Database restore acceptance requires the database tests.');
    return;
  }
  if (mode === 'prepare' || mode === 'backup') {
    let documents, revision = null;
    if (mode === 'prepare') {
      if (!args.includes('--reviewed-offline-snapshot')) throw new Error('REVIEWED_OFFLINE_SNAPSHOT_REQUIRED');
      const directory = path.resolve(option('--source'));
      documents = Object.fromEntries(DOCUMENT_NAMES.map(name => [name, JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))]));
    } else {
      const result = await client().rpc('erp_read_runtime_state');
      if (result.error || !result.data) throw new Error('BACKUP_READ_FAILED');
      documents = result.data.documents; revision = result.data.revision;
    }
    const target = path.resolve(option('--output'));
    fs.writeFileSync(target, JSON.stringify(backupEnvelope(documents, revision)), { flag: 'wx', mode: 0o600 });
    console.log('Backup written. Keep this file private and retain the encryption key separately.');
    return;
  }
  if (mode === 'initialize') {
    if (!args.includes('--apply-reviewed-snapshot')) throw new Error('REVIEWED_APPLY_REQUIRED');
    const documents = verifyBackup(JSON.parse(fs.readFileSync(option('--input'), 'utf8')));
    const result = await client().rpc('erp_initialize_runtime_state', { initial_documents: documents });
    if (result.error) throw new Error('INITIALIZATION_REJECTED');
    console.log('Initialized the empty runtime database. An existing database is never overwritten.');
    return;
  }
  throw new Error('Use prepare, backup, verify or initialize with explicit file paths.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'RUNTIME_DATA_FAILED'); process.exitCode = 1; });
}
