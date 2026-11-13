// src/lib/admin/phase4a-service.ts
// Server-Side Admin ERP Service (Phase 4A):
//   - Module P: Strict Username + Password + TOTP 2FA Authentication, 5-Attempt Lockout, & First-Login Gate
//   - Roles & Permissions: 4 Core Roles + Custom Roles + Field-Level Hiding + Cross-Vendor 404 Isolation
//   - Module M: Today Operational Command Screen & Customer Phone Fraud/History Lookup
//   - Module A & N: Smart Order Entry + Orders Grid One-Click & Bulk Action System + Immutable Audit Log

import crypto from 'node:crypto';
import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import { hasDurableRuntimeContext } from '../db/runtime-persistence';
import { reconcileOrderReservationRecords, executeOrderStateTransition } from '../inventory/phase3-inventory-order-engine';
import type {
  CourierProvider,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../types/database.types';
import type {
  NextBestActionCode,
  OrderGridRowDTO,
  Poisha,
} from '../../types/domain';
import {
  APPROVED_SYSTEM_ROLES,
  assertVendorOwnershipOr404,
  hasModulePermission,
  isFirstLoginGateCleared,
  sanitizeRecordForRole,
  type ActorSecurityContext,
  type ModulePermissionRule,
  type PermissionModuleKey,
  type SystemRoleSlug,
} from '../../types/permissions';
import {
  createStorefrontOrder,
  readErpState,
  reviewManualBkashSubmission,
  writeErpState,
  type InternalOrderLineRecord,
  type InternalProductRecord,
} from '../db/repository';
import {
  buildTotpSetupUri,
  decryptSecretAtRest,
  deriveSeededUserTotpSecret,
  encryptSecretAtRest,
  generateRecoveryBackupCodes,
  generateTotpCode,
  generateUniqueTotpSecret,
  hashPassword,
  revokeAllUserSessions,
  verifyPassword,
  verifyTotpWithReplayGuard,
} from '../security/crypto-session';
import {
  getDistrictById,
  getUpazilaById,
} from '../geo/bd-geocode';
import {
  calculateAutoNetProfit,
} from '../money';
import {
  calculateOrderRiskScore,
  evaluateAddressQuality,
  normalizeBdPhone,
  type CreateOrderInput,
} from '../validators';

export interface AdminUserAccount {
  userId: string;
  username: string;
  internalEmailAlias: string;
  displayNameBn: string;
  displayNameEn: string;
  roleSlug: SystemRoleSlug;
  vendorId: string | null;
  passwordHash: string; // Salted scrypt hash (never plaintext)
  temporaryPasswordExpiresAt?: string | null;
  mustChangePassword: boolean;
  totpEnrolled: boolean;
  require2fa: boolean;
  totpSecretEncrypted: string; // AES-256-GCM encrypted Base32 secret at rest
  lastUsedTotpStep?: number | null;
  backupCodeHashes?: string[];
  maxDiscountBp: number;
  maskCustomerPiiForVendor: boolean;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntilIso: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SanitizedAdminUserDTO {
  userId: string;
  username: string;
  internalEmailAlias: string;
  displayNameBn: string;
  displayNameEn: string;
  roleSlug: SystemRoleSlug;
  vendorId: string | null;
  mustChangePassword: boolean;
  totpEnrolled: boolean;
  require2fa: boolean;
  maxDiscountBp: number;
  maskCustomerPiiForVendor: boolean;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntilIso: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDefinitionRecord {
  roleSlug: SystemRoleSlug;
  nameBn: string;
  nameEn: string;
  isSystem: boolean;
  require2fa: boolean;
  maxDiscountBp: number;
  maskCustomerPiiForVendor: boolean;
  permissions: Record<PermissionModuleKey, ModulePermissionRule>;
}

export interface ImmutableAuditLogRecord {
  id: string;
  actorUserId: string;
  actorUsername: string;
  actorRole: string;
  actionCode: string;
  targetType: 'order' | 'user' | 'role' | 'product' | 'system';
  targetId: string;
  summaryBn: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ConfirmationCallStatus =
  | 'pending'
  | 'confirmed_yes'
  | 'not_answered_busy'
  | 'cancelled_no'
  | 'call_back_requested';

export interface OrderCallAndNoteMeta {
  orderNo: string;
  callAttempts: number;
  lastCalledAt: string | null;
  callStatus?: ConfirmationCallStatus;
  callStatusNote?: string;
  internalStaffNote: string;
  addressOverrideReason: string | null;
}

interface AdminPersistentStore {
  users: AdminUserAccount[];
  roles: RoleDefinitionRecord[];
  auditLogs: ImmutableAuditLogRecord[];
  orderMeta: Record<string, OrderCallAndNoteMeta>;
  blacklistedPhones: Record<string, string>; // phone -> reasonBn
}

const ADMIN_DATA_DIR = path.join(process.cwd(), '.data');
const ADMIN_DATA_FILE = path.join(ADMIN_DATA_DIR, 'erp-admin-store.json');

const ALL_MODULES: PermissionModuleKey[] = [
  'today_screen',
  'orders',
  'print_engine',
  'couriers',
  'vendors',
  'vendor_ledger',
  'payouts',
  'catalog',
  'inventory',
  'finance',
  'expenses',
  'promos',
  'messaging',
  'automation',
  'google_sync',
  'settings_control_center',
  'users_security',
  'audit_logs',
];

function buildDefaultRolePermissions(
  roleSlug: SystemRoleSlug
): Record<PermissionModuleKey, ModulePermissionRule> {
  const matrix = {} as Record<PermissionModuleKey, ModulePermissionRule>;

  for (const mod of ALL_MODULES) {
    if (roleSlug === 'super_admin') {
      matrix[mod] = {
        moduleKey: mod,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: mod !== 'audit_logs' && mod !== 'vendor_ledger',
        allowedFields: ['*'],
        hiddenFields: [],
        maskedFields: [],
      };
    } else if (roleSlug === 'vendor') {
      const vendorAllowedMods: PermissionModuleKey[] = [
        'today_screen',
        'orders',
        'vendors',
        'vendor_ledger',
        'payouts',
        'catalog',
        'inventory',
      ];
      const canAccess = vendorAllowedMods.includes(mod);
      matrix[mod] = {
        moduleKey: mod,
        canRead: canAccess,
        canCreate: mod === 'payouts',
        canUpdate: mod === 'vendors',
        canDelete: false,
        allowedFields: ['*'],
        hiddenFields: [
          'platformMarginPoisha',
          'estimatedNetProfitPoisha',
          'internalStaffNote',
        ],
        maskedFields: ['customerPhone', 'streetAddress'],
      };
    } else if (roleSlug === 'marketing_manager') {
      const mktAllowedMods: PermissionModuleKey[] = [
        'today_screen',
        'orders',
        'catalog',
        'expenses',
        'promos',
        'messaging',
      ];
      const canAccess = mktAllowedMods.includes(mod);
      matrix[mod] = {
        moduleKey: mod,
        canRead: canAccess,
        canCreate:
          mod === 'orders' || mod === 'expenses' || mod === 'messaging',
        canUpdate: mod === 'orders',
        canDelete: false,
        allowedFields: ['*'],
        hiddenFields: [
          'supplierCostPoisha',
          'snapTotalSupplierPayablePoisha',
          'platformMarginPoisha',
          'estimatedNetProfitPoisha',
        ],
        maskedFields: [],
      };
    } else {
      // packaging_manager or custom
      const pkgAllowedMods: PermissionModuleKey[] = [
        'today_screen',
        'orders',
        'print_engine',
        'couriers',
        'catalog',
        'inventory',
      ];
      const canAccess = pkgAllowedMods.includes(mod);
      matrix[mod] = {
        moduleKey: mod,
        canRead: canAccess,
        canCreate: mod === 'couriers' || mod === 'inventory',
        canUpdate:
          mod === 'orders' ||
          mod === 'print_engine' ||
          mod === 'couriers' ||
          mod === 'inventory',
        canDelete: false,
        allowedFields: ['*'],
        hiddenFields: [
          'supplierCostPoisha',
          'platformMarginPoisha',
          'estimatedNetProfitPoisha',
        ],
        maskedFields: [],
      };
    }
  }

  return matrix;
}

function getInitialAdminStore(): AdminPersistentStore {
  const sandboxBootstrap = (role: 'ADMIN' | 'VENDOR', userId: string, testPassword: string) => {
    if (process.env.NODE_ENV === 'production') throw new Error('Sandbox identity cannot be seeded in production.');
    const password = process.env[`PANCHAGARH_SANDBOX_${role}_PASSWORD`];
    if (process.env.NODE_ENV === 'test') {
      // Legacy test fixtures are ONLY available in the isolated NODE_ENV=test runner.
      return { passwordHash: hashPassword(testPassword), totpSecretEncrypted: encryptSecretAtRest(deriveSeededUserTotpSecret(userId)), firstLogin: false };
    }
    if (!password || password.length < 24) throw new Error('Sandbox bootstrap credentials are required before creating accounts.');
    return { passwordHash: hashPassword(password), totpSecretEncrypted: encryptSecretAtRest(generateUniqueTotpSecret()), firstLogin: true };
  };
  const adminBootstrap = sandboxBootstrap('ADMIN', 'usr-super-admin', 'Admin#2026');
  const vendorBootstrap = sandboxBootstrap('VENDOR', 'usr-vendor-001', 'Vendor#2026');
  const roles: RoleDefinitionRecord[] = [
    {
      roleSlug: 'super_admin',
      nameBn: 'সুপার অ্যাডমিন (Super Admin)',
      nameEn: 'Super Admin',
      isSystem: true,
      require2fa: true,
      maxDiscountBp: 5000, // 50%
      maskCustomerPiiForVendor: false,
      permissions: buildDefaultRolePermissions('super_admin'),
    },
    {
      roleSlug: 'vendor',
      nameBn: 'সাপ্লায়ার / ভেন্ডর (Vendor)',
      nameEn: 'Vendor / Supplier',
      isSystem: true,
      require2fa: true,
      maxDiscountBp: 0,
      maskCustomerPiiForVendor: true,
      permissions: buildDefaultRolePermissions('vendor'),
    },
    {
      roleSlug: 'marketing_manager',
      nameBn: 'মার্কেটিং ম্যানেজার (Marketing)',
      nameEn: 'Marketing Manager',
      isSystem: true,
      require2fa: true,
      maxDiscountBp: 1500, // Max 15% discount without approval
      maskCustomerPiiForVendor: false,
      permissions: buildDefaultRolePermissions('marketing_manager'),
    },
    {
      roleSlug: 'packaging_manager',
      nameBn: 'সাপ্লাই ও প্যাকেজিং ম্যানেজার (Packaging)',
      nameEn: 'Supply & Packaging Manager',
      isSystem: true,
      require2fa: true,
      maxDiscountBp: 0,
      maskCustomerPiiForVendor: false,
      permissions: buildDefaultRolePermissions('packaging_manager'),
    },
  ];

  const users: AdminUserAccount[] = [
    {
      userId: 'usr-super-admin',
      username: 'admin',
      internalEmailAlias: 'admin@internal.bongoconsign.local',
      displayNameBn: 'মুনতাসির শিহাব (সুপার অ্যাডমিন)',
      displayNameEn: 'Muntasir Shihab (Super Admin)',
      roleSlug: 'super_admin',
      vendorId: null,
      passwordHash: adminBootstrap.passwordHash,
      mustChangePassword: adminBootstrap.firstLogin,
      totpEnrolled: !adminBootstrap.firstLogin,
      require2fa: true,
      totpSecretEncrypted: adminBootstrap.totpSecretEncrypted,
      lastUsedTotpStep: null,
      backupCodeHashes: generateRecoveryBackupCodes(4).codeHashes,
      maxDiscountBp: 5000,
      maskCustomerPiiForVendor: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntilIso: null,
      lastLoginAt: '2026-11-06T08:00:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      userId: 'usr-vendor-001',
      username: 'rupganj_vendor',
      internalEmailAlias: 'rupganj_vendor@internal.bongoconsign.local',
      displayNameBn: 'রূপগঞ্জ উইভার্স (VND-001)',
      displayNameEn: 'Rupganj Weavers (VND-001)',
      roleSlug: 'vendor',
      vendorId: '00000000-0000-4000-8000-000000000901',
      passwordHash: vendorBootstrap.passwordHash,
      mustChangePassword: vendorBootstrap.firstLogin,
      totpEnrolled: !vendorBootstrap.firstLogin,
      require2fa: true,
      totpSecretEncrypted: vendorBootstrap.totpSecretEncrypted,
      lastUsedTotpStep: null,
      backupCodeHashes: generateRecoveryBackupCodes(4).codeHashes,
      maxDiscountBp: 0,
      maskCustomerPiiForVendor: true,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntilIso: null,
      lastLoginAt: '2026-11-06T07:30:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      userId: 'usr-marketing-01',
      username: 'marketing_lead',
      internalEmailAlias: 'marketing_lead@internal.bongoconsign.local',
      displayNameBn: 'ফারহানা রহমান (মার্কেটিং)',
      displayNameEn: 'Farhana Rahman (Marketing)',
      roleSlug: 'marketing_manager',
      vendorId: null,
      passwordHash: hashPassword('Market#2026'),
      mustChangePassword: false,
      totpEnrolled: true,
      require2fa: true,
      totpSecretEncrypted: encryptSecretAtRest(
        deriveSeededUserTotpSecret('usr-marketing-01')
      ),
      lastUsedTotpStep: null,
      backupCodeHashes: generateRecoveryBackupCodes(4).codeHashes,
      maxDiscountBp: 1500,
      maskCustomerPiiForVendor: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntilIso: null,
      lastLoginAt: '2026-11-06T07:45:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      userId: 'usr-packaging-01',
      username: 'packing_lead',
      internalEmailAlias: 'packing_lead@internal.bongoconsign.local',
      displayNameBn: 'কামরুল ইসলাম (প্যাকেজিং ও কিউসি)',
      displayNameEn: 'Kamrul Islam (Packaging & QC)',
      roleSlug: 'packaging_manager',
      vendorId: null,
      passwordHash: hashPassword('Pack#2026'),
      mustChangePassword: false,
      totpEnrolled: true,
      require2fa: true,
      totpSecretEncrypted: encryptSecretAtRest(
        deriveSeededUserTotpSecret('usr-packaging-01')
      ),
      lastUsedTotpStep: null,
      backupCodeHashes: generateRecoveryBackupCodes(4).codeHashes,
      maxDiscountBp: 0,
      maskCustomerPiiForVendor: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntilIso: null,
      lastLoginAt: '2026-11-06T07:50:00.000Z',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      userId: 'usr-first-login-demo',
      username: 'new_staff',
      internalEmailAlias: 'new_staff@internal.bongoconsign.local',
      displayNameBn: 'সাব্বির হোসেন (নতুন স্টাফ — First Login Gate)',
      displayNameEn: 'Sabbir Hossain (First-Login Gate Demo)',
      roleSlug: 'marketing_manager',
      vendorId: null,
      passwordHash: hashPassword('Temp#2026'),
      mustChangePassword: true,
      totpEnrolled: false,
      require2fa: true,
      totpSecretEncrypted: encryptSecretAtRest(
        deriveSeededUserTotpSecret('usr-first-login-demo')
      ),
      lastUsedTotpStep: null,
      backupCodeHashes: generateRecoveryBackupCodes(4).codeHashes,
      maxDiscountBp: 1000,
      maskCustomerPiiForVendor: false,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntilIso: null,
      lastLoginAt: null,
      createdAt: '2026-11-06T05:00:00.000Z',
    },
  ];

  const auditLogs: ImmutableAuditLogRecord[] = [
    {
      id: 'aud-initial-1',
      actorUserId: 'usr-super-admin',
      actorUsername: 'admin',
      actorRole: 'super_admin',
      actionCode: 'SYSTEM_BOOTSTRAPPED',
      targetType: 'system',
      targetId: 'bongoconsign-erp',
      summaryBn:
        'কনসাইনমেন্ট ইআরপি সিকিউরিটি, ৪টি মূল রোল এবং ২এফএ গেট সক্রিয় করা হয়েছে।',
      metadata: { rlsEnforced: true, appendOnlyLedger: true },
      createdAt: '2026-11-06T06:00:00.000Z',
    },
  ];

  return {
    // Legacy demonstration accounts must never be activated by a local dev boot.
    // NODE_ENV=test retains the old synthetic fixtures for existing regression tests.
    users: process.env.NODE_ENV === 'test' ? users : users.filter((user) =>
      user.userId === 'usr-super-admin' || user.userId === 'usr-vendor-001'),
    roles,
    auditLogs,
    orderMeta: {
      'ORD-261106-0001': {
        orderNo: 'ORD-261106-0001',
        callAttempts: 1,
        lastCalledAt: '2026-11-06T06:45:00.000Z',
        internalStaffNote: 'গ্রাহক ফোনে অর্ডার কনফার্ম করেছেন, দ্রুত প্যাকিং করুন।',
        addressOverrideReason: null,
      },
      'ORD-261106-0002': {
        orderNo: 'ORD-261106-0002',
        callAttempts: 0,
        lastCalledAt: null,
        internalStaffNote: 'বিকাশ TrxID যাচাই করে কল দিতে হবে।',
        addressOverrideReason: null,
      },
    },
    blacklistedPhones: {
      '01799998888': 'পরপর ৩টি পার্সেল ডেলিভারি ম্যানের কাছ থেকে রিসিভ না করে ফেরত দিয়েছেন।',
    },
  };
}

export function readAdminStore(): AdminPersistentStore {
  if (!hasDurableRuntimeContext() && (process.env.NODE_ENV === 'production' || (process.env.NODE_ENV !== 'test' && process.env.PANCHAGARH_ENABLE_SANDBOX_AUTH !== '1'))) throw new Error('ADMIN_IDENTITY_NOT_INTEGRATED: local sandbox identity is disabled.');
  try {
    const parsed = readLocalJsonStore<AdminPersistentStore>(ADMIN_DATA_FILE, {
      arrays: ['users', 'roles', 'auditLogs'], objects: ['orderMeta', 'blacklistedPhones'],
    });
    if (parsed) {
      // Generating demo password hashes on every identity read is expensive and
      // must never replace an existing malformed identity registry with defaults.
      if (!Array.isArray(parsed.users) || !Array.isArray(parsed.roles) ||
          !Array.isArray(parsed.auditLogs) || !parsed.orderMeta || !parsed.blacklistedPhones) {
        throw new Error('Invalid admin identity registry.');
      }
      const rawUsers = parsed.users;
      let migratedSecrets = false;

      const sanitizedUsers: AdminUserAccount[] = rawUsers.map((u) => {
        const legacy = u as unknown as Record<string, unknown>;
        let passwordHash =
          typeof u.passwordHash === 'string' && u.passwordHash.startsWith('scrypt$')
            ? u.passwordHash
            : '';
        if (!passwordHash) {
          if (process.env.NODE_ENV !== 'test') throw new Error('Legacy plaintext identity cannot be auto-migrated in a sandbox.');
          const legacyPlain =
            typeof legacy.passwordPlainDemo === 'string'
              ? legacy.passwordPlainDemo
              : 'Admin#2026';
          passwordHash = hashPassword(legacyPlain);
          migratedSecrets = true;
        }

        let totpSecretEncrypted =
          typeof u.totpSecretEncrypted === 'string' &&
          u.totpSecretEncrypted.startsWith('enc:v1:')
            ? u.totpSecretEncrypted
            : '';
        if (!totpSecretEncrypted) {
          if (process.env.NODE_ENV !== 'test') throw new Error('Missing TOTP secret cannot be auto-generated for an existing account.');
          const uniqueBase32 = deriveSeededUserTotpSecret(u.userId);
          totpSecretEncrypted = encryptSecretAtRest(uniqueBase32);
          migratedSecrets = true;
        }

        if ('passwordPlainDemo' in legacy || 'totpSecretDemo' in legacy) {
          migratedSecrets = true;
        }

        return {
          userId: u.userId,
          username: u.username,
          internalEmailAlias: u.internalEmailAlias,
          displayNameBn: u.displayNameBn,
          displayNameEn: u.displayNameEn,
          roleSlug: u.roleSlug,
          vendorId: u.vendorId,
          passwordHash,
          temporaryPasswordExpiresAt: u.temporaryPasswordExpiresAt ?? null,
          mustChangePassword: Boolean(u.mustChangePassword),
          totpEnrolled: Boolean(u.totpEnrolled),
          require2fa: u.require2fa ?? true,
          totpSecretEncrypted,
          lastUsedTotpStep: u.lastUsedTotpStep ?? null,
          backupCodeHashes: Array.isArray(u.backupCodeHashes)
            ? u.backupCodeHashes
            : [],
          maxDiscountBp: u.maxDiscountBp ?? 0,
          maskCustomerPiiForVendor: Boolean(u.maskCustomerPiiForVendor),
          isActive: u.isActive ?? true,
          failedLoginAttempts: u.failedLoginAttempts ?? 0,
          lockedUntilIso: u.lockedUntilIso ?? null,
          lastLoginAt: u.lastLoginAt ?? null,
          createdAt: u.createdAt ?? new Date().toISOString(),
        };
      });

      const store: AdminPersistentStore = {
        users: sanitizedUsers,
        roles: parsed.roles,
        auditLogs: parsed.auditLogs,
        orderMeta: parsed.orderMeta,
        blacklistedPhones: parsed.blacklistedPhones,
      };

      if (migratedSecrets) {
        writeAdminStore(store);
      }
      return store;
    }
  } catch {
    throw new Error('Admin identity store is unavailable.');
  }

  const initial = getInitialAdminStore();
  writeAdminStore(initial);
  return initial;
}

export function writeAdminStore(store: AdminPersistentStore): void {
  writeLocalJsonStore(ADMIN_DATA_FILE, store);
}

function sanitizeUserAccount(u: AdminUserAccount): SanitizedAdminUserDTO {
  return {
    userId: u.userId,
    username: u.username,
    internalEmailAlias: u.internalEmailAlias,
    displayNameBn: u.displayNameBn,
    displayNameEn: u.displayNameEn,
    roleSlug: u.roleSlug,
    vendorId: u.vendorId,
    mustChangePassword: u.mustChangePassword,
    totpEnrolled: u.totpEnrolled,
    require2fa: u.require2fa,
    maxDiscountBp: u.maxDiscountBp,
    maskCustomerPiiForVendor: u.maskCustomerPiiForVendor,
    isActive: u.isActive,
    failedLoginAttempts: u.failedLoginAttempts,
    lockedUntilIso: u.lockedUntilIso,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function appendImmutableAuditLog(
  store: AdminPersistentStore,
  entry: Omit<ImmutableAuditLogRecord, 'id' | 'createdAt'>
): ImmutableAuditLogRecord {
  const record: ImmutableAuditLogRecord = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  // Append-only: unshift for newest-first display, never mutate or delete existing items
  store.auditLogs.unshift(record);
  return record;
}

export function deriveNextBestAction(order: OrderGridRowDTO): NextBestActionCode {
  if (order.status === 'cancelled' || order.status === 'returned') {
    return 'COMPLETED';
  }
  if (order.status === 'return_initiated') {
    return 'PROCESS_PENDING_RETURN';
  }
  if (order.addressQualityScore < 70) {
    return 'FIX_ADDRESS';
  }
  if (
    order.paymentMethod === 'bkash_manual' &&
    order.paymentStatus === 'partial_verified'
  ) {
    return 'VERIFY_BKASH_TRX';
  }
  if (order.isAdvanceMandatory && order.advancePaidPoisha <= 0) {
    return 'COLLECT_MANDATORY_ADVANCE';
  }
  if (order.status === 'pending_confirmation') {
    return 'CALL_TO_CONFIRM';
  }
  if (order.status === 'confirmed') {
    return 'READY_TO_PACK';
  }
  if (order.status === 'packed') {
    return order.trackingCode ? 'HANDOVER_TO_COURIER' : 'READY_TO_BOOK_COURIER';
  }
  if (order.status === 'shipped' || order.status === 'out_for_delivery') {
    return 'AWAITING_COD_REMITTANCE';
  }
  if (
    order.status === 'delivered' &&
    order.paymentStatus !== 'paid_verified' &&
    order.paymentStatus !== 'remitted'
  ) {
    return 'AWAITING_COD_REMITTANCE';
  }
  return 'COMPLETED';
}

/**
 * Helper to generate the current genuine RFC 6238 6-digit TOTP code for a user.
 * Used by automated tests and local sandbox verification.
 */
export function getCurrentTotpCodeForUser(
  userIdOrUsername: string,
  timestampMs: number = Date.now()
): string {
  const store = readAdminStore();
  const clean = userIdOrUsername.trim().toLowerCase();
  const user = store.users.find(
    (u) => u.userId.toLowerCase() === clean || u.username.toLowerCase() === clean
  );
  const base32 = user
    ? decryptSecretAtRest(user.totpSecretEncrypted)
    : deriveSeededUserTotpSecret(userIdOrUsername);
  return generateTotpCode(base32, timestampMs);
}

/**
 * Verifies a user's RFC 6238 TOTP code (or recovery backup code) with replay protection.
 */
export function verifyAdminActorTotp(
  userIdOrUsername: string,
  totpCode: string,
  options?: { enforceReplayGuard?: boolean; timestampMs?: number }
): { valid: boolean; reasonBn?: string } {
  const store = readAdminStore();
  const clean = userIdOrUsername.trim().toLowerCase();
  const user = store.users.find(
    (u) => u.userId.toLowerCase() === clean || u.username.toLowerCase() === clean
  );
  if (!user) {
    return { valid: false, reasonBn: 'ইউজার খুঁজে পাওয়া যায়নি।' };
  }
  const base32 = decryptSecretAtRest(user.totpSecretEncrypted);
  const enforceReplay = options?.enforceReplayGuard ?? false;
  const check = verifyTotpWithReplayGuard({
    base32Secret: base32,
    token: totpCode,
    lastUsedStep: enforceReplay ? user.lastUsedTotpStep : null,
    backupCodeHashes: user.backupCodeHashes,
    timestampMs: options?.timestampMs,
  });

  if (!check.valid) {
    return { valid: false, reasonBn: check.reasonBn };
  }

  if (check.usedBackupCodeHash && user.backupCodeHashes) {
    user.backupCodeHashes = user.backupCodeHashes.filter(
      (h) => h !== check.usedBackupCodeHash
    );
    writeAdminStore(store);
  } else if (enforceReplay && check.matchedStep !== undefined) {
    user.lastUsedTotpStep = check.matchedStep;
    writeAdminStore(store);
  }

  return { valid: true };
}

/**
 * Module P: Strict Username + Password + RFC 6238 TOTP 2FA Login with 5-attempt 30-min lockout.
 */
export function authenticateAdminUser(input: {
  username: string;
  password: string;
  totpCode?: string;
  enforceTotpReplayGuard?: boolean;
  timestampMs?: number;
}): {
  success: boolean;
  requiresFirstLoginGate?: boolean;
  errorBn?: string;
  user?: SanitizedAdminUserDTO;
  totpSetupUri?: string;
} {
  const store = readAdminStore();
  const cleanUsername = input.username.trim().toLowerCase();
  const user = store.users.find((u) => u.username.toLowerCase() === cleanUsername);

  if (!user || !user.isActive) {
    return {
      success: false,
      errorBn: 'ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।',
    };
  }

  if (user.temporaryPasswordExpiresAt && Date.parse(user.temporaryPasswordExpiresAt) <= Date.now()) {
    return { success: false, errorBn: 'টেম্পোরারি পাসওয়ার্ডের মেয়াদ শেষ। অ্যাডমিনের সঙ্গে যোগাযোগ করুন।' };
  }

  // Check 30-minute lockout
  if (user.lockedUntilIso) {
    const lockedUntilMs = new Date(user.lockedUntilIso).getTime();
    if (Date.now() < lockedUntilMs) {
      const remainingMins = Math.ceil((lockedUntilMs - Date.now()) / 60000);
      return {
        success: false,
        errorBn: `পরপর ৫ বার ভুল চেষ্টার কারণে অ্যাকাউন্টটি সাময়িকভাবে লক করা হয়েছে। ${remainingMins} মিনিট পর আবার চেষ্টা করুন।`,
      };
    }
    user.lockedUntilIso = null;
    user.failedLoginAttempts = 0;
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      appendImmutableAuditLog(store, {
        actorUserId: user.userId,
        actorUsername: user.username,
        actorRole: user.roleSlug,
        actionCode: 'AUTH_ACCOUNT_LOCKED_5_ATTEMPTS',
        targetType: 'user',
        targetId: user.userId,
        summaryBn: `${user.username} পরপর ৫ বার ভুল পাসওয়ার্ড দেওয়ায় ৩০ মিনিটের জন্য লক হয়েছে।`,
        metadata: { attempts: user.failedLoginAttempts },
      });
    }
    writeAdminStore(store);
    return {
      success: false,
      errorBn: `পাসওয়ার্ড সঠিক নয় (ব্যর্থ চেষ্টা: ${user.failedLoginAttempts}/৫)।`,
    };
  }

  const base32Secret = decryptSecretAtRest(user.totpSecretEncrypted);

  // Check First-Login Gate (Password change + 2FA enrollment)
  if (user.mustChangePassword || (user.require2fa && !user.totpEnrolled)) {
    user.failedLoginAttempts = 0;
    writeAdminStore(store);
    return {
      success: true,
      requiresFirstLoginGate: true,
      user: sanitizeUserAccount(user),
      totpSetupUri: user.totpEnrolled ? undefined : buildTotpSetupUri(user.username, base32Secret),
    };
  }

  // Verify RFC 6238 TOTP 2FA if enrolled & required
  if (user.require2fa && user.totpEnrolled) {
    const totpCheck = verifyTotpWithReplayGuard({
      base32Secret,
      token: input.totpCode ?? '',
      lastUsedStep: input.enforceTotpReplayGuard === false ? null : user.lastUsedTotpStep,
      backupCodeHashes: user.backupCodeHashes,
      timestampMs: input.timestampMs,
    });
    if (!totpCheck.valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) user.lockedUntilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      writeAdminStore(store);
      return {
        success: false,
        errorBn:
          totpCheck.reasonBn ??
          'সঠিক ৬ সংখ্যার Google Authenticator TOTP কোড দিন।',
      };
    }
    if (totpCheck.usedBackupCodeHash && user.backupCodeHashes) {
      user.backupCodeHashes = user.backupCodeHashes.filter(
        (h) => h !== totpCheck.usedBackupCodeHash
      );
    } else if (totpCheck.matchedStep !== undefined) {
      user.lastUsedTotpStep = totpCheck.matchedStep;
    }
  }

  user.failedLoginAttempts = 0;
  user.lockedUntilIso = null;
  user.lastLoginAt = new Date().toISOString();

  appendImmutableAuditLog(store, {
    actorUserId: user.userId,
    actorUsername: user.username,
    actorRole: user.roleSlug,
    actionCode: 'AUTH_LOGIN_SUCCESS',
    targetType: 'user',
    targetId: user.userId,
    summaryBn: `${user.username} (${user.roleSlug}) সফলভাবে লগইন করেছেন।`,
    metadata: {},
  });

  writeAdminStore(store);
  return {
    success: true,
    requiresFirstLoginGate: false,
    user: sanitizeUserAccount(user),
  };
}

/**
 * Completes First-Login Gate (rotates temporary password & enrolls 6-digit RFC 6238 TOTP 2FA).
 */
export function completeFirstLoginGate(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  totpCode: string;
  timestampMs?: number;
}): {
  success: boolean;
  errorBn?: string;
  user?: SanitizedAdminUserDTO;
  recoveryBackupCodes?: string[];
} {
  const store = readAdminStore();
  const user = store.users.find((u) => u.userId === input.userId);
  if (!user || !user.isActive || (!user.mustChangePassword && user.totpEnrolled) ||
      (user.lockedUntilIso && Date.parse(user.lockedUntilIso) > Date.now()) ||
      (user.temporaryPasswordExpiresAt && Date.parse(user.temporaryPasswordExpiresAt) <= Date.now())) {
    return { success: false, errorBn: 'ইউজার খুঁজে পাওয়া যায়নি।' };
  }

  if (!verifyPassword(input.currentPassword, user.passwordHash)) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) user.lockedUntilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    writeAdminStore(store);
    return { success: false, errorBn: 'বর্তমান টেম্পোরারি পাসওয়ার্ড সঠিক নয়।' };
  }

  if (
    input.newPassword.trim().length < 8 ||
    input.newPassword === input.currentPassword
  ) {
    return {
      success: false,
      errorBn:
        'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং আগের পাসওয়ার্ডের সমান হতে পারবে না।',
    };
  }

  const base32Secret = decryptSecretAtRest(user.totpSecretEncrypted);
  const totpCheck = verifyTotpWithReplayGuard({
    base32Secret,
    token: input.totpCode,
    lastUsedStep: user.lastUsedTotpStep,
    backupCodeHashes: user.backupCodeHashes,
    timestampMs: input.timestampMs,
  });

  if (!totpCheck.valid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) user.lockedUntilIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    writeAdminStore(store);
    return {
      success: false,
      errorBn:
        totpCheck.reasonBn ??
        '৬ সংখ্যার TOTP যাচাই কোড সঠিক নয়। অথেনটিকেটর অ্যাপে প্রদর্শিত বর্তমান কোডটি দিন।',
    };
  }

  const backupGen = generateRecoveryBackupCodes(6);
  user.passwordHash = hashPassword(input.newPassword);
  user.temporaryPasswordExpiresAt = null;
  user.mustChangePassword = false;
  user.totpEnrolled = true;
  user.lastUsedTotpStep = totpCheck.matchedStep ?? null;
  user.backupCodeHashes = backupGen.codeHashes;
  user.lastLoginAt = new Date().toISOString();

  // Revoke any old sessions on password rotation / 2FA enrollment
  revokeAllUserSessions(user.userId);

  appendImmutableAuditLog(store, {
    actorUserId: user.userId,
    actorUsername: user.username,
    actorRole: user.roleSlug,
    actionCode: 'FIRST_LOGIN_GATE_COMPLETED',
    targetType: 'user',
    targetId: user.userId,
    summaryBn: `${user.username} প্রথম লগইনে পাসওয়ার্ড পরিবর্তন ও TOTP 2FA এনরোলমেন্ট সম্পন্ন করেছেন।`,
    metadata: { totpEnrolled: true },
  });

  writeAdminStore(store);
  return {
    success: true,
    user: sanitizeUserAccount(user),
    recoveryBackupCodes: backupGen.plainCodes,
  };
}

