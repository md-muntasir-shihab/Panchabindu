import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getActorSecurityContext } from '../admin/phase4a-service';
import { canExecuteWorkspaceAction, WORKSPACE_ACTIONS } from './workspace-policy';

test('every workspace operation matches the committed seven-principal RBAC snapshot', () => {
  const route = fs.readFileSync(new URL('../../../app/api/admin/workspace/route.ts', import.meta.url), 'utf8');
  const operations = [...route.matchAll(/operation: z.literal\('([^']+)'\)/g)].map(match => match[1]).sort();
  assert.deepEqual(Object.keys(WORKSPACE_ACTIONS).sort(), operations, 'new route operations require a policy and snapshot row');
  const vendorA = getActorSecurityContext('usr-vendor-001');
  assert.ok(vendorA);
  const actors = [
    ['anon', null],
    // Customer sessions are not staff contexts; the workspace route resolves
    // only an admin cookie. Customer ownership is tested in route guards.
    ['customer', getActorSecurityContext('synthetic-customer-not-staff')],
    ['vendor A', vendorA],
    ['vendor B', { ...vendorA, userId: 'synthetic-vendor-b', username: 'synthetic_vendor_b', vendorId: 'synthetic-vendor-b' }],
    ['marketing', getActorSecurityContext('usr-marketing-01')],
    ['packaging', getActorSecurityContext('usr-packaging-01')],
    ['super_admin', getActorSecurityContext('usr-super-admin')],
  ] as const;
  for (const [name, actor] of actors.slice(2)) assert.ok(actor, `${name} fixture is required`);
  assert.equal(actors[1][1], null);
  const markdown = [
    '# Workspace RBAC allow/deny snapshot',
    '',
    'Generated from isolated NODE_ENV=test identities; no real accounts or configuration are used.',
    'ALLOW/DENY describe the HTTP workspace mutation policy, not all domain-service permissions.',
    'Anon and customer have no staff context. Both vendors are denied workspace operations; vendor-specific endpoints and cross-vendor 404s are tested separately.',
    'Disabled operations remain DENY even for super_admin. This is an executable regression snapshot, not a proposed permission change.',
    '',
    `| Operation | ${actors.map(([name]) => name).join(' | ')} |`,
    `|---|${actors.map(() => '---').join('|')}|`,
    ...operations.map(operation => `| ${operation} | ${actors.map(([, actor]) => canExecuteWorkspaceAction(actor, operation) ? 'ALLOW' : 'DENY').join(' | ')} |`),
    '',
    'Regenerate intentionally after reviewing policy changes:',
    '`pnpm --filter @workspace/scripts run test:security --update-rbac`',
    '',
  ].join('\n');
  const snapshot = new URL('../../../../../../docs/planning/panchagarh/workspace-rbac-snapshot.md', import.meta.url);
  if (process.env.UPDATE_RBAC_SNAPSHOT === '1') fs.writeFileSync(snapshot, markdown);
  assert.equal(fs.readFileSync(snapshot, 'utf8'), markdown, 'RBAC policy changed; review the allow/deny diff');
  for (const [, actor] of actors) assert.equal(canExecuteWorkspaceAction(actor, 'unknown_future_operation'), false);
});

test('every admin UI workspace mutation maps to a server operation', () => {
  const adminDir = new URL('../../../../../panchagarh/src/components/admin/', import.meta.url);
  const sources = fs.readdirSync(adminDir)
    .filter(file => file.endsWith('.tsx'))
    .map(file => fs.readFileSync(new URL(file, adminDir), 'utf8'));
  const uiOperations = [...new Set(sources.flatMap(source =>
    [...source.matchAll(/operation:\s*['"]([^'"]+)['"]/g)].map(match => match[1])
  ))].sort();
  const route = fs.readFileSync(new URL('../../../app/api/admin/workspace/route.ts', import.meta.url), 'utf8');
  const serverOperations = new Set(
    [...route.matchAll(/operation: z.literal\('([^']+)'\)/g)].map(match => match[1])
  );
  assert.ok(uiOperations.length > 0, 'admin UI workspace mutations must be discoverable');
  assert.deepEqual(
    uiOperations.filter(operation => !serverOperations.has(operation)),
    [],
    'every admin UI mutation must match a validated server operation'
  );
});
