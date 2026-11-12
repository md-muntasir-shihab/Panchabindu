import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertProductionPersistenceAllowed } from '../supabase/admin';

interface LocalStoreShape {
  arrays?: readonly string[];
  objects?: readonly string[];
  booleans?: readonly string[];
  optionalArrays?: readonly string[];
  optionalObjects?: readonly string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Local fixtures only. Missing files may initialize; unreadable/corrupt files must not reseed. */
export function readLocalJsonStore<T extends object>(
  file: string,
  shape: LocalStoreShape
): T | null {
  assertProductionPersistenceAllowed();
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('LOCAL_STORE_READ_FAILED: Existing local data could not be read.');
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('LOCAL_STORE_INVALID: Existing local data requires operator review.');
  }
  if (!isObject(value) ||
      shape.arrays?.some((key) => !Array.isArray(value[key])) ||
      shape.objects?.some((key) => !isObject(value[key])) ||
      shape.booleans?.some((key) => typeof value[key] !== 'boolean') ||
      shape.optionalArrays?.some((key) => key in value && !Array.isArray(value[key])) ||
      shape.optionalObjects?.some((key) => key in value && !isObject(value[key]))) {
    throw new Error('LOCAL_STORE_INVALID: Existing local data requires operator review.');
  }
  return value as T;
}

/** Replace one file after a complete write; this is NOT a multi-store transaction or concurrency lock. */
export function writeLocalJsonStore(file: string, value: object): void {
  assertProductionPersistenceAllowed();
  const temporary = `${file}.tmp-${crypto.randomUUID()}`;
  let descriptor: number | undefined;
  let created = false;
  try {
    // Serialize before touching disk, so invalid/circular input cannot damage the prior file.
    const serialized = JSON.stringify(value, null, 2);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    created = true;
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } catch {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* Preserve the original failure. */ }
    }
    if (created) {
      try { fs.unlinkSync(temporary); } catch { /* Never remove the original store. */ }
    }
    throw new Error('LOCAL_STORE_WRITE_FAILED: Local data was not saved.');
  }
}