export function getActorSecurityContext(
  userId: string
): ActorSecurityContext | null {
  const store = readAdminStore();
  const user = store.users.find((u) => u.userId === userId && u.isActive);
  if (!user) return null;

  return {
    userId: user.userId,
    username: user.username,
    roleSlug: user.roleSlug,
    vendorId: user.vendorId,
    mustChangePassword: user.mustChangePassword,
    totpEnrolled: user.totpEnrolled,
    require2fa: user.require2fa,
    maxDiscountBp: user.maxDiscountBp,
    maskCustomerPiiForVendor: user.maskCustomerPiiForVendor,
  };
}

/**
 * Returns a role-filtered and field-sanitized Order DTO for the Admin Grid.
 * Cross-vendor access throws 404.
 */
export function getSanitizedOrdersForActor(
  ctx: ActorSecurityContext
): Array<
  Partial<OrderGridRowDTO> & {
    callAttempts: number;
    callStatus?: ConfirmationCallStatus;
    callStatusNote?: string;
    internalStaffNote?: string;
    items?: Array<{
      productId: string;
      variantId: string;
      productNameBn: string;
      variantTitleBn: string;
      publicSku: string;
      quantity: number;
      unitSalePricePoisha: Poisha;
      lineSubtotalPoisha: Poisha;
    }>;
  }
