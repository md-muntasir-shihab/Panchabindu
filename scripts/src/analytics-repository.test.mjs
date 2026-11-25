/**
 * Characterization tests for the analytics repository budget/dedup logic.
 * Run: node --test scripts/src/analytics-repository.test.mjs  [ASSUMED — not run]
 *
 * Mirrors the repo's Node test convention (node:test, no external deps),
 * but imports the TS module through tsx like the dashboard tests do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const modulePath = path.join(
  repoRoot,
  'artifacts/api-server/imported/src/lib/analytics/analytics-repository.ts',
);

const { ANALYTICS_MAX_EVENTS, ANALYTICS_RAW_RETENTION_DAYS } = await import(modulePath);

const DAY_MS = 24 * 60 * 60 * 1000;

test('exported budget constants are the documented values', () => {
  assert.equal(ANALYTICS_MAX_EVENTS, 20_000);
  assert.equal(ANALYTICS_RAW_RETENTION_DAYS, 35);
});
