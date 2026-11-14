import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const RUNTIME_DOCUMENTS = [
  'erp-store.json', 'erp-admin-store.json', 'erp-security-sessions.json',
  'erp-phase3-store.json', 'erp-phase4b-store.json', 'erp-phase4c-store.json',
  'erp-phase4-gl-store.json', 'erp-phase5-courier-notif-store.json',
  'erp-phase6-store.json', 'erp-phase7-store.json',
] as const;

type DocumentName = typeof RUNTIME_DOCUMENTS[number];
type Documents = Partial<Record<DocumentName, object>>;
interface RuntimeTransaction {
  documents: Documents;
  dirty: Set<DocumentName>;
  durable: boolean;
  rollback: Array<() => Promise<unknown>>;
}

const transactions = new AsyncLocalStorage<RuntimeTransaction>();
let localQueue: Promise<unknown> = Promise.resolve();

export function usesPostgresPersistence(): boolean {
  const configured = process.env.PANCHABINDU_PERSISTENCE?.trim().toLowerCase();
  // Production never falls back to ephemeral JSON. If no mode was specified,
  // use the durable database that the deployment initialization requires.
  return configured === 'postgres' || (!configured && process.env.NODE_ENV === 'production');
}

export function hasDurableRuntimeContext(): boolean {
  return transactions.getStore()?.durable === true;
}

export function onRuntimeRollback(operation: () => Promise<unknown>): void {
  const transaction = transactions.getStore();
  if (!transaction) throw new Error('DATABASE_TRANSACTION_REQUIRED');
  transaction.rollback.push(operation);
}

async function rollbackExternalEffects(transaction: RuntimeTransaction): Promise<void> {
  for (const operation of transaction.rollback.reverse()) await operation().catch(() => undefined);
}

function documentName(file: string): DocumentName {
  const name = path.basename(file);
  if (!RUNTIME_DOCUMENTS.includes(name as DocumentName)) throw new Error('UNKNOWN_RUNTIME_DOCUMENT');
  return name as DocumentName;
}

export function readRuntimeDocument(file: string): { active: boolean; value: object | null } {
  const transaction = transactions.getStore();
  if (!transaction) {
    if (usesPostgresPersistence()) throw new Error('DATABASE_TRANSACTION_REQUIRED');
    return { active: false, value: null };
  }
  const name = documentName(file);
  const value = transaction.documents[name];
  if (!value && transaction.durable) throw new Error('DATABASE_INITIALIZATION_REQUIRED');
  return { active: true, value: value ? structuredClone(value) : null };
}

export function writeRuntimeDocument(file: string, value: object): boolean {
  const transaction = transactions.getStore();
  if (!transaction) {
    if (usesPostgresPersistence()) throw new Error('DATABASE_TRANSACTION_REQUIRED');
    return false;
  }
  const name = documentName(file);
  transaction.documents[name] = structuredClone(value);
  transaction.dirty.add(name);
  return true;
}

function databaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your-project-ref') || key.includes('your-supabase')) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function restoreLocalJournal(directory: string): void {
  const journal = path.join(directory, 'transaction-recovery.json');
  if (!fs.existsSync(journal)) return;
  const previous = JSON.parse(fs.readFileSync(journal, 'utf8')) as Record<string, string | null>;
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('INVALID_RECOVERY_JOURNAL');
  for (const [name, raw] of Object.entries(previous)) {
    documentName(name);
    const target = path.join(directory, name);
    if (raw === null) fs.rmSync(target, { force: true });
    else if (typeof raw === 'string') fs.writeFileSync(target, raw, { mode: 0o600 });
    else throw new Error('INVALID_RECOVERY_JOURNAL');
  }
  fs.unlinkSync(journal);
}

function commitLocal(directory: string, transaction: RuntimeTransaction): void {
  if (transaction.dirty.size === 0) return;
  const previous: Record<string, string | null> = {};
  for (const name of transaction.dirty) {
    const target = path.join(directory, name);
    previous[name] = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  }
  const journal = path.join(directory, 'transaction-recovery.json');
  const descriptor = fs.openSync(journal, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(previous));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    for (const name of transaction.dirty) {
      const target = path.join(directory, name);
      const temporary = `${target}.pending`;
      fs.writeFileSync(temporary, JSON.stringify(transaction.documents[name]), { mode: 0o600 });
      fs.renameSync(temporary, target);
    }
    fs.unlinkSync(journal);
  } catch (error) {
    restoreLocalJournal(directory);
    throw error;
  }
}

async function shouldCommit(value: unknown): Promise<boolean> {
  if (!(value instanceof Response)) return true;
  if (value.status >= 400) return false;
  if (value.headers.get('content-type')?.includes('application/json')) {
    const body = await value.clone().json();
    return !(body && typeof body === 'object' && 'success' in body && body.success === false);
  }
  return true;
}

export async function withRuntimePersistence<T>(operation: () => T | Promise<T>, options?: { commitAuthFailure?: boolean }): Promise<T> {
  if (transactions.getStore()) return operation();
  if (usesPostgresPersistence()) {
    const client = databaseClient();
    const { data, error } = await client.rpc('erp_read_runtime_state');
    if (error || !data?.documents || !data?.revision) throw new Error('DATABASE_INITIALIZATION_REQUIRED');
    const transaction: RuntimeTransaction = { documents: data.documents, dirty: new Set(), durable: true, rollback: [] };
    return transactions.run(transaction, async () => {
      try {
        const value = await operation();
        if (transaction.dirty.size && (options?.commitAuthFailure || await shouldCommit(value))) {
          const changes = Object.fromEntries([...transaction.dirty].map(name => [name, transaction.documents[name]]));
          const result = await client.rpc('erp_commit_runtime_state', { expected_revision: String(data.revision), changes });
          if (result.error) throw new Error(result.error.message.includes('CONFLICT') ? 'DATABASE_WRITE_CONFLICT' : 'DATABASE_COMMIT_FAILED');
        } else if (!await shouldCommit(value)) await rollbackExternalEffects(transaction);
        return value;
      } catch (error) {
        await rollbackExternalEffects(transaction);
        throw error;
      }
    });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PRODUCTION_DATABASE_REQUIRED');
  }
  const run = async () => {
    const directory = path.join(process.cwd(), '.data');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lock = path.join(directory, 'transaction.lock');
    let descriptor: number | undefined;
    for (let attempt = 0; attempt < 100 && descriptor === undefined; attempt++) {
      try { descriptor = fs.openSync(lock, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    if (descriptor === undefined) throw new Error('DATABASE_WRITE_CONFLICT');
    try {
      restoreLocalJournal(directory);
      const documents: Documents = {};
      for (const name of RUNTIME_DOCUMENTS) {
        const target = path.join(directory, name);
        if (fs.existsSync(target)) documents[name] = JSON.parse(fs.readFileSync(target, 'utf8'));
      }
      const transaction: RuntimeTransaction = { documents, dirty: new Set(), durable: false, rollback: [] };
      return await transactions.run(transaction, async () => {
        try {
          const value = await operation();
          if (options?.commitAuthFailure || await shouldCommit(value)) commitLocal(directory, transaction);
          else await rollbackExternalEffects(transaction);
          return value;
        } catch (error) {
          await rollbackExternalEffects(transaction);
          throw error;
        }
      });
    } finally {
      fs.closeSync(descriptor);
      fs.unlinkSync(lock);
    }
  };
  const next = localQueue.then(run, run);
  localQueue = next.catch(() => undefined);
  return next;
}