> {
  const erpState = readErpState();
  const adminStore = readAdminStore();

  const filteredOrders = erpState.orders.filter((ord) => {
    if (ctx.roleSlug === 'vendor') {
      const orderLinesForOrder = erpState.orderLines.filter(
        (l) => l.orderId === ord.id
      );
      return orderLinesForOrder.some((l) => l.vendorId === ctx.vendorId);
    }
    return true;
  });

  return filteredOrders.map((ord) => {
    const meta = adminStore.orderMeta[ord.orderNo] ?? {
      orderNo: ord.orderNo,
      callAttempts: 0,
      lastCalledAt: null,
      callStatus: 'pending' as ConfirmationCallStatus,
      callStatusNote: '',
      internalStaffNote: '',
      addressOverrideReason: null,
    };

    const rawLines = erpState.orderLines.filter((l) => l.orderId === ord.id);
    const orderItems = rawLines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      productNameBn: l.productNameBn,
      variantTitleBn: l.variantTitleBn,
      publicSku: l.publicSku,
      quantity: l.quantity,
      unitSalePricePoisha: l.snapUnitSalePricePoisha,
      lineSubtotalPoisha: l.lineSubtotalPoisha,
    }));

    const computedNextAction = deriveNextBestAction(ord);
    const enriched: Record<string, unknown> = {
      ...ord,
      nextBestAction: computedNextAction,
      callAttempts: meta.callAttempts,
      callStatus: meta.callStatus ?? 'pending',
      callStatusNote: meta.callStatusNote ?? '',
      internalStaffNote: meta.internalStaffNote,
      items: orderItems,
    };

    const sanitized = sanitizeRecordForRole(enriched, ctx.roleSlug, {
      maskVendorCustomerPii: ctx.maskCustomerPiiForVendor,
    });

    return sanitized as Partial<OrderGridRowDTO> & {
      callAttempts: number;
      callStatus?: ConfirmationCallStatus;
      callStatusNote?: string;
      internalStaffNote?: string;
      items?: Array<{
        productId: string;
        variantId: string;
        productNameBn: string;
        variantTitleBn: string;
        publicSku: string;
        quantity: number;
        unitSalePricePoisha: Poisha;
        lineSubtotalPoisha: Poisha;
      }>;
    };
  });
}

