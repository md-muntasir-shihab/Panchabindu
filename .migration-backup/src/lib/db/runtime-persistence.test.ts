import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withRuntimePersistence, onRuntimeRollback } from './runtime-persistence';
import { readLocalJsonStore, writeLocalJsonStore } from './local-json-store';
import { getPersistenceRuntimeMode } from '../supabase/admin';

test('request transactions commit complete documents and roll back failures', async () => {
  const original = process.cwd();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-transactions-'));
  process.chdir(fixture);
  try {
    const file = path.join(fixture, '.data/erp-store.json');
    const audit = path.join(fixture, '.data/erp-admin-store.json');
    await withRuntimePersistence(() => { writeLocalJsonStore(file, { rows: [1] }); writeLocalJsonStore(audit, { rows: [1] }); });
    let cleaned = false;
    await assert.rejects(withRuntimePersistence(() => {
      writeLocalJsonStore(file, { rows: [2] }); writeLocalJsonStore(audit, { rows: [2] });
      onRuntimeRollback(async () => { cleaned = true; });
      throw new Error('synthetic failure');
    }), /synthetic failure/);
    assert.equal(cleaned, true);
    assert.deepEqual(readLocalJsonStore(file, { arrays: ['rows'] }), { rows: [1] });
    assert.deepEqual(readLocalJsonStore(audit, { arrays: ['rows'] }), { rows: [1] });
    await withRuntimePersistence(() => { writeLocalJsonStore(file, { rows: [3] }); return Response.json({ success: false }); });
    assert.deepEqual(readLocalJsonStore(file, { arrays: ['rows'] }), { rows: [1] });
    assert.equal(fs.existsSync(path.join(fixture, '.data/transaction-recovery.json')), false);
  } finally { process.chdir(original); fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('simultaneous local requests cannot lose stock updates', async () => {
  const original = process.cwd();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-concurrency-'));
  process.chdir(fixture);
  try {
    const file = path.join(fixture, '.data/erp-store.json');
    writeLocalJsonStore(file, { available: 1, orders: [] });
    const attempts = await Promise.all(Array.from({ length: 12 }, () => withRuntimePersistence(async () => {
      const state = readLocalJsonStore<{ available: number; orders: number[] }>(file, { arrays: ['orders'] })!;
      await new Promise(resolve => setTimeout(resolve, 1));
      if (!state.available) return false;
      state.available--;
      state.orders.push(1);
      writeLocalJsonStore(file, state);
      return true;
    })));
    assert.equal(attempts.filter(Boolean).length, 1);
    assert.deepEqual(readLocalJsonStore(file, { arrays: ['orders'] }), { available: 0, orders: [1] });
  } finally { process.chdir(original); fs.rmSync(fixture, { recursive: true, force: true }); }
});

test('Vercel and legacy demo flags cannot unlock production JSON persistence', () => {
  const keys = ['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'ALLOW_DEMO_JSON_PERSISTENCE'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.ALLOW_DEMO_JSON_PERSISTENCE = 'true';
    for (const flag of ['VERCEL', 'VERCEL_ENV']) {
      process.env[flag] = '1';
      assert.equal(getPersistenceRuntimeMode(), 'blocked_production_json');
      delete process.env[flag];
    }
    assert.equal(getPersistenceRuntimeMode(), 'blocked_production_json');
  } finally {
    for (const key of keys) if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
  }
});
