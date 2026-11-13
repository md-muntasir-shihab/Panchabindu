import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAdminWorkspace, hasModulePermission } from './permissions.ts';
import type { ActorSecurityContext, SystemRoleSlug } from './permissions.ts';

function actor(roleSlug: SystemRoleSlug): ActorSecurityContext {
  return {
    userId: 'test-user',
    username: 'test-user',
    roleSlug,
    vendorId: roleSlug === 'vendor' ? 'test-vendor' : null,
    mustChangePassword: false,
    totpEnrolled: true,
    require2fa: true,
    maxDiscountBp: 0,
    maskCustomerPiiForVendor: true,
  };
}

test('admin workspace denies anonymous, vendor, unknown and incomplete identities', () => {
  assert.equal(canAccessAdminWorkspace(null), false);
  assert.equal(canAccessAdminWorkspace(actor('vendor')), false);
  assert.equal(canAccessAdminWorkspace(actor('unknown' as SystemRoleSlug)), false);
  assert.equal(canAccessAdminWorkspace({ ...actor('super_admin'), mustChangePassword: true }), false);
  assert.equal(canAccessAdminWorkspace({ ...actor('super_admin'), totpEnrolled: false }), false);
});

test('approved staff with complete gate retain workspace access', () => {
  for (const role of ['super_admin', 'marketing_manager', 'packaging_manager'] as const) {
    assert.equal(canAccessAdminWorkspace(actor(role)), true);
  }
  assert.equal(hasModulePermission(actor('vendor'), 'orders', 'update'), false);
});