/**
 * Verifies single order access by orderNo for Actor.
 * Throws 404 on cross-vendor access!
 */
export function getSingleOrderForActorOr404(
  ctx: ActorSecurityContext,
  orderNo: string
): Partial<OrderGridRowDTO> {
  const erpState = readErpState();
  const ord = erpState.orders.find(
    (o) => o.orderNo.toUpperCase() === orderNo.trim().toUpperCase()
  );
  if (!ord) {
    const err = new Error('Order not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  if (ctx.roleSlug === 'vendor') {
    const lines = erpState.orderLines.filter((l) => l.orderId === ord.id);
    const matchingLine = lines.find((l) => l.vendorId === ctx.vendorId);
    if (!matchingLine) {
      assertVendorOwnershipOr404(ctx, 'other-vendor-id');
    }
  }

  return sanitizeRecordForRole(
    ord as unknown as Record<string, unknown>,
    ctx.roleSlug,
    { maskVendorCustomerPii: ctx.maskCustomerPiiForVendor }
  ) as Partial<OrderGridRowDTO>;
}

/**
 * Returns full Phase 4A Workspace Snapshot for an authenticated & 2FA-cleared user.
 */
export function getAdminWorkspaceSnapshot(userId: string): {
  authorized: boolean;
  requiresFirstLoginGate?: boolean;
  errorBn?: string;
  currentUser?: SanitizedAdminUserDTO;
  activeRole?: RoleDefinitionRecord;
  orders?: Array<
    Partial<OrderGridRowDTO> & {
      callAttempts: number;
      callStatus?: ConfirmationCallStatus;
      callStatusNote?: string;
      internalStaffNote?: string;
      items?: Array<{
        productId: string;
        variantId: string;
        productNameBn: string;
        variantTitleBn: string;
        publicSku: string;
        quantity: number;
        unitSalePricePoisha: Poisha;
        lineSubtotalPoisha: Poisha;
      }>;
    }
  >;
  products?: Array<Partial<InternalProductRecord>>;
  users?: SanitizedAdminUserDTO[];
  roles?: RoleDefinitionRecord[];
  auditLogs?: ImmutableAuditLogRecord[];
  todayQueues?: {
    callToConfirmCount: number;
    fixAddressCount: number;
    verifyBkashCount: number;
    readyToPackCount: number;
    readyToBookCourierCount: number;
    awaitingCodRemittanceCount: number;
    lowStockVariantsCount: number;
  };
} {
  const adminStore = readAdminStore();
  const user = adminStore.users.find((u) => u.userId === userId && u.isActive);
  if (!user) {
    return { authorized: false, errorBn: 'লগইন সেশন পাওয়া যায়নি।' };
  }

  const ctx = getActorSecurityContext(userId)!;
  if (!isFirstLoginGateCleared(ctx)) {
    return {
      authorized: false,
      requiresFirstLoginGate: true,
      currentUser: sanitizeUserAccount(user),
      errorBn: 'প্রথম লগইন পাসওয়ার্ড পরিবর্তন ও TOTP 2FA সম্পন্ন করা বাধ্যতামূলক।',
    };
  }

  const erpState = readErpState();
  const activeRole =
    adminStore.roles.find((r) => r.roleSlug === user.roleSlug) ??
    adminStore.roles[0]!;

  const sanitizedOrders = getSanitizedOrdersForActor(ctx);

  const visibleProducts = erpState.products
    .filter((p) => (ctx.roleSlug === 'vendor' ? p.vendorId === ctx.vendorId : true))
    .map((p) => {
      const sanitizedProd = sanitizeRecordForRole(
        p as unknown as Record<string, unknown>,
        ctx.roleSlug
      ) as Partial<InternalProductRecord>;
      if (sanitizedProd.variants) {
        sanitizedProd.variants = sanitizedProd.variants.map(
          (v) =>
            sanitizeRecordForRole(
              v as unknown as Record<string, unknown>,
              ctx.roleSlug
            ) as unknown as InternalProductRecord['variants'][number]
        );
      }
      return sanitizedProd;
    });

  let lowStockVariantsCount = 0;
  for (const prod of visibleProducts) {
    for (const v of prod.variants ?? []) {
      if (v.stockAvailable <= (prod.lowStockThreshold ?? 5)) {
        lowStockVariantsCount += 1;
      }
    }
  }

  const todayQueues = {
    callToConfirmCount: sanitizedOrders.filter(
      (o) => o.nextBestAction === 'CALL_TO_CONFIRM'
    ).length,
    fixAddressCount: sanitizedOrders.filter(
      (o) => o.nextBestAction === 'FIX_ADDRESS'
    ).length,
    verifyBkashCount: sanitizedOrders.filter(
      (o) => o.nextBestAction === 'VERIFY_BKASH_TRX'
    ).length,
    readyToPackCount: sanitizedOrders.filter(
      (o) => o.nextBestAction === 'READY_TO_PACK'
    ).length,
    readyToBookCourierCount: sanitizedOrders.filter(
      (o) => o.nextBestAction === 'READY_TO_BOOK_COURIER'
    ).length,
    awaitingCodRemittanceCount: sanitizedOrders.filter(
      (o) => o.nextBestAction === 'AWAITING_COD_REMITTANCE'
    ).length,
    lowStockVariantsCount,
  };

  return {
    authorized: true,
    currentUser: sanitizeUserAccount(user),
    activeRole,
    orders: sanitizedOrders,
    products: visibleProducts,
    users:
      ctx.roleSlug === 'super_admin'
        ? adminStore.users.map(sanitizeUserAccount)
        : [sanitizeUserAccount(user)],
    roles: adminStore.roles,
    auditLogs:
      ctx.roleSlug === 'super_admin'
        ? adminStore.auditLogs.slice(0, 100)
        : [],
    todayQueues,
  };
}

/**
 * Module A & H: Customer Phone Fraud/History & 24h Duplicate Lookup at Order Entry
 */
export function lookupCustomerHistoryByPhone(
  ctx: ActorSecurityContext,
  rawPhone: string
): {
  validPhone: boolean;
  normalizedPhone: string | null;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  activeUnfinishedOrders: number;
  isBlacklisted: boolean;
  blacklistReasonBn: string | null;
  hasDuplicateWithin24h: boolean;
  recentOrderNos: string[];
} {
  const norm = normalizeBdPhone(rawPhone);
  if (!norm) {
    return {
      validPhone: false,
      normalizedPhone: null,
      totalOrders: 0,
      deliveredOrders: 0,
      returnedOrders: 0,
      activeUnfinishedOrders: 0,
      isBlacklisted: false,
      blacklistReasonBn: null,
      hasDuplicateWithin24h: false,
      recentOrderNos: [],
    };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();
  const matching = erpState.orders.filter((o) => o.customerPhone === norm);
  const nowMs = Date.now();

  const hasDuplicateWithin24h = matching.some((o) => {
    const createdMs = new Date(o.createdAt).getTime();
    return (
      o.status !== 'cancelled' &&
      nowMs - createdMs <= 24 * 60 * 60 * 1000
    );
  });

  const blacklistReasonBn = adminStore.blacklistedPhones[norm] ?? null;

  return {
    validPhone: true,
    normalizedPhone: norm,
    totalOrders: matching.length,
    deliveredOrders: matching.filter((o) => o.status === 'delivered').length,
    returnedOrders: matching.filter((o) => o.status === 'returned').length,
    activeUnfinishedOrders: matching.filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    ).length,
    isBlacklisted: Boolean(blacklistReasonBn),
    blacklistReasonBn,
    hasDuplicateWithin24h,
    recentOrderNos: matching.slice(0, 5).map((o) => o.orderNo),
  };
}

/**
 * Module A: Smart Order Entry by Staff (with Duplicate Override & Role Discount Limit Check)
 */
export function createSmartAdminOrder(
  ctx: ActorSecurityContext,
  input: CreateOrderInput & {
    duplicateOverrideReason?: string;
    customDiscountPoisha?: Poisha;
  }
): {
  success: boolean;
  errorBn?: string;
  orderNo?: string;
} {
  if (!isFirstLoginGateCleared(ctx)) {
    return {
      success: false,
      errorBn: 'অর্ডার এন্ট্রির আগে প্রথম লগইন পাসওয়ার্ড ও 2FA সম্পন্ন করুন।',
    };
  }

  const history = lookupCustomerHistoryByPhone(ctx, input.customerPhone);
  if (
    history.hasDuplicateWithin24h &&
    (!input.duplicateOverrideReason ||
      input.duplicateOverrideReason.trim().length < 4)
  ) {
    return {
      success: false,
      errorBn:
        'ডুপ্লিকেট অর্ডার গার্ড: এই নম্বরে গত ২৪ ঘণ্টায় একটি সক্রিয় অর্ডার রয়েছে। অর্ডার নিতে হলে ওভাররাইড কারণ (Override Reason) লিখুন।',
    };
  }

  const created = createStorefrontOrder(input);
  if (!created.success || !created.order) {
    return {
      success: false,
      errorBn: created.errorBn ?? 'অর্ডার তৈরি করতে সমস্যা হয়েছে।',
    };
  }

  const adminStore = readAdminStore();
  adminStore.orderMeta[created.order.orderNo] = {
    orderNo: created.order.orderNo,
    callAttempts: 0,
    lastCalledAt: null,
    internalStaffNote: input.internalStaffNote ?? '',
    addressOverrideReason: input.duplicateOverrideReason ?? null,
  };

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'SMART_ORDER_CREATED',
    targetType: 'order',
    targetId: created.order.orderNo,
    summaryBn: `${ctx.username} নতুন অর্ডার ${created.order.orderNo} (${input.source}) এন্ট্রি করেছেন।`,
    metadata: {
      source: input.source,
      duplicateOverrideReason: input.duplicateOverrideReason ?? null,
    },
  });

  writeAdminStore(adminStore);
  return {
    success: true,
    orderNo: created.order.orderNo,
  };
}

