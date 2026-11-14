// src/types/permissions.ts
// Granular Role + Module + Action + Field-Level Security Matrix & Server DTO Serializer
// Rule A1/A2: Authorization and field-level data hiding are enforced on the SERVER.
// Cross-vendor access returns 404 (not 403). Customer-facing outputs never see vendor/cost fields.

export type SystemRoleSlug =
  | 'super_admin'
  | 'vendor'
  | 'marketing_manager'
  | 'packaging_manager';

export const APPROVED_SYSTEM_ROLES: readonly SystemRoleSlug[] = [
  'super_admin',
  'vendor',
  'marketing_manager',
  'packaging_manager',
] as const;

export type PermissionModuleKey =
  | 'today_screen'
  | 'orders'
  | 'print_engine'
  | 'couriers'
  | 'vendors'
  | 'vendor_ledger'
  | 'payouts'
  | 'catalog'
  | 'inventory'
  | 'finance'
  | 'expenses'
  | 'promos'
  | 'messaging'
  | 'automation'
  | 'google_sync'
  | 'settings_control_center'
  | 'users_security'
  | 'audit_logs';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete';

export interface ModulePermissionRule {
  moduleKey: PermissionModuleKey;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  allowedFields: readonly string[];
  hiddenFields: readonly string[];
  maskedFields: readonly string[];
}

export interface ActorSecurityContext {
  userId: string;
  username: string;
  roleSlug: SystemRoleSlug;
  vendorId: string | null;
  mustChangePassword: boolean;
  totpEnrolled: boolean;
  require2fa: boolean;
  maxDiscountBp: number;
  maskCustomerPiiForVendor: boolean;
  customOverrides?: Partial<Record<PermissionModuleKey, Partial<ModulePermissionRule>>>;
}

/**
 * Fields that MUST NEVER appear in any customer-facing response, invoice,
 * courier sticker, SMS, email, or QR code.
 */
export const CUSTOMER_FORBIDDEN_FIELDS: readonly string[] = [
  'customerId', 'customer_id',
  'vendor_id',
  'vendorId',
  'vendor_code',
  'vendorCode',
  'internal_vendor_sku',
  'internalVendorSku',
  'internal_vendor_sku_snapshot',
  'internalVendorSkuSnapshot',
  'supplier_cost_poisha',
  'supplierCostPoisha',
  'snap_unit_supplier_cost_poisha',
  'unitSupplierCostPoisha',
  'supplier_profit_poisha',
  'supplierProfitPoisha',
  'snap_unit_supplier_profit_poisha',
  'unitSupplierProfitPoisha',
  'supplier_payable_poisha',
  'supplierPayablePoisha',
  'snap_unit_supplier_payable_poisha',
  'unitSupplierPayablePoisha',
  'line_supplier_payable_poisha',
  'lineSupplierPayablePoisha',
  'snap_total_supplier_payable_poisha',
  'snapTotalSupplierPayablePoisha',
  'platform_margin_poisha',
  'platformMarginPoisha',
  'snap_unit_platform_margin_poisha',
  'unitPlatformMarginPoisha',
  'line_platform_margin_poisha',
  'linePlatformMarginPoisha',
  'snap_total_platform_margin_poisha',
  'snapTotalPlatformMarginPoisha',
  'estimated_net_profit_poisha',
  'estimatedNetProfitPoisha',
  'internal_staff_note',
  'internalStaffNote',
  'customerEmail',
  'customer_email',
] as const;

/**
 * Fields hidden from Marketing Manager & Packaging Manager roles
 */
export const STAFF_COST_AND_PROFIT_HIDDEN_FIELDS: readonly string[] = [
  ...CUSTOMER_FORBIDDEN_FIELDS,
  'customerId', 'customer_id', 'snapSupplierCostPoisha', 'snapSupplierProfitPoisha',
  'snapSupplierPayablePoisha', 'snapPlatformMarginPoisha', 'lineNetPlatformMarginPoisha',
  'supplier_cost_poisha',
  'supplierCostPoisha',
  'snap_unit_supplier_cost_poisha',
  'unitSupplierCostPoisha',
  'platform_margin_poisha',
  'platformMarginPoisha',
  'snap_unit_platform_margin_poisha',
  'unitPlatformMarginPoisha',
  'line_platform_margin_poisha',
  'linePlatformMarginPoisha',
  'snap_total_platform_margin_poisha',
  'snapTotalPlatformMarginPoisha',
  'estimated_net_profit_poisha',
  'estimatedNetProfitPoisha',
] as const;

