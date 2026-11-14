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
  contacts: ['lib/admin/contact-management.test.ts'],
  audit: ['lib/geo/bd-geocode.test.ts', 'lib/validators/validators.test.ts', 'lib/money.test.ts', 'lib/i18n/ui-text.test.ts', 'lib/admin/phase4c.test.ts', 'lib/admin/phase5.test.ts', 'lib/admin/phase6.test.ts', 'lib/admin/phase7.test.ts', 'lib/db/backend-route.test.ts', 'lib/db/local-store-integrity.test.ts', 'lib/db/runtime-persistence.test.ts', 'lib/db/product-sync.test.ts', 'lib/media/catalog-import.test.ts', 'lib/media/product-image-precheck.test.ts', 'lib/media/product-image.test.ts', 'lib/storefront/phase6-storefront.test.ts'],
  login: ['lib/security/customer-login-flow.test.ts'],
  checkout: [path.join(root, 'scripts/src/checkout-quote.test.ts')],
  quarantine: [
    'lib/storefront/flash-quarantine.test.ts',
    'lib/storefront/storefront-config.test.ts',
  ],
  security: [
    'lib/security/phase1-security.test.ts',
    'lib/security/self-service-security.test.ts',
    'lib/security/emergency-stop.test.ts',
    'lib/security/customer-route-guards.test.ts',
    'lib/security/backend-endpoints.test.ts',
    'lib/security/phase1-reconciliation.test.ts',
    'lib/admin/phase4a.test.ts',
    'lib/admin/phase4b.test.ts',
    'lib/security/workspace-rbac-snapshot.test.ts',
    'lib/security/unit-test-isolation.test.ts',
    'lib/vendor/vendor-routes.test.ts',
    'lib/vendor/vendor-kyc.test.ts',
  ],
  payments: [
    'lib/advance-courier-mfs.test.ts',
    'lib/inventory/phase3-integrity.test.ts',
    'lib/finance/phase4-ledger.test.ts',
    'lib/courier/phase5-courier-notification.test.ts',
  ],
};
const suite = process.argv[2];
if (!Object.hasOwn(suites, suite)) throw new Error(`Choose a suite: ${Object.keys(suites).join(', ')}`);

// One fresh working directory AND process per file: module-level store paths,
// cached state, sessions and JSON writes cannot reach another suite or real .data.
let failures = 0;
for (const file of suites[suite]) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'panchabindu-unit-'));
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
        // Security tests exercise the explicitly enabled administrator 2FA policy.
        ...(suite === 'security' ? { PANCHABINDU_REQUIRE_2FA_BY_DEFAULT: '1' } : {}),
        CREDENTIALS_ENCRYPTION_KEY: 'isolated-unit-fixture-key-not-for-real-accounts-2026',
        PANCHABINDU_PERSISTENCE: 'json',
        TSX_TSCONFIG_PATH: path.join(root, 'artifacts/api-server/tsconfig.json'),
        PANCHABINDU_UNIT_FIXTURE: fixture,
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