/**
 * Module N: Orders Grid Row & Bulk One-Click Actions
 */
export function executeOrderGridAction(
  ctx: ActorSecurityContext,
  payload: {
    orderNos: string[];
    actionType:
      | 'update_status'
      | 'fix_address'
      | 'verify_bkash'
      | 'book_courier'
      | 'log_call_attempt'
      | 'log_call_status'
      | 'add_staff_note';
    newStatus?: OrderStatus;
    courierProvider?: CourierProvider;
    callStatus?: ConfirmationCallStatus;
    callStatusNote?: string;
    streetAddress?: string;
    landmark?: string;
    addressOverrideReason?: string;
    staffNote?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  results: Array<{ orderNo: string; ok: boolean; messageBn: string }>;
} {
  if (!isFirstLoginGateCleared(ctx)) {
    return {
      success: false,
      errorBn: 'প্রথম লগইন পাসওয়ার্ড ও 2FA সম্পন্ন না করে অ্যাকশন নেওয়া যাবে না।',
      results: [],
    };
  }

  if (ctx.roleSlug === 'vendor' || !hasModulePermission(ctx, 'orders', 'update')) {
    return { success: false, errorBn: 'এই অর্ডার অ্যাকশন করার অনুমতি নেই।', results: [] };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();
  const results: Array<{ orderNo: string; ok: boolean; messageBn: string }> = [];

  for (const orderNo of payload.orderNos) {
    let ord = erpState.orders.find(
      (o) => o.orderNo.toUpperCase() === orderNo.trim().toUpperCase()
    );
    if (!ord) {
      results.push({
        orderNo,
        ok: false,
        messageBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।',
      });
      continue;
    }

    const meta = adminStore.orderMeta[ord.orderNo] ?? {
      orderNo: ord.orderNo,
      callAttempts: 0,
      lastCalledAt: null,
      internalStaffNote: '',
      addressOverrideReason: null,
    };

    const selectedOrderNo = ord.orderNo;
    const transition = (toState: OrderStatus): { success: boolean; errorBn?: string } => {
      if (!ord) return { success: false };
      writeErpState(erpState);
      writeAdminStore(adminStore);
      const result = executeOrderStateTransition({ orderNo: ord.orderNo, toState,
        actorUsername: ctx.username, actorRole: ctx.roleSlug,
        idempotencyKey: `grid:${ctx.userId}:${ord.orderNo}:${ord.status}:${toState}`,
        reasonBn: payload.staffNote?.trim() || payload.callStatusNote?.trim() || 'অনুমোদিত অর্ডার কার্যক্রম',
      });
      Object.assign(erpState, readErpState());
      Object.assign(adminStore, readAdminStore());
      ord = erpState.orders.find(order => order.orderNo === selectedOrderNo)!;
      return result;
    };

    if (payload.actionType === 'update_status' && payload.newStatus) {
      const prevStatus = ord.status;
      const changed = transition(payload.newStatus);
      if (!changed.success) { results.push({ orderNo: ord.orderNo, ok: false, messageBn: changed.errorBn || 'অবস্থা পরিবর্তন করা যায়নি।' }); continue; }
      ord.nextBestAction = deriveNextBestAction(ord);

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'ORDER_STATUS_CHANGED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারের স্ট্যাটাস ${prevStatus} থেকে ${payload.newStatus}-এ পরিবর্তন করা হয়েছে।`,
        metadata: { prevStatus, newStatus: payload.newStatus },
      });

      results.push({
        orderNo: ord.orderNo,
        ok: true,
        messageBn: `স্ট্যাটাস ${payload.newStatus}-এ আপডেট হয়েছে।`,
      });
    } else if (payload.actionType === 'fix_address') {
      if (payload.streetAddress) {
        ord.streetAddress = payload.streetAddress.trim();
      }
      if (typeof payload.landmark === 'string') {
        ord.landmark = payload.landmark.trim();
      }
      const quality = evaluateAddressQuality({
        districtId: ord.districtId,
        upazilaId: ord.upazilaId,
        streetAddress: ord.streetAddress,
        landmark: ord.landmark,
        customerPhone: ord.customerPhone,
      });
      ord.addressQualityScore = quality.score;
      ord.addressFlags = quality.flags;
      ord.nextBestAction = deriveNextBestAction(ord);

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'ORDER_ADDRESS_UPDATED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারের ঠিকানা আপডেট করা হয়েছে (স্কোর: ${quality.score}%)।`,
        metadata: { score: quality.score },
      });

      results.push({
        orderNo: ord.orderNo,
        ok: true,
        messageBn: `ঠিকানা আপডেট সম্পন্ন (কোয়ালিটি স্কোর: ${quality.score}%)।`,
      });
    } else if (payload.actionType === 'verify_bkash') {
      if (!payload.staffNote?.trim()) { results.push({ orderNo: ord.orderNo, ok: false, messageBn: 'পেমেন্ট যাচাইয়ের প্রমাণ ও নোট লিখুন।' }); continue; }
      writeErpState(erpState);
      writeAdminStore(adminStore);
      const reviewRes = reviewManualBkashSubmission(ctx, {
        orderNo: ord.orderNo,
        decision: 'approved',
        reviewNoteBn: payload.staffNote.trim(),
      });
      if (!reviewRes.success) {
        results.push({
          orderNo: ord.orderNo,
          ok: false,
          messageBn:
            reviewRes.errorBn ?? 'বিকাশ পেমেন্ট ভেরিফাই করা যায়নি।',
        });
        continue;
      }

      // Sync updated order state after reviewManualBkashSubmission
      const refreshedErp = readErpState();
      Object.assign(erpState, refreshedErp);
      Object.assign(adminStore, readAdminStore());
      ord = erpState.orders.find(order => order.orderNo === selectedOrderNo)!;
      const refreshedOrd = refreshedErp.orders.find(
        (o) => o.orderNo === selectedOrderNo
      );
      if (refreshedOrd) {
        ord.advancePaidPoisha = refreshedOrd.advancePaidPoisha;
        ord.codCollectablePoisha = refreshedOrd.codCollectablePoisha;
        ord.paymentStatus = refreshedOrd.paymentStatus;
      } else {
        ord.paymentStatus = 'paid_verified';
      }
      ord.nextBestAction = deriveNextBestAction(ord);

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'MANUAL_BKASH_VERIFIED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারের বিকাশ TrxID (${ord.manualPaymentTrxId ?? 'N/A'}) মেকার-চেকার নিয়মে ভেরিফাই করা হয়েছে।`,
        metadata: {
          trxId: ord.manualPaymentTrxId,
          advancePaidPoisha: ord.advancePaidPoisha,
          codCollectablePoisha: ord.codCollectablePoisha,
        },
      });

      results.push({
        orderNo: ord.orderNo,
        ok: true,
        messageBn: 'বিকাশ পেমেন্ট ভেরিফাইড মার্ক করা হয়েছে।',
      });
    } else if (payload.actionType === 'book_courier') {
      results.push({ orderNo: ord.orderNo, ok: false, messageBn: 'যাচাইকৃত adapter বা প্রকৃত বুকিং রেফারেন্স ছাড়া কুরিয়ার বুকিং করা যাবে না।' });
    } else if (payload.actionType === 'log_call_attempt') {
      meta.callAttempts += 1;
      meta.lastCalledAt = new Date().toISOString();
      if (payload.staffNote) {
        meta.internalStaffNote = payload.staffNote.trim();
      }
      adminStore.orderMeta[ord.orderNo] = meta;

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'ORDER_CALL_LOGGED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারে কনফার্মেশন কল রেকর্ড করা হয়েছে (মোট কল: ${meta.callAttempts})।`,
        metadata: { callAttempts: meta.callAttempts },
      });

      results.push({
        orderNo: ord.orderNo,
        ok: true,
        messageBn: `কল লগ আপডেট হয়েছে (মোট চেষ্টা: ${meta.callAttempts})।`,
      });
    } else if (payload.actionType === 'add_staff_note') {
      meta.internalStaffNote = (payload.staffNote ?? '').trim();
      adminStore.orderMeta[ord.orderNo] = meta;

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'ORDER_STAFF_NOTE_UPDATED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারে স্টাফ নোট যুক্ত করা হয়েছে।`,
        metadata: {},
      });

      results.push({
        orderNo: ord.orderNo,
        ok: true,
        messageBn: 'স্টাফ নোট সংরক্ষিত হয়েছে।',
      });
    } else if (payload.actionType === 'log_call_status') {
      meta.callAttempts += 1;
      meta.lastCalledAt = new Date().toISOString();
      const statusOutcome = payload.callStatus ?? 'confirmed_yes';
      meta.callStatus = statusOutcome;
      if (payload.callStatusNote) {
        meta.callStatusNote = payload.callStatusNote.trim();
      }
      if (payload.staffNote) {
        meta.internalStaffNote = payload.staffNote.trim();
      }

      let outcomeMessageBn = '';
      if (statusOutcome === 'confirmed_yes') {
        if (ord.status === 'pending_confirmation') {
          const result = transition('confirmed');
          if (!result.success) { results.push({ orderNo: ord.orderNo, ok: false, messageBn: result.errorBn || 'অর্ডার নিশ্চিত করা যায়নি।' }); continue; }
        }
        ord.nextBestAction = deriveNextBestAction(ord);
        outcomeMessageBn = 'কল কনফার্মড: অর্ডার নিশ্চিত করা হয়েছে (Confirmed)';
      } else if (statusOutcome === 'cancelled_no') {
        const result = transition('cancelled');
        if (!result.success) { results.push({ orderNo: ord.orderNo, ok: false, messageBn: result.errorBn || 'অর্ডার বাতিল করা যায়নি।' }); continue; }
        ord.nextBestAction = deriveNextBestAction(ord);
        outcomeMessageBn = 'কল বাতিল: গ্রাহকের অনুরোধে অর্ডার বাতিল করা হয়েছে (Cancelled)';
      } else if (statusOutcome === 'not_answered_busy') {
        outcomeMessageBn = `কল রিসিভ হয়নি / ব্যস্ত (মোট কল চেষ্টা: ${meta.callAttempts})`;
      } else {
        outcomeMessageBn = 'পরে কল করার অনুরোধ লগ করা হয়েছে (Call Back Later)';
      }

      adminStore.orderMeta[ord.orderNo] = meta;

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'ORDER_CALL_STATUS_LOGGED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারে কল ফলাফল রেকর্ড করা হয়েছে: ${statusOutcome} (${outcomeMessageBn})।`,
        metadata: {
          callStatus: statusOutcome,
          callAttempts: meta.callAttempts,
          note: payload.callStatusNote ?? null,
        },
      });

      results.push({
        orderNo: ord.orderNo,
        ok: true,
        messageBn: outcomeMessageBn,
      });
    }
  }

  writeErpState(erpState);
  writeAdminStore(adminStore);

  return {
    success: results.every((r) => r.ok),
    results,
  };
}

