import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const imported = path.join(root, 'artifacts/api-server/imported');
const suites = {
  checkout: [path.join(root, 'scripts/src/checkout-quote.test.ts')],
  quarantine: [
    'lib/storefront/flash-quarantine.test.ts',
    'lib/storefront/storefront-config.test.ts',
  ],
  security: [
    'lib/security/phase1-security.test.ts',
    'lib/security/customer-route-guards.test.ts',
    'lib/security/backend-endpoints.test.ts',
    'lib/security/phase1-reconciliation.test.ts',
    'lib/admin/phase4a.test.ts',
    'lib/admin/phase4b.test.ts',
    'lib/security/workspace-rbac-snapshot.test.ts',
    'lib/security/unit-test-isolation.test.ts',
  ],
  payments: [
    'lib/advance-courier-mfs.test.ts',
    'lib/inventory/phase3-integrity.test.ts',
    'lib/finance/phase4-ledger.test.ts',
    'lib/courier/phase5-courier-notification.test.ts',
  ],
};
const suite = process.argv[2];
if (!Object.hasOwn(suites, suite)) throw new Error('Choose security, payments, quarantine or checkout');

// One fresh working directory AND process per file: module-level store paths,
// cached state, sessions and JSON writes cannot reach another suite or real .data.
let failures = 0;
for (const file of suites[suite]) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'panchagarh-unit-'));
  try {
    mkdirSync(path.join(fixture, '.data'));
    // A legacy coverage assertion reads source relative to cwd. Never link .data.
    symlinkSync(path.join(imported, 'app'), path.join(fixture, 'app'), 'dir');
    console.log(`\n=== ${suite}: ${file} (isolated JSON fixture) ===`);
    const result = spawnSync(process.execPath, [
      '--import', fileURLToPath(new URL('./unit-test-boundary.mjs', import.meta.url)),
      '--import', require.resolve('tsx/esm'),
      '--test', path.resolve(imported, 'src', file),
    ], {
      cwd: fixture,
      // Deliberate allowlist: no inherited credentials, provider configuration,
      // NODE_OPTIONS, sandbox passwords, 2FA overrides or production database.
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        CREDENTIALS_ENCRYPTION_KEY: 'isolated-unit-fixture-key-not-for-real-accounts-2026',
        PANCHAGARH_PERSISTENCE: 'json',
        TSX_TSCONFIG_PATH: path.join(root, 'artifacts/api-server/tsconfig.json'),
        PANCHAGARH_UNIT_FIXTURE: fixture,
        UPDATE_RBAC_SNAPSHOT: process.argv.includes('--update-rbac') ? '1' : '0',
      },
      stdio: 'inherit',
      timeout: 120_000,
    });
    if (result.error) console.error(result.error.message);
    if (result.status !== 0) failures++;
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}
console.log(`\n${suite}: ${suites[suite].length - failures}/${suites[suite].length} files passed`);
process.exitCode = failures ? 1 : 0;