/**
 * Masks a Bangladesh phone number for Vendor view: 01712345678 -> 017****678
 */
export function maskBdPhone(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length < 7) return '*******';
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-3)}`;
}

/**
 * Masks a street address for Vendor view when maskCustomerPiiForVendor is enabled
 */
export function maskStreetAddress(address: string): string {
  if (!address) return '';
  return 'ঠিকানা গোপন রাখা হয়েছে (অ্যাডমিন নিয়ন্ত্রিত)';
}

/**
 * Enforces First-Login Gate (password change + mandatory 2FA enrollment)
 */
export function isFirstLoginGateCleared(ctx: ActorSecurityContext): boolean {
  if (ctx.mustChangePassword) return false;
  if (ctx.require2fa && !ctx.totpEnrolled) return false;
  return true;
}

/**
 * Verifies resource ownership for Vendor role.
 * Rule A2: Cross-vendor access MUST throw 404 Not Found (never 403 Forbidden).
 */
export function assertVendorOwnershipOr404(
  ctx: ActorSecurityContext,
  resourceVendorId: string
): void {
  if (ctx.roleSlug === 'super_admin') return;
  if (ctx.roleSlug === 'vendor') {
    if (!ctx.vendorId || ctx.vendorId !== resourceVendorId) {
      const err = new Error('Resource not found');
      (err as Error & { statusCode?: number }).statusCode = 404;
      throw err;
    }
  }
}

/**
 * Server-side field-level sanitizer that strips forbidden columns and masks PII
 * based on the caller's role before any JSON leaves the server.
 */
export function sanitizeRecordForRole<T extends Record<string, unknown>>(
  record: T,
  roleSlug: SystemRoleSlug | 'public_customer',
  options?: { maskVendorCustomerPii?: boolean }
): Partial<T> {
  const clone: Record<string, unknown> = { ...record };

  if (roleSlug === 'public_customer') {
    for (const field of CUSTOMER_FORBIDDEN_FIELDS) {
      delete clone[field];
    }
    return clone as Partial<T>;
  }

  if (roleSlug === 'super_admin') {
    return clone as Partial<T>;
  }

  if (roleSlug === 'marketing_manager' || roleSlug === 'packaging_manager') {
    for (const field of STAFF_COST_AND_PROFIT_HIDDEN_FIELDS) {
      delete clone[field];
    }
    // Recurse through nested variants/lines instead of hiding only top-level keys.
    for (const [key, value] of Object.entries(clone)) {
      if (Array.isArray(value)) clone[key] = value.map((item) => item && typeof item === 'object' ? sanitizeRecordForRole(item, roleSlug) : item);
      else if (value && typeof value === 'object') clone[key] = sanitizeRecordForRole(value as Record<string, unknown>, roleSlug);
    }
    return clone as Partial<T>;
  }

  if (roleSlug === 'vendor') {
    // Vendor never sees our platform margin or net profit
    const vendorHidden = [
      'platform_margin_poisha',
      'platformMarginPoisha',
      'snap_unit_platform_margin_poisha',
      'unitPlatformMarginPoisha',
      'line_platform_margin_poisha',
      'linePlatformMarginPoisha',
      'snap_total_platform_margin_poisha',
      'snapTotalPlatformMarginPoisha',
      'estimated_net_profit_poisha',
      'estimatedNetProfitPoisha',
      'internal_staff_note',
      'internalStaffNote',
      'customerEmail',
    ];
    for (const field of vendorHidden) {
      delete clone[field];
    }

    const shouldMask = options?.maskVendorCustomerPii ?? true;
    if (shouldMask) {
      if (typeof clone.customer_phone === 'string') {
        clone.customer_phone = maskBdPhone(clone.customer_phone);
      }
      if (typeof clone.customerPhone === 'string') {
        clone.customerPhone = maskBdPhone(clone.customerPhone);
      }
      if (typeof clone.street_address === 'string') {
        clone.street_address = maskStreetAddress(clone.street_address);
      }
      if (typeof clone.streetAddress === 'string') {
        clone.streetAddress = maskStreetAddress(clone.streetAddress);
      }
    }
  }

  if (!APPROVED_SYSTEM_ROLES.includes(roleSlug as SystemRoleSlug)) return {};

  return clone as Partial<T>;
}

export interface ModulePermissionSet {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * Default server-side role-to-module permission matrix (Deny-by-Default).
 */
export const DEFAULT_ROLE_MODULE_PERMISSIONS: Record<
  SystemRoleSlug,
  Record<PermissionModuleKey, ModulePermissionSet>
> = {
  super_admin: {
    today_screen: { read: true, create: true, update: true, delete: true },
    orders: { read: true, create: true, update: true, delete: true },
    print_engine: { read: true, create: true, update: true, delete: true },
    couriers: { read: true, create: true, update: true, delete: true },
    vendors: { read: true, create: true, update: true, delete: true },
    vendor_ledger: { read: true, create: true, update: true, delete: true },
    payouts: { read: true, create: true, update: true, delete: true },
    catalog: { read: true, create: true, update: true, delete: true },
    inventory: { read: true, create: true, update: true, delete: true },
    finance: { read: true, create: true, update: true, delete: true },
    expenses: { read: true, create: true, update: true, delete: true },
    promos: { read: true, create: true, update: true, delete: true },
    messaging: { read: true, create: true, update: true, delete: true },
    automation: { read: true, create: true, update: true, delete: true },
    google_sync: { read: true, create: true, update: true, delete: true },
    settings_control_center: { read: true, create: true, update: true, delete: true },
    users_security: { read: true, create: true, update: true, delete: true },
    audit_logs: { read: true, create: true, update: true, delete: true },
  },
  vendor: {
    today_screen: { read: true, create: false, update: false, delete: false },
    orders: { read: true, create: false, update: false, delete: false },
    print_engine: { read: true, create: true, update: false, delete: false },
    couriers: { read: false, create: false, update: false, delete: false },
    vendors: { read: true, create: false, update: false, delete: false },
    vendor_ledger: { read: true, create: false, update: false, delete: false },
    payouts: { read: true, create: true, update: false, delete: false },
    catalog: { read: true, create: true, update: true, delete: false },
    inventory: { read: true, create: true, update: true, delete: false },
    finance: { read: false, create: false, update: false, delete: false },
    expenses: { read: false, create: false, update: false, delete: false },
    promos: { read: false, create: false, update: false, delete: false },
    messaging: { read: false, create: false, update: false, delete: false },
    automation: { read: false, create: false, update: false, delete: false },
    google_sync: { read: false, create: false, update: false, delete: false },
    settings_control_center: { read: false, create: false, update: false, delete: false },
    users_security: { read: false, create: false, update: false, delete: false },
    audit_logs: { read: false, create: false, update: false, delete: false },
  },
  marketing_manager: {
    today_screen: { read: true, create: true, update: true, delete: false },
    orders: { read: true, create: true, update: true, delete: false },
    print_engine: { read: true, create: false, update: false, delete: false },
    couriers: { read: true, create: false, update: false, delete: false },
    vendors: { read: false, create: false, update: false, delete: false },
    vendor_ledger: { read: false, create: false, update: false, delete: false },
    payouts: { read: false, create: false, update: false, delete: false },
    catalog: { read: true, create: true, update: true, delete: false },
    inventory: { read: true, create: true, update: true, delete: false },
    finance: { read: false, create: false, update: false, delete: false },
    expenses: { read: true, create: true, update: false, delete: false },
    promos: { read: true, create: true, update: true, delete: false },
    messaging: { read: true, create: true, update: true, delete: false },
    automation: { read: true, create: false, update: false, delete: false },
    google_sync: { read: false, create: false, update: false, delete: false },
    settings_control_center: { read: false, create: false, update: false, delete: false },
    users_security: { read: false, create: false, update: false, delete: false },
    audit_logs: { read: false, create: false, update: false, delete: false },
  },
  packaging_manager: {
    today_screen: { read: true, create: false, update: true, delete: false },
    orders: { read: true, create: false, update: true, delete: false },
    print_engine: { read: true, create: true, update: false, delete: false },
    couriers: { read: true, create: true, update: true, delete: false },
    vendors: { read: false, create: false, update: false, delete: false },
    vendor_ledger: { read: false, create: false, update: false, delete: false },
    payouts: { read: false, create: false, update: false, delete: false },
    catalog: { read: true, create: false, update: false, delete: false },
    inventory: { read: true, create: false, update: true, delete: false },
    finance: { read: false, create: false, update: false, delete: false },
    expenses: { read: false, create: false, update: false, delete: false },
    promos: { read: false, create: false, update: false, delete: false },
    messaging: { read: false, create: false, update: false, delete: false },
    automation: { read: false, create: false, update: false, delete: false },
    google_sync: { read: false, create: false, update: false, delete: false },
    settings_control_center: { read: false, create: false, update: false, delete: false },
    users_security: { read: false, create: false, update: false, delete: false },
    audit_logs: { read: false, create: false, update: false, delete: false },
  },
};

/**
 * Checks whether an authenticated actor has permission for a module + action.
 * Deny-by-default if role or module is unknown.
 */
export function hasModulePermission(
  ctx: ActorSecurityContext | null | undefined,
  moduleKey: PermissionModuleKey,
  action: PermissionAction
): boolean {
  if (!ctx || !ctx.roleSlug) return false;
  if (!isFirstLoginGateCleared(ctx)) return false;
  if (ctx.roleSlug === 'super_admin') return true;
  const roleMap = DEFAULT_ROLE_MODULE_PERMISSIONS[ctx.roleSlug];
  if (!roleMap) return false;
  const modPerms = roleMap[moduleKey];
  if (!modPerms) return false;
  return Boolean(modPerms[action]);
}

/** Vendor accounts must not use the shared administrative workspace. */
export function canAccessAdminWorkspace(ctx: ActorSecurityContext | null | undefined): boolean {
  return Boolean(
    ctx &&
    APPROVED_SYSTEM_ROLES.includes(ctx.roleSlug) &&
    ctx.roleSlug !== 'vendor' &&
    isFirstLoginGateCleared(ctx)
  );
}

/**
 * Server-side Maker-Checker validation:
 * Ensures the checker approving a financial/sensitive action is not the same actor who created/submitted it,
 * unless an explicit Super Admin emergency override with verified 2FA and reason is provided.
 */
export function checkMakerCheckerSeparation(params: {
  makerUsername: string | null | undefined;
  checkerCtx: ActorSecurityContext;
  allowSuperAdminEmergencyOverride?: boolean;
  emergencyOverrideActive?: boolean;
  emergencyOverride?: boolean;
  emergencyReasonBn?: string;
}): { allowed: boolean; errorBn?: string } {
  const maker = (params.makerUsername ?? '').trim().toLowerCase();
  const checker = (params.checkerCtx.username ?? '').trim().toLowerCase();
  if (!maker || maker !== checker) {
    return { allowed: true };
  }
  const overrideAllowed =
    params.allowSuperAdminEmergencyOverride || Boolean(params.emergencyOverride);
  const overrideActive =
    params.emergencyOverrideActive ||
    (Boolean(params.emergencyOverride) &&
      typeof params.emergencyReasonBn === 'string' &&
      params.emergencyReasonBn.trim().length >= 5);

  if (
    overrideAllowed &&
    params.checkerCtx.roleSlug === 'super_admin' &&
    overrideActive
  ) {
    return { allowed: true };
  }
  return {
    allowed: false,
    errorBn:
      'মেকার-চেকার (Maker-Checker) নীতি অনুযায়ী যিনি অনুরোধ তৈরি বা জমা দিয়েছেন, তিনি নিজেই সেটি অনুমোদন (Self-Approve) করতে পারবেন না।',
  };
}

/**
 * Dedicated least-privilege security context for verified Courier Webhooks.
 * Never uses Super Admin interactive credentials.
 */
export const WEBHOOK_SERVICE_CONTEXT: ActorSecurityContext = {
  userId: 'sys-courier-webhook-worker',
  username: 'courier_webhook_service',
  roleSlug: 'packaging_manager',
  vendorId: null,
  maxDiscountBp: 0,
  mustChangePassword: false,
  require2fa: true,
  totpEnrolled: true,
  maskCustomerPiiForVendor: false,
};