/**
 * Module N: Comprehensive Order & Financial Editor (Admin Master Edit)
 * Allows editing all customer fields, item quantities/pricing, discounts, delivery fees,
 * advance payments, courier assignments & tracking IDs with zero-float integer poisha math.
 */
export interface UpdateFullOrderPayload {
  orderNo: string;
  customerName: string;
  customerPhone: string;
  districtId: number;
  upazilaId: number;
  streetAddress: string;
  landmark?: string;
  items?: Array<{
    productId?: string;
    variantId: string;
    quantity: number;
    unitSalePricePoisha?: Poisha;
  }>;
  discountPoisha: Poisha;
  deliveryChargePoisha: Poisha;
  advancePaidPoisha: Poisha;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  manualPaymentTrxId?: string | null;
  courierProvider: CourierProvider;
  consignmentId?: string | null;
  trackingCode?: string | null;
  status: OrderStatus;
  source: OrderSource;
  callStatus?: ConfirmationCallStatus;
  callStatusNote?: string;
  internalStaffNote?: string;
  addressOverrideReason?: string;
}

export function updateFullOrderDetails(
  ctx: ActorSecurityContext,
  payload: UpdateFullOrderPayload
): {
  success: boolean;
  errorBn?: string;
  order?: Partial<OrderGridRowDTO>;
} {
  if (!isFirstLoginGateCleared(ctx)) {
    return {
      success: false,
      errorBn: 'প্রথম লগইন পাসওয়ার্ড ও 2FA সম্পন্ন না করে অর্ডার এডিট করা যাবে না।',
    };
  }

  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধু সুপার অ্যাডমিন সম্পূর্ণ অর্ডার বা আর্থিক তথ্য এডিট করতে পারেন।',
    };
  }

  const normPhone = normalizeBdPhone(payload.customerPhone);
  if (!normPhone) {
    return {
      success: false,
      errorBn:
        'গ্রাহকের ফোন নম্বরটি সঠিক নয়। ১১ ডিজিটের সঠিক বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 01712345678)।',
    };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();

  const ord = erpState.orders.find(
    (o) => o.orderNo.toUpperCase() === payload.orderNo.trim().toUpperCase()
  );
  if (!ord) {
    return {
      success: false,
      errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।',
    };
  }

  if (!['pending_confirmation', 'confirmed'].includes(ord.status) || ord.paymentStatus !== 'unpaid' || ord.advancePaidPoisha > 0) {
    return { success: false, errorBn: 'প্যাকিং, পেমেন্ট বা শিপমেন্টের পরে পূর্ণ অর্ডার এডিট বন্ধ। নির্দিষ্ট সংশোধন ও রিভার্সাল প্রক্রিয়া ব্যবহার করুন।' };
  }
  if (payload.status !== ord.status || payload.paymentStatus !== ord.paymentStatus ||
      payload.advancePaidPoisha !== ord.advancePaidPoisha ||
      (payload.manualPaymentTrxId?.trim() || null) !== (ord.manualPaymentTrxId || null) ||
      (payload.consignmentId?.trim() || null) !== (ord.consignmentId || null) ||
      (payload.trackingCode?.trim() || null) !== (ord.trackingCode || null) ||
      (payload.callStatus && payload.callStatus !== (adminStore.orderMeta[ord.orderNo]?.callStatus ?? 'pending'))) {
    return { success: false, errorBn: 'অর্ডার, পেমেন্ট ও শিপমেন্টের অবস্থা বদলাতে নির্দিষ্ট ওয়ার্কফ্লো ব্যবহার করুন।' };
  }
  if (!['cod', 'bkash_manual'].includes(payload.paymentMethod) ||
      !['manual', 'pathao', 'steadfast', 'bd_post'].includes(payload.courierProvider) ||
      ![payload.discountPoisha, payload.deliveryChargePoisha, payload.advancePaidPoisha].every(value => Number.isSafeInteger(value) && value >= 0) ||
      (payload.items && (payload.items.length === 0 || new Set(payload.items.map(item => item.variantId)).size !== payload.items.length))) {
    return { success: false, errorBn: 'সঠিক পূর্ণসংখ্যা পয়সা, স্বতন্ত্র ভ্যারিয়েন্ট ও অনুমোদিত পদ্ধতি নির্বাচন করুন।' };
  }
  const previousLines = erpState.orderLines.filter(line => line.orderId === ord.id).map(line => ({ ...line }));
  if (!previousLines.length) return { success: false, errorBn: 'ঐতিহাসিক অর্ডার লাইন নেই। সমন্বয় ছাড়া এডিট করা যাবে না।' };

  const prevSnapshot = {
    customerName: ord.customerName,
    customerPhone: ord.customerPhone,
    districtId: ord.districtId,
    upazilaId: ord.upazilaId,
    streetAddress: ord.streetAddress,
    landmark: ord.landmark,
    subtotalPoisha: ord.subtotalPoisha,
    discountPoisha: ord.discountPoisha,
    deliveryChargePoisha: ord.deliveryChargePoisha,
    totalPayablePoisha: ord.totalPayablePoisha,
    advancePaidPoisha: ord.advancePaidPoisha,
    codCollectablePoisha: ord.codCollectablePoisha,
    paymentMethod: ord.paymentMethod,
    paymentStatus: ord.paymentStatus,
    manualPaymentTrxId: ord.manualPaymentTrxId,
    courierProvider: ord.courierProvider,
    consignmentId: ord.consignmentId,
    trackingCode: ord.trackingCode,
    status: ord.status,
    source: ord.source,
    items: previousLines,
  };

  // 1. Handle items & quantities
  let subtotalPoisha = ord.subtotalPoisha;
  let snapTotalSupplierPayablePoisha = ord.snapTotalSupplierPayablePoisha ?? 0;

  if (payload.items && payload.items.length > 0) {
    const newOrderLines: InternalOrderLineRecord[] = [];
    let calculatedSubtotal: Poisha = 0;
    let calculatedSupplierPayable: Poisha = 0;

    for (const itemInput of payload.items) {
      if (!Number.isSafeInteger(itemInput.quantity) || itemInput.quantity < 1) {
        return { success: false, errorBn: 'পণ্যের পরিমাণ কমপক্ষে ১টি পূর্ণসংখ্যা হতে হবে।' };
      }

      const matchedProd = erpState.products.find((p) =>
        p.variants.some((v) => v.variantId === itemInput.variantId)
      );
      const matchedVar = matchedProd?.variants.find(
        (v) => v.variantId === itemInput.variantId
      );

      if (!matchedProd || !matchedVar) {
        return { success: false, errorBn: 'নির্বাচিত ভ্যারিয়েন্ট পাওয়া যায়নি। বিকল্প পণ্য স্বয়ংক্রিয়ভাবে বসানো যাবে না।' };
      }

      if (matchedProd && matchedVar) {
        const previousLine = erpState.orderLines.find((line) => line.orderId === ord.id && line.variantId === itemInput.variantId);
        const unitCost = previousLine?.snapSupplierCostPoisha ?? matchedVar.supplierCostPoisha;
        const unitProfit = previousLine?.snapSupplierProfitPoisha ?? matchedVar.supplierProfitPoisha;
        const unitPayable = previousLine?.snapSupplierPayablePoisha ?? matchedVar.supplierPayablePoisha;
        const unitPrice = itemInput.unitSalePricePoisha ?? previousLine?.snapUnitSalePricePoisha ?? matchedVar.salePricePoisha;
        const unitMargin = unitPrice - unitPayable;
        if (![unitCost, unitProfit, unitPayable, unitPrice, unitMargin, itemInput.quantity].every(Number.isSafeInteger) ||
            itemInput.quantity <= 0 || unitMargin < 0 || unitCost + unitProfit !== unitPayable) {
          return { success: false, errorBn: 'সঠিক পূর্ণসংখ্যা পয়সা, পরিমাণ এবং সাপ্লায়ার প্রদেয় অক্ষুণ্ণ থাকা আবশ্যক।' };
        }
        const lineSubtotal = unitPrice * itemInput.quantity;
        const lineSupplierPayable =
          unitPayable * itemInput.quantity;
        const lineNetMargin = unitMargin * itemInput.quantity;
        if (![lineSubtotal, lineSupplierPayable, lineNetMargin, calculatedSubtotal + lineSubtotal,
          calculatedSupplierPayable + lineSupplierPayable].every(Number.isSafeInteger)) {
          return { success: false, errorBn: 'অর্ডারের অর্থের পরিমাণ নিরাপদ পূর্ণসংখ্যা সীমার বাইরে।' };
        }

        calculatedSubtotal += lineSubtotal;
        calculatedSupplierPayable += lineSupplierPayable;

        newOrderLines.push({
          orderId: ord.id,
          productId: matchedProd.productId,
          variantId: matchedVar.variantId,
          vendorId: previousLine?.vendorId ?? matchedProd.vendorId,
          productNameBn: previousLine?.productNameBn ?? matchedProd.nameBn,
          productNameEn: previousLine ? previousLine.productNameEn : matchedProd.nameEn,
          variantTitleBn: previousLine?.variantTitleBn ?? matchedVar.titleBn,
          variantTitleEn: previousLine ? previousLine.variantTitleEn : matchedVar.titleEn,
          publicSku: previousLine?.publicSku ?? matchedVar.publicSku,
          internalVendorSku: previousLine?.internalVendorSku ?? matchedVar.internalVendorSku,
          quantity: itemInput.quantity,
          weightGrams: previousLine?.weightGrams ?? matchedVar.weightGrams,
          snapSupplierCostPoisha: unitCost,
          snapSupplierProfitPoisha: unitProfit,
          snapSupplierPayablePoisha: unitPayable,
          snapPlatformMarginPoisha: unitMargin,
          snapUnitSalePricePoisha: unitPrice,
          lineSubtotalPoisha: lineSubtotal,
          lineDiscountPoisha: 0,
          lineNetPlatformMarginPoisha: lineNetMargin,
        });
      }
    }

    if (newOrderLines.length > 0) {
      erpState.orderLines = erpState.orderLines.filter(
        (l) => l.orderId !== ord.id
      );
      erpState.orderLines.push(...newOrderLines);
      subtotalPoisha = calculatedSubtotal;
      snapTotalSupplierPayablePoisha = calculatedSupplierPayable;
    }
  }

  // 2. Strict Zero-Float Money Math (Rule A1)
  const discountPoisha = payload.discountPoisha;
  const deliveryChargePoisha = payload.deliveryChargePoisha;
  const totalPayablePoisha = subtotalPoisha - discountPoisha + deliveryChargePoisha;
  const advancePaidPoisha = payload.advancePaidPoisha;
  if (discountPoisha > subtotalPoisha - snapTotalSupplierPayablePoisha ||
      !Number.isSafeInteger(totalPayablePoisha) || totalPayablePoisha < advancePaidPoisha) {
    return { success: false, errorBn: 'ডিসকাউন্ট প্ল্যাটফর্ম মার্জিনের বেশি হতে পারবে না।' };
  }
  let remainingDiscount = discountPoisha;
  const amendedLines = erpState.orderLines.filter(line => line.orderId === ord.id);
  for (const line of amendedLines) {
    const margin = line.snapPlatformMarginPoisha * line.quantity;
    line.lineDiscountPoisha = Math.min(remainingDiscount, margin);
    line.lineNetPlatformMarginPoisha = margin - line.lineDiscountPoisha;
    remainingDiscount -= line.lineDiscountPoisha;
  }
  for (const variantId of new Set([...previousLines, ...amendedLines].map(line => line.variantId))) {
    const beforeQuantity = previousLines.filter(line => line.variantId === variantId).reduce((sum, line) => sum + line.quantity, 0);
    const afterQuantity = amendedLines.filter(line => line.variantId === variantId).reduce((sum, line) => sum + line.quantity, 0);
    const delta = afterQuantity - beforeQuantity;
    const variant = erpState.products.flatMap(product => product.variants).find(item => item.variantId === variantId);
    if (!variant || !Number.isSafeInteger(delta) || variant.stockReserved + delta < 0 ||
        variant.stockAvailable - delta < 0 || variant.stockReserved + delta > variant.stockOnHand) {
      return { success: false, errorBn: 'ইনভেন্টরি মেলেনি বা পর্যাপ্ত স্টক নেই। আগে স্টক সমন্বয় করুন।' };
    }
    variant.stockReserved += delta;
    variant.stockAvailable -= delta;
  }
  const codCollectablePoisha = Math.max(
    0,
    totalPayablePoisha - advancePaidPoisha
  );

  // 3. Address Quality & Risk Score Evaluation
  const dist = getDistrictById(payload.districtId);
  const upz = getUpazilaById(payload.upazilaId);
  const addressQuality = evaluateAddressQuality({
    districtId: payload.districtId,
    upazilaId: payload.upazilaId,
    streetAddress: payload.streetAddress,
    landmark: payload.landmark ?? '',
    customerPhone: normPhone,
  });

  const customerPastOrders = erpState.orders.filter(
    (o) => o.customerPhone === normPhone
  );
  const customerReturnedCount = customerPastOrders.filter(
    (o) => o.status === 'returned' || o.status === 'return_initiated'
  ).length;

  const riskResult = calculateOrderRiskScore({
    customerTotalOrders: customerPastOrders.length,
    customerReturnedOrders: customerReturnedCount,
    isCustomerBlacklisted: false,
    addressQualityScore: addressQuality.score,
    districtSuccessRateBp: 8800,
    totalPayablePoisha,
    source: payload.source,
  });

  const profitCalc = calculateAutoNetProfit({
    grossDeliveredSalesPoisha: subtotalPoisha,
    supplierPayablePoisha: snapTotalSupplierPayablePoisha,
    promoDiscountPoisha: discountPoisha,
    adSpendPoisha: 0,
    packagingCostPoisha: 1500,
    unrecoveredCourierChargePoisha: 0,
    returnLossPoisha: 0,
    damageLossPoisha: 0,
    otherExpensePoisha: 0,
  });

  // 4. Mutate Order Record
  ord.customerName = payload.customerName.trim();
  ord.customerPhone = normPhone;
  ord.districtId = payload.districtId;
  ord.districtNameBn = dist?.name_bn ?? ord.districtNameBn;
  ord.upazilaId = payload.upazilaId;
  ord.upazilaNameBn = upz?.name_bn ?? ord.upazilaNameBn;
  ord.streetAddress = payload.streetAddress.trim();
  ord.landmark = (payload.landmark ?? '').trim();
  ord.addressQualityScore = addressQuality.score;
  ord.addressFlags = addressQuality.flags;
  ord.subtotalPoisha = subtotalPoisha;
  ord.discountPoisha = discountPoisha;
  ord.deliveryChargePoisha = deliveryChargePoisha;
  ord.totalPayablePoisha = totalPayablePoisha;
  ord.advancePaidPoisha = advancePaidPoisha;
  ord.codCollectablePoisha = codCollectablePoisha;
  ord.paymentMethod = payload.paymentMethod;
  ord.paymentStatus = payload.paymentStatus;
  ord.manualPaymentTrxId = payload.manualPaymentTrxId?.trim() || null;
  ord.courierProvider = payload.courierProvider;
  ord.consignmentId = payload.consignmentId?.trim() || null;
  ord.trackingCode = payload.trackingCode?.trim() || null;
  ord.status = payload.status;
  ord.source = payload.source;
  ord.riskScore = riskResult.riskScore;
  ord.estimatedNetProfitPoisha = profitCalc.netProfitPoisha;
  ord.snapTotalSupplierPayablePoisha = snapTotalSupplierPayablePoisha;

  // 5. Update Meta & Call System
  const meta = adminStore.orderMeta[ord.orderNo] ?? {
    orderNo: ord.orderNo,
    callAttempts: 0,
    lastCalledAt: null,
    callStatus: 'pending',
    callStatusNote: '',
    internalStaffNote: '',
    addressOverrideReason: null,
  };

  if (payload.internalStaffNote !== undefined) {
    meta.internalStaffNote = payload.internalStaffNote.trim();
  }
  if (payload.addressOverrideReason !== undefined) {
    meta.addressOverrideReason =
      payload.addressOverrideReason.trim() || null;
  }
  if (payload.callStatus) {
    meta.callStatus = payload.callStatus;
    if (
      payload.callStatus === 'confirmed_yes' &&
      ord.status === 'pending_confirmation'
    ) {
      ord.status = 'confirmed';
    } else if (payload.callStatus === 'cancelled_no') {
      ord.status = 'cancelled';
    }
    if (payload.callStatusNote) {
      meta.callStatusNote = payload.callStatusNote.trim();
    }
  }

  ord.nextBestAction = deriveNextBestAction(ord);
  adminStore.orderMeta[ord.orderNo] = meta;

  // 6. Immutable Audit Log
  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'ORDER_FULL_DETAILS_EDITED',
    targetType: 'order',
    targetId: ord.orderNo,
    summaryBn: `${ctx.username} কর্তৃক ${ord.orderNo} অর্ডারের বিস্তারিত তথ্য ও ডিসকাউন্ট (৳${Math.round(discountPoisha / 100)}) এডিট করা হয়েছে। মোট: ৳${Math.round(totalPayablePoisha / 100)}, সিওডি: ৳${Math.round(codCollectablePoisha / 100)}।`,
    metadata: {
      prev: prevSnapshot,
      new: {
        discountPoisha,
        deliveryChargePoisha,
        totalPayablePoisha,
        codCollectablePoisha,
        status: ord.status,
        courierProvider: ord.courierProvider,
        trackingCode: ord.trackingCode,
        callStatus: meta.callStatus,
        items: amendedLines,
        paymentMethod: ord.paymentMethod,
        paymentStatus: ord.paymentStatus,
        advancePaidPoisha: ord.advancePaidPoisha,
      },
    },
  });

  writeErpState(erpState);
  reconcileOrderReservationRecords(ord.orderNo, ctx.username, previousLines);
  writeAdminStore(adminStore);

  return {
    success: true,
    order: sanitizeRecordForRole(
      ord as unknown as Record<string, unknown>,
      ctx.roleSlug
    ) as Partial<OrderGridRowDTO>,
  };
}

/**
 * Module P: Super Admin Creates New Staff/Vendor User (One-Time Temporary Password)
 */
export function createAdminUserBySuperAdmin(
  ctx: ActorSecurityContext,
  input: {
    username: string;
    displayNameBn: string;
    displayNameEn: string;
    roleSlug: SystemRoleSlug;
    vendorId?: string | null;
    maxDiscountBp?: number;
  }
): {
  success: boolean;
  errorBn?: string;
  user?: SanitizedAdminUserDTO;
  oneTimeTempPassword?: string;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন নতুন ইউজার তৈরি করতে পারবেন।',
    };
  }

  if (!APPROVED_SYSTEM_ROLES.includes(input.roleSlug)) {
    return {
      success: false,
      errorBn:
        'অনুমোদিত ৪টি সিস্টেম রোল (super_admin, vendor, marketing_manager, packaging_manager) ব্যতীত অন্য কোনো রোল অনুমোদিত নয়।',
    };
  }

  const cleanUsername = input.username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (cleanUsername.length < 3) {
    return {
      success: false,
      errorBn: 'ইউজারনেম কমপক্ষে ৩ অক্ষরের (ইংরেজি ছোট হাতের অক্ষর/সংখ্যা) হতে হবে।',
    };
  }

  const store = readAdminStore();
  if (store.users.some((u) => u.username === cleanUsername)) {
    return {
      success: false,
      errorBn: 'এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত হয়েছে।',
    };
  }

  if (input.roleSlug === 'vendor' && !input.vendorId) return { success: false, errorBn: 'ভেন্ডরের পরিচয় আবশ্যক।' };
  const oneTimeTempPassword = `Tmp#${crypto.randomBytes(24).toString('base64url')}`;
  const uniqueTotpSecret = generateUniqueTotpSecret();
  const newUser: AdminUserAccount = {
    userId: `usr-${crypto.randomUUID()}`,
    username: cleanUsername,
    internalEmailAlias: `${cleanUsername}@internal.bongoconsign.local`,
    displayNameBn: input.displayNameBn.trim(),
    displayNameEn: input.displayNameEn.trim() || input.displayNameBn.trim(),
    roleSlug: input.roleSlug,
    vendorId:
      input.roleSlug === 'vendor'
        ? input.vendorId!
        : null,
    passwordHash: hashPassword(oneTimeTempPassword),
    temporaryPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    mustChangePassword: true,
    totpEnrolled: false,
    require2fa: true,
    totpSecretEncrypted: encryptSecretAtRest(uniqueTotpSecret),
    lastUsedTotpStep: null,
    backupCodeHashes: generateRecoveryBackupCodes(6).codeHashes,
    maxDiscountBp: input.maxDiscountBp ?? 0,
    maskCustomerPiiForVendor: input.roleSlug === 'vendor',
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntilIso: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };

  store.users.push(newUser);
  appendImmutableAuditLog(store, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'USER_CREATED_WITH_FIRST_LOGIN_GATE',
    targetType: 'user',
    targetId: newUser.userId,
    summaryBn: `সুপার অ্যাডমিন নতুন ইউজার @${newUser.username} (${newUser.roleSlug}) তৈরি করেছেন।`,
    metadata: { roleSlug: newUser.roleSlug, require2fa: true },
  });

  writeAdminStore(store);
  return {
    success: true,
    user: sanitizeUserAccount(newUser),
    oneTimeTempPassword,
  };
}

/**
 * Module P: Super Admin Resets User Password or 2FA (Requires Admin 2FA Re-Auth)
 */
export function adminResetUserSecurity(
  ctx: ActorSecurityContext,
  input: {
    targetUserId: string;
    action: 'reset_password' | 'reset_2fa' | 'toggle_active';
    adminTotpCode: string;
    timestampMs?: number;
  }
): {
  success: boolean;
  errorBn?: string;
  oneTimeTempPassword?: string;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন এই সিকিউরিটি অ্যাকশন নিতে পারবেন।',
    };
  }

  const adminTotpCheck = verifyAdminActorTotp(ctx.userId, input.adminTotpCode, {
    enforceReplayGuard: true,
    timestampMs: input.timestampMs,
  });
  if (!adminTotpCheck.valid) {
    return {
      success: false,
      errorBn:
        adminTotpCheck.reasonBn ??
        'অ্যাডমিন TOTP 2FA রি-অথেনটিকেশন কোড সঠিক নয়।',
    };
  }

  const store = readAdminStore();
  const target = store.users.find((u) => u.userId === input.targetUserId);
  if (!target) {
    return { success: false, errorBn: 'টার্গেট ইউজার পাওয়া যায়নি।' };
  }

  let tempPass: string | undefined;
  if (input.action === 'reset_password') {
    tempPass = `Rst#${crypto.randomBytes(24).toString('base64url')}`;
    target.passwordHash = hashPassword(tempPass);
    target.temporaryPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    target.mustChangePassword = true;
    target.failedLoginAttempts = 0;
    target.lockedUntilIso = null;
  } else if (input.action === 'reset_2fa') {
    target.totpEnrolled = false;
    target.backupCodeHashes = [];
    target.totpSecretEncrypted = encryptSecretAtRest(generateUniqueTotpSecret());
    target.lastUsedTotpStep = null;
  } else if (input.action === 'toggle_active') {
    target.isActive = !target.isActive;
  }

  // Always revoke all active sessions of the target user when security state changes
  revokeAllUserSessions(target.userId);

  appendImmutableAuditLog(store, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `ADMIN_USER_${input.action.toUpperCase()}`,
    targetType: 'user',
    targetId: target.userId,
    summaryBn: `সুপার অ্যাডমিন @${target.username}-এর ওপর ${input.action} সম্পন্ন করেছেন।`,
    metadata: { action: input.action },
  });

  writeAdminStore(store);
  return {
    success: true,
    oneTimeTempPassword: tempPass,
  };
}

/**
 * Roles & Permissions: Create Custom Role or Update Role Permission Matrix
 */
export function upsertCustomRolePermissionMatrix(
  ctx: ActorSecurityContext,
  input: {
    roleSlug: string;
    nameBn: string;
    nameEn: string;
    maxDiscountBp: number;
    maskCustomerPiiForVendor: boolean;
    moduleUpdates?: Array<{
      moduleKey: PermissionModuleKey;
      canRead: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>;
  }
): {
  success: boolean;
  errorBn?: string;
  role?: RoleDefinitionRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন রোল ও পারমিশন ম্যাট্রিক্স পরিবর্তন করতে পারবেন।',
    };
  }

  const cleanSlug = input.roleSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '') as SystemRoleSlug;
  if (!APPROVED_SYSTEM_ROLES.includes(cleanSlug)) {
    return {
      success: false,
      errorBn:
        'অনুমোদিত ৪টি সিস্টেম রোল (super_admin, vendor, marketing_manager, packaging_manager) ব্যতীত নতুন কোনো ৫ম রোল তৈরি নিষিদ্ধ।',
    };
  }

  const store = readAdminStore();
  const role = store.roles.find((r) => r.roleSlug === cleanSlug);

  if (!role) {
    return {
      success: false,
      errorBn: 'সিস্টেম রোল পাওয়া যায়নি।',
    };
  }

  role.nameBn = input.nameBn.trim() || role.nameBn;
  role.nameEn = input.nameEn.trim() || role.nameEn;
  role.maxDiscountBp = input.maxDiscountBp;
  role.maskCustomerPiiForVendor = input.maskCustomerPiiForVendor;

  if (input.moduleUpdates) {
    for (const upd of input.moduleUpdates) {
      const existing = role.permissions[upd.moduleKey];
      if (existing) {
        role.permissions[upd.moduleKey] = {
          ...existing,
          canRead: upd.canRead,
          canCreate: upd.canCreate,
          canUpdate: upd.canUpdate,
          canDelete:
            upd.moduleKey === 'audit_logs' || upd.moduleKey === 'vendor_ledger'
              ? false
              : upd.canDelete,
        };
      }
    }
  }

  appendImmutableAuditLog(store, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'ROLE_PERMISSION_MATRIX_UPDATED',
    targetType: 'role',
    targetId: role.roleSlug,
    summaryBn: `সুপার অ্যাডমিন "${role.nameBn}" রোলের পারমিশন ম্যাট্রিক্স আপডেট করেছেন।`,
    metadata: { maxDiscountBp: role.maxDiscountBp },
  });

  writeAdminStore(store);
  return { success: true, role };
}
