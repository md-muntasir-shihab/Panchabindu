// app/api/admin/workspace/route.ts
// Server-Side Admin ERP Workspace API (Phase 4A + Phase 4B + Phase 4C):
//   - GET: Role-filtered, field-sanitized workspace snapshot + Phase 4B Print/Courier360/VendorEscrow + Phase 4C Finance/Product360/Automation/ControlCenter
//   - POST: Phase 4A + Phase 4B + Phase 4C operations

import { NextRequest, NextResponse } from 'next/server';
import { canExecuteWorkspaceAction } from '@/src/lib/security/workspace-policy';
import { z } from 'zod';
import {
  adminResetUserSecurity,
  appendImmutableAuditLog,
  createAdminUserBySuperAdmin,
  createSmartAdminOrder,
  executeOrderGridAction,
  getActorSecurityContext,
  getAdminWorkspaceSnapshot,
  lookupCustomerHistoryByPhone,
  readAdminStore,
  updateFullOrderDetails,
  upsertCustomRolePermissionMatrix,
  writeAdminStore,
} from '@/src/lib/admin/phase4a-service';
import {
  auditAndCloseVendorContract,
  autoRecordOrderDeliveredOrReturned,
  computeCourier360Summary,
  confirmBatchHandoverShipped,
  createPickupBatchAndManifest,
  generateOrderPrintSlips,
  getAllDistrictDeliveryRatesWithOverrides,
  getVendorEscrowOverviewForActor,
  processFourWayOrderReturn,
  readPhase4BStore,
  recordCourierRemittanceSettlement,
  requestVendorPayout,
  resolveVendorPayoutRequest,
  submitVendorOnboarding15Q,
  syncAllCourierTrackingStatuses,
  updatePrintTemplateConfig,
  upsertDistrictDeliveryRateOverride,
} from '@/src/lib/admin/phase4b-service';
import {
  addExpenseOrAdSpendEntry,
  computeFinancialMoneyMapAndPnl,
  computeProduct360List,
  executeAutomationRuleSimulation,
  getMaskedCredentialsList,
  readPhase4CStore,
  receiveConsignmentStockWithQc,
  renderOrderMessagePreview,
  runScheduledJobNow,
  saveOrRevokeEncryptedCredential,
  toggleAutomationRuleOrKillSwitch,
  triggerGoogleSheetsOneWaySync,
  updateMessageTemplateAndTrigger,
  updateSiteBrandingAndThresholds,
  upsertCustomerBlacklist,
  upsertPromoCodeRule,
  writePhase4CStore,
  type MessageDispatchLogRecord,
} from '@/src/lib/admin/phase4c-service';
import {
  runConsignmentLifecycleDryRun,
  runPhase5PreLaunchAudit,
  simulateRoleFieldSanitization,
} from '@/src/lib/admin/phase5-service';
import {
  generateSystemBackupSnapshot,
  getPhase6WorkspaceOverview,
  moderateProductReview,
  parseAndReconcileCourierRemittanceCsv,
  processCourierWebhookPayload,
  recordAbandonedCartReminderSent,
  recoverAbandonedCartToOrder,
} from '@/src/lib/admin/phase6-service';
import {
  createLedgerReversalRequest,
  createMarginSafeFlashCampaign,
  executeCustomerRefundWorkflow,
  getPhase7WorkspaceOverview,
  promoteMaturedEscrowEntriesBatch,
  resolveCustomerRefundRequest,
  resolveLedgerReversalRequest,
  resolveVendorPriceProposal,
  reviewConsignmentDispatchLot,
  splitOrderIntoVendorFulfillmentGroups,
  submitConsignmentDispatchLot,
  submitVendorPriceProposal,
  upsertSupplierProductOffer,
} from '@/src/lib/admin/phase7-service';
import {
  deleteAdminProduct,
  readErpState,
  reviewManualBkashSubmission,
  submitManualBkashPayment,
  updateAboutContactPageSettings,
  updateCustomerInquiryStatus,
  upsertAdminCategory,
  upsertAdminProduct,
  sanitizeSiteSettingsForPublic,
} from '@/src/lib/db/repository';
import {
  ADMIN_SESSION_COOKIE_NAME,
  assertJsonBodySize,
  extractAdminSessionTokenFromRequest,
  verifyAdminSessionToken,
  verifyOriginAndCsrf,
} from '@/src/lib/security/crypto-session';
import { createOrderInputSchema, normalizeBdPhone } from '@/src/lib/validators';
import {
  canAccessAdminWorkspace,
  hasModulePermission,
  type PermissionModuleKey,
  type SystemRoleSlug,
} from '@/src/types/permissions';

export async function GET(req: NextRequest) {
  // CRITICAL SECURITY FIX (Phase 1): NEVER default to 'usr-super-admin' when token is missing or invalid!
  const rawToken =
    req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ||
    extractAdminSessionTokenFromRequest(req);
  const session = verifyAdminSessionToken(rawToken);
  if (!session || session.purpose === 'enrollment') {
    return NextResponse.json(
      {
        authorized: false,
        requiresFirstLoginGate: false,
        errorBn: 'অনুগ্রহ করে অ্যাডমিন প্যানেলে লগইন করুন (401 Unauthorized)।',
      },
      { status: 401 }
    );
  }

  const userId = session.userId;
  const actor = getActorSecurityContext(userId);
  if (!canAccessAdminWorkspace(actor)) {
    return NextResponse.json({ authorized: false, errorBn: 'অ্যাডমিন ওয়ার্কস্পেসে প্রবেশের অনুমতি নেই।' }, { status: 403 });
  }
  const snapshot = getAdminWorkspaceSnapshot(userId);
  if (!snapshot.authorized || !snapshot.currentUser) {
    return NextResponse.json(snapshot, { status: 401 });
  }

  const ctx = getActorSecurityContext(userId);
  const p4b = readPhase4BStore();
  const p4c = readPhase4CStore();
  const adminStore = readAdminStore();
  const erpState = readErpState();
  const isVendor = snapshot.currentUser.roleSlug !== 'super_admin'; // Sensitive aggregates are admin-only.
  const isSuperAdmin = snapshot.currentUser.roleSlug === 'super_admin';

  return NextResponse.json({
    ...snapshot,
    siteSettings: isSuperAdmin ? erpState.siteSettings : sanitizeSiteSettingsForPublic(erpState.siteSettings),
    printConfig: p4b.printConfig,
    districtRates: isVendor ? [] : getAllDistrictDeliveryRatesWithOverrides(),
    courier360: isVendor ? [] : computeCourier360Summary(),
    pickupBatches: isVendor ? [] : p4b.pickupBatches,
    remittanceLedger: isVendor ? [] : p4b.courierRemittanceLedger,
    courierClaims: isVendor ? [] : p4b.courierClaims,
    vendorEscrow: ctx && isSuperAdmin
      ? getVendorEscrowOverviewForActor(ctx)
      : {
          vendors: [],
          ledgerEntries: [],
          payoutRequests: [],
          returnResolutions: [],
        },
    // Phase 4C Data
    product360: ctx && isSuperAdmin ? computeProduct360List(ctx) : [],
    moneyMapPnl:
      ctx && !isVendor ? computeFinancialMoneyMapAndPnl(ctx) : null,
    expenses: isVendor
      ? []
      : isSuperAdmin
      ? p4c.expenses
      : p4c.expenses.filter((e) => e.category === 'ad_spend'),
    promoCodes: isVendor ? [] : erpState.promoCodes,
    blacklistedPhones: isVendor ? {} : adminStore.blacklistedPhones,
    messageTemplates: isVendor ? [] : p4c.messageTemplates,
    messageLogs: isVendor ? [] : p4c.messageLogs,
    automationKillSwitchActive: p4c.automationKillSwitchActive,
    automationRules: isVendor ? [] : p4c.automationRules,
    automationLogs: isVendor ? [] : p4c.automationLogs,
    sheetsSyncHistory: isVendor ? [] : p4c.sheetsSyncHistory,
    maskedCredentials: isSuperAdmin ? getMaskedCredentialsList() : [],
    scheduledJobs: isSuperAdmin ? p4c.scheduledJobs : [],
    // Phase 5 Pre-Launch Audit & Verification Center
    phase5Audit: null,
    phase5RoleInspection: isSuperAdmin
      ? simulateRoleFieldSanitization('public_customer')
      : null,
    phase5LifecycleDryRun: null,
    // Phase 6 Live Ops, Cart Recovery CRM, Courier Webhooks & Backup Snapshot
    phase6Overview: ctx && isSuperAdmin ? getPhase6WorkspaceOverview(ctx) : null,
    // Phase 7 Self-Service Vendor Portal, Flash Campaigns & Executive Accounting
    phase7Overview: ctx && isSuperAdmin ? getPhase7WorkspaceOverview(ctx) : null,
    // Product Studio and Catalog Management
    categories: erpState.categories,
    vendors: isSuperAdmin ? p4b.vendors : [],
    // Customer Inquiries & About/Contact Page Content
    inquiries: isSuperAdmin ? erpState.inquiries ?? [] : [],
    aboutContactPage: erpState.siteSettings.aboutContactPage,
  });
}

const workspacePostSchema = z.discriminatedUnion('operation', [
  // Phase 4A Operations
  z.object({
    operation: z.literal('lookup_phone'),
    phone: z.string(),
  }),
  z.object({
    operation: z.literal('create_smart_order'),
    orderInput: createOrderInputSchema,
    duplicateOverrideReason: z.string().optional(),
  }),
  z.object({
    operation: z.literal('order_grid_action'),
    orderNos: z.array(z.string().min(1)).min(1),
    actionType: z.enum([
      'update_status',
      'fix_address',
      'verify_bkash',
      'book_courier',
      'log_call_attempt',
      'log_call_status',
      'add_staff_note',
    ]),
    newStatus: z
      .enum([
        'pending_confirmation',
        'confirmed',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'return_initiated',
        'returned',
        'cancelled',
      ])
      .optional(),
    courierProvider: z
      .enum(['pathao', 'steadfast', 'redx', 'bd_post', 'manual'])
      .optional(),
    callStatus: z
      .enum([
        'pending',
        'confirmed_yes',
        'not_answered_busy',
        'cancelled_no',
        'call_back_requested',
      ])
      .optional(),
    callStatusNote: z.string().optional(),
    streetAddress: z.string().optional(),
    landmark: z.string().optional(),
    addressOverrideReason: z.string().optional(),
    staffNote: z.string().optional(),
  }),
  z.object({
    operation: z.literal('update_full_order'),
    orderNo: z.string().min(1),
    customerName: z.string().trim().min(2),
    customerPhone: z.string().trim().min(11),
    districtId: z.number().int().min(1).max(64),
    upazilaId: z.number().int().min(1),
    streetAddress: z.string().trim().min(2),
    landmark: z.string().trim().optional().default(''),
    items: z
      .array(
        z.object({
          productId: z.string().optional(),
          variantId: z.string().min(1),
          quantity: z.number().int().min(1),
          unitSalePricePoisha: z.number().int().min(0).optional(),
        })
      )
      .optional(),
    discountPoisha: z.number().int().min(0),
    deliveryChargePoisha: z.number().int().min(0),
    advancePaidPoisha: z.number().int().min(0),
    paymentMethod: z.enum([
      'cod',
      'bkash_manual',
    ]),
    paymentStatus: z.enum([
      'unpaid',
      'partial_verified',
      'paid_verified',
      'remitted',
      'refunded',
    ]),
    manualPaymentTrxId: z.string().nullable().optional(),
    courierProvider: z.enum([
      'manual',
      'steadfast',
      'pathao',
      'redx',
      'bd_post',
    ]),
    consignmentId: z.string().nullable().optional(),
    trackingCode: z.string().nullable().optional(),
    status: z.enum([
      'pending_confirmation',
      'confirmed',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'return_initiated',
      'returned',
      'cancelled',
    ]),
    source: z.enum([
      'storefront',
      'facebook',
      'whatsapp',
      'instagram',
      'phone_call',
      'other',
    ]),
    callStatus: z
      .enum([
        'pending',
        'confirmed_yes',
        'not_answered_busy',
        'cancelled_no',
        'call_back_requested',
      ])
      .optional(),
    callStatusNote: z.string().optional(),
    internalStaffNote: z.string().optional(),
    addressOverrideReason: z.string().optional(),
  }),
  z.object({
    operation: z.literal('record_dispatched_message'),
    orderNo: z.string().min(1),
    eventKey: z.enum([
      'ORDER_CONFIRMED',
      'ORDER_PACKED',
      'ORDER_SHIPPED',
      'OUT_FOR_DELIVERY',
      'ORDER_DELIVERED',
      'DELIVERY_DELAYED',
      'RETURN_INITIATED',
      'PAYOUT_APPROVED_PAID',
    ]),
    channel: z.enum(['wa_me', 'sms_app', 'copy_clipboard']),
    recipientPhone: z.string().min(11),
    messageText: z.string().min(1),
  }),
  z.object({
    operation: z.literal('create_user'),
    username: z.string().trim().min(3),
    displayNameBn: z.string().trim().min(2),
    displayNameEn: z.string().trim().optional().default(''),
    roleSlug: z.enum([
      'super_admin',
      'vendor',
      'marketing_manager',
      'packaging_manager',
    ]),
    vendorId: z.string().nullable().optional(),
    maxDiscountBp: z.number().int().min(0).max(5000).optional(),
  }),
  z.object({
    operation: z.literal('reset_user_security'),
    targetUserId: z.string().min(1),
    action: z.enum(['reset_password', 'reset_2fa', 'toggle_active']),
    adminTotpCode: z.string().trim().length(6),
  }),
  z.object({
    operation: z.literal('upsert_role_matrix'),
    roleSlug: z.enum([
      'super_admin',
      'vendor',
      'marketing_manager',
      'packaging_manager',
    ]),
    nameBn: z.string().trim().min(2),
    nameEn: z.string().trim().optional().default(''),
    maxDiscountBp: z.number().int().min(0).max(5000),
    maskCustomerPiiForVendor: z.boolean(),
    moduleUpdates: z
      .array(
        z.object({
          moduleKey: z.string(),
          canRead: z.boolean(),
          canCreate: z.boolean(),
          canUpdate: z.boolean(),
          canDelete: z.boolean(),
        })
      )
      .optional(),
  }),
  // Phase 4B Operations
  z.object({
    operation: z.literal('generate_print_slips'),
    orderNos: z.array(z.string().min(1)).min(1),
    sortBy: z
      .enum(['order_no', 'vendor', 'courier', 'district', 'sku'])
      .optional(),
  }),
  z.object({
    operation: z.literal('update_print_config'),
    patch: z.object({
      defaultMode: z.enum(['a4_3part', 'thermal_4x6']).optional(),
      part1TitleBn: z.string().min(2).optional(),
      part1TitleEn: z.string().min(2).optional(),
      part2TitleBn: z.string().min(2).optional(),
      part2TitleEn: z.string().min(2).optional(),
      part3TitleBn: z.string().min(2).optional(),
      part3TitleEn: z.string().min(2).optional(),
      part1HeightMm: z.number().int().min(60).max(120).optional(),
      part2HeightMm: z.number().int().min(60).max(120).optional(),
      part3HeightMm: z.number().int().min(60).max(120).optional(),
      checklistItemsBn: z.array(z.string()).optional(),
      footerNoteBn: z.string().optional(),
    }),
  }),
  z.object({
    operation: z.literal('upsert_district_rate'),
    districtId: z.number().int().min(1).max(64),
    base1KgPoisha: z.number().int().min(0),
    extraPerKgPoisha: z.number().int().min(0),
    bdPostPerKgPoisha: z.number().int().min(0),
    isFreeDeliveryDistrict: z.boolean(),
  }),
  z.object({
    operation: z.literal('create_pickup_batch'),
    courierProvider: z.enum([
      'pathao',
      'steadfast',
      'redx',
      'bd_post',
      'manual',
    ]),
    orderNos: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    operation: z.literal('confirm_batch_handover'),
    batchId: z.string().min(1),
    riderName: z.string().min(2),
    riderPhone: z.string().min(5),
  }),
  z.object({
    operation: z.literal('settle_courier_remittance'),
    settlementRef: z.string().min(2),
    courierProvider: z.enum([
      'pathao',
      'steadfast',
      'redx',
      'bd_post',
      'manual',
    ]),
    items: z
      .array(
        z.object({
          orderNo: z.string().min(1),
          courierFeeDeductedPoisha: z.number().int().min(0),
          remittedAmountPoisha: z.number().int().min(0),
        })
      )
      .min(1),
  }),
  z.object({
    operation: z.literal('process_four_way_return'),
    orderNo: z.string().min(1),
    faultType: z.enum([
      'WAREHOUSE_PACKAGING_FAULT',
      'SUPPLIER_DEFECT',
      'CUSTOMER_INTACT_RETURN',
      'COURIER_NEGLIGENCE',
    ]),
    proofUrl: z.string().default(''),
    noteBn: z.string().min(2),
    wasAlreadyPaidOut: z.boolean().optional(),
  }),
  z.object({
    operation: z.literal('request_vendor_payout'),
    vendorId: z.string().min(1),
    requestedAmountPoisha: z.number().int().min(100),
    payoutMethodBn: z.string().optional(),
    payoutAccountNo: z.string().optional(),
  }),
  z.object({
    operation: z.literal('resolve_vendor_payout'),
    payoutId: z.string().min(1),
    decision: z.enum(['approve', 'reject', 'mark_paid']),
    rejectionReasonBn: z.string().optional(),
    paymentTrxId: z.string().optional(),
    proofUrl: z.string().optional(),
  }),
  z.object({
    operation: z.literal('submit_vendor_onboarding_15q'),
    businessNameBn: z.string().min(2),
    businessNameEn: z.string().optional(),
    ownerNameBn: z.string().min(2),
    contactPhone: z.string().min(11),
    defaultCommissionBp: z.number().int().min(0).max(5000),
    escrowHoldDaysOverride: z.number().int().min(1).max(30),
    payoutMethodBn: z.string().min(2),
    payoutAccountNo: z.string().min(4),
    answers15: z.record(z.string(), z.string()),
  }),
  z.object({
    operation: z.literal('audit_vendor_closure'),
    vendorId: z.string().min(1),
  }),
  // Phase 4C Operations
  z.object({
    operation: z.literal('receive_qc_stock'),
    variantId: z.string().min(1),
    receivedQty: z.number().int().min(1),
    qcRejectedQty: z.number().int().min(0).optional(),
    qcProofUrl: z.string().min(4),
    noteBn: z.string().min(2),
  }),
  z.object({
    operation: z.literal('add_expense_or_ad'),
    category: z.enum([
      'ad_spend',
      'packaging',
      'courier_return_loss',
      'damage_compensation',
      'office_ops',
    ]),
    sourceChannel: z.enum([
      'facebook',
      'instagram',
      'whatsapp',
      'storefront',
      'general',
    ]),
    campaignName: z.string().min(1),
    amountPoisha: z.number().int().min(100),
    expenseDate: z.string().optional(),
    isRecurring: z.boolean().optional(),
    noteBn: z.string().min(2),
  }),
  z.object({
    operation: z.literal('upsert_promo_code'),
    code: z.string().min(3),
    discountType: z.enum(['percentage_bp', 'fixed_poisha']),
    value: z.number().int().min(1),
    minOrderSubtotalPoisha: z.number().int().min(0),
    maxDiscountCapPoisha: z.number().int().nullable().optional(),
    isActive: z.boolean(),
  }),
  z.object({
    operation: z.literal('upsert_blacklist'),
    phone: z.string().min(10),
    action: z.enum(['add', 'remove']),
    reasonBn: z.string().optional(),
  }),
  z.object({
    operation: z.literal('update_message_template'),
    eventKey: z.enum([
      'ORDER_CONFIRMED',
      'ORDER_PACKED',
      'ORDER_SHIPPED',
      'OUT_FOR_DELIVERY',
      'ORDER_DELIVERED',
      'DELIVERY_DELAYED',
      'RETURN_INITIATED',
      'PAYOUT_APPROVED_PAID',
    ]),
    templateBn: z.string().optional(),
    templateEn: z.string().optional(),
    waMeFreeEnabled: z.boolean().optional(),
    smsLinkFreeEnabled: z.boolean().optional(),
    whatsappCloudPaidEnabled: z.boolean().optional(),
    httpSmsGatewayEnabled: z.boolean().optional(),
    emailResendEnabled: z.boolean().optional(),
    delayMinutes: z.number().int().min(0).optional(),
  }),
  z.object({
    operation: z.literal('preview_order_message'),
    orderNo: z.string().min(1),
    eventKey: z.enum([
      'ORDER_CONFIRMED',
      'ORDER_PACKED',
      'ORDER_SHIPPED',
      'OUT_FOR_DELIVERY',
      'ORDER_DELIVERED',
      'DELIVERY_DELAYED',
      'RETURN_INITIATED',
      'PAYOUT_APPROVED_PAID',
    ]),
  }),
  z.object({
    operation: z.literal('toggle_automation_rule'),
    globalKillSwitchActive: z.boolean().optional(),
    ruleId: z.string().optional(),
    isEnabled: z.boolean().optional(),
    dryRunOnly: z.boolean().optional(),
  }),
  z.object({
    operation: z.literal('simulate_automation_rule'),
    ruleId: z.string().min(1),
    sampleOrderNo: z.string().optional(),
  }),
  z.object({
    operation: z.literal('trigger_sheets_sync'),
    mode: z.enum(['incremental', 'full_resync']),
  }),
  z.object({
    operation: z.literal('save_or_revoke_credential'),
    keyName: z.enum([
      'STEADFAST_API_KEY',
      'PATHAO_CLIENT_ID',
      'REDX_ACCESS_TOKEN',
      'RESEND_API_KEY',
      'HTTP_SMS_GATEWAY_URL',
      'WHATSAPP_CLOUD_TOKEN',
      'GOOGLE_SHEETS_WEBHOOK_URL',
    ]),
    action: z.enum(['save', 'revoke']),
    rawSecretValue: z.string().optional(),
  }),
  z.object({
    operation: z.literal('update_branding_thresholds'),
    patch: z.object({
      brandNameBn: z.string().optional(),
      brandNameEn: z.string().optional(),
      taglineBn: z.string().optional(),
      supportPhone: z.string().optional(),
      whatsappNumber: z.string().optional(),
      bkashManualNumber: z.string().optional(),
      freeDeliveryThresholdPoisha: z.number().int().min(0).optional(),
      mandatoryAdvanceThresholdPoisha: z.number().int().min(0).optional(),
      globalEscrowHoldDays: z.number().int().min(1).max(30).optional(),
      minPayoutRequestPoisha: z.number().int().min(100).optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessageBn: z.string().optional(),
    }),
  }),
  z.object({
    operation: z.literal('run_scheduled_job_now'),
    jobKey: z.enum([
      'escrow_maturity_promoter',
      'daily_sales_summary_push',
      'courier_status_poller',
      'sheets_one_way_mirror',
      'supabase_keep_alive_ping',
    ]),
  }),
  z.object({
    operation: z.literal('sync_courier_tracking'),
  }),
  // Phase 5 Operations
  z.object({
    operation: z.literal('run_phase5_audit'),
  }),
  z.object({
    operation: z.literal('inspect_role_sanitization'),
    roleSlug: z.enum([
      'public_customer',
      'vendor',
      'marketing_manager',
      'packaging_manager',
      'super_admin',
    ]),
  }),
  z.object({
    operation: z.literal('run_consignment_lifecycle_dry_run'),
    variantId: z.string().optional(),
    districtId: z.number().int().min(1).max(64).optional(),
    promoDiscountPoisha: z.number().int().min(0).optional(),
  }),
  // Phase 6 Operations
  z.object({
    operation: z.literal('recover_abandoned_cart'),
    cartId: z.string().min(1),
  }),
  z.object({
    operation: z.literal('record_cart_reminder'),
    cartId: z.string().min(1),
    channel: z.enum(['wa_me', 'sms_link']),
  }),
  z.object({
    operation: z.literal('simulate_courier_webhook'),
    provider: z.enum(['steadfast', 'pathao', 'redx', 'bd_post', 'manual']),
    orderNo: z.string().min(1),
    rawStatus: z.enum([
      'delivered',
      'partial_delivered',
      'returned',
      'in_transit',
      'hold',
    ]),
  }),
  z.object({
    operation: z.literal('reconcile_courier_csv'),
    provider: z.enum(['steadfast', 'pathao', 'redx', 'bd_post', 'manual']),
    settlementBatchRef: z.string().min(1),
    csvText: z.string().min(1),
  }),
  z.object({
    operation: z.literal('moderate_product_review'),
    reviewId: z.string().min(1),
    decision: z.enum(['approved', 'rejected']),
  }),
  z.object({
    operation: z.literal('create_system_backup_snapshot'),
  }),
  // Phase 7 Operations
  z.object({
    operation: z.literal('submit_consignment_lot'),
    variantId: z.string().min(1),
    dispatchedQty: z.number().int().min(1),
    challanRef: z.string().min(1),
    noteBn: z.string().min(1),
  }),
  z.object({
    operation: z.literal('review_consignment_lot'),
    lotId: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    qcRejectedQty: z.number().int().min(0).optional(),
    noteBn: z.string().optional(),
  }),
  z.object({
    operation: z.literal('submit_price_proposal'),
    variantId: z.string().min(1),
    proposedSupplierCostPoisha: z.number().int().min(100),
    proposedSalePricePoisha: z.number().int().min(100),
    reasonBn: z.string().min(2),
  }),
  z.object({
    operation: z.literal('resolve_price_proposal'),
    proposalId: z.string().min(1),
    decision: z.enum(['approved', 'rejected']),
  }),
  z.object({
    operation: z.literal('create_flash_campaign'),
    campaignCode: z.string().min(2),
    titleBn: z.string().min(2),
    variantId: z.string().min(1),
    flashDiscountPoisha: z.number().int().min(100),
    maxUnitsQuota: z.number().int().min(1),
  }),
  z.object({
    operation: z.literal('promote_matured_escrow'),
    forcePromoteAllLocked: z.boolean().optional(),
  }),
  z.object({
    operation: z.literal('upsert_supplier_offer'),
    variantId: z.string().min(1),
    vendorId: z.string().min(1),
    internalVendorSku: z.string().min(2),
    supplierCostPoisha: z.number().int().min(100),
    supplierProfitPoisha: z.number().int().min(0),
    salePricePoisha: z.number().int().min(100).optional(),
    priorityRank: z.number().int().min(1).max(20).optional(),
    leadTimeDays: z.number().int().min(1).max(30).optional(),
    stockAvailable: z.number().int().min(0),
  }),
  z.object({
    operation: z.literal('split_order_fulfillment_groups'),
    orderNo: z.string().min(1),
    allocationPolicy: z
      .enum([
        'priority_rank',
        'lowest_payable_highest_margin',
        'highest_stock',
      ])
      .optional(),
  }),
  z.object({
    operation: z.literal('create_ledger_reversal'),
    originalLedgerEntryId: z.string().min(1),
    correctedCreditPoisha: z.number().int().min(0),
    reasonBn: z.string().min(5),
  }),
  z.object({
    operation: z.literal('resolve_ledger_reversal'),
    reversalId: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    emergencySelfApprovalOverride: z.boolean().optional(),
    emergencyOverrideReasonBn: z.string().optional(),
    totpCode: z.string().optional(),
  }),
  z.object({
    operation: z.literal('execute_customer_refund'),
    orderNo: z.string().min(1),
    refundChannel: z.enum(['bkash_manual', 'bank_transfer']),
    refundAmountPoisha: z.number().int().min(100),
    vendorClawbackPoisha: z.number().int().min(0).optional(),
    refundTrxId: z.string().min(4),
    reasonBn: z.string().min(3),
  }),
  // Product & Category Studio Operations
  z.object({
    operation: z.literal('upsert_product'),
    product: z.object({
      productId: z.string().optional(),
      vendorId: z.string().min(1, 'ভেন্ডর সিলেক্ট করুন।'),
      categoryId: z.string().min(1, 'ক্যাটাগরি সিলেক্ট করুন।'),
      nameBn: z.string().min(1, 'বাংলা নাম আবশ্যক।'),
      nameEn: z.string().min(1, 'ইংরেজি নাম আবশ্যক।'),
      slug: z.string().optional(),
      descriptionBn: z.string().min(1, 'বাংলা বিবরণ আবশ্যক।'),
      descriptionEn: z.string().optional(),
      isFeatured: z.boolean().optional(),
      isFreeDelivery: z.boolean().optional(),
      requiresAdvanceCourierCharge: z.boolean().optional(),
      customAdvanceDepositPoisha: z.number().int().nonnegative().optional(),
      lowStockThreshold: z.number().int().nonnegative().optional(),
      leadTimeDays: z.number().int().nonnegative().optional(),
      commissionOverrideBp: z.number().int().nullable().optional(),
      status: z.enum(['draft', 'active', 'archived']).optional(),
      images: z.array(z.string()).optional(),
      specs: z
        .array(
          z.object({
            labelBn: z.string(),
            labelEn: z.string(),
            valueBn: z.string(),
            valueEn: z.string(),
          })
        )
        .optional(),
      variants: z
        .array(
          z.object({
            variantId: z.string().optional(),
            internalVendorSku: z.string().optional(),
            publicSku: z.string().min(1, 'পাবলিক SKU আবশ্যক।'),
            titleBn: z.string().min(1, 'ভ্যারিয়েন্ট নাম আবশ্যক।'),
            titleEn: z.string().optional(),
            attributes: z.record(z.string(), z.string()).optional(),
            imageUrl: z.string().nullable().optional(),
            supplierCostPoisha: z.number().int().nonnegative(),
            supplierProfitPoisha: z.number().int().nonnegative().optional(),
            supplierPayablePoisha: z.number().int().nonnegative().optional(),
            platformMarginPoisha: z.number().int().nonnegative(),
            salePricePoisha: z.number().int().positive(),
            mrpPricePoisha: z.number().int().positive().optional(),
            stockOnHand: z.number().int().nonnegative(),
            stockReserved: z.number().int().nonnegative().optional(),
            weightGrams: z.number().int().positive().optional(),
            barcode: z.string().optional(),
            isActive: z.boolean().optional(),
          })
        )
        .min(1, 'কমপক্ষে একটি ভ্যারিয়েন্ট থাকা আবশ্যক।'),
    }),
  }),
  z.object({
    operation: z.literal('delete_product'),
    productId: z.string().min(1, 'প্রোডাক্ট আইডি আবশ্যক।'),
  }),
  z.object({
    operation: z.literal('upsert_category'),
    category: z.object({
      id: z.string().optional(),
      nameBn: z.string().min(1, 'ক্যাটাগরি বাংলা নাম আবশ্যক।'),
      nameEn: z.string().min(1, 'ক্যাটাগরি ইংরেজি নাম আবশ্যক।'),
      slug: z.string().optional(),
      descriptionBn: z.string().min(1, 'বিবরণ আবশ্যক।'),
      descriptionEn: z.string().optional(),
      iconName: z.string().optional(),
      sortOrder: z.number().int().optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  // Customer Inquiries & About/Contact Page Content Operations
  z.object({
    operation: z.literal('update_inquiry_status'),
    inquiryId: z.string().min(1),
    status: z.enum(['unread', 'replied', 'resolved']),
    adminNotes: z.string().optional(),
  }),
  z.object({
    operation: z.literal('update_about_contact_settings'),
    patch: z.object({
      titleBn: z.string().optional(),
      titleEn: z.string().optional(),
      subtitleBn: z.string().optional(),
      subtitleEn: z.string().optional(),
      storyTitleBn: z.string().optional(),
      storyTitleEn: z.string().optional(),
      storyParagraph1Bn: z.string().optional(),
      storyParagraph1En: z.string().optional(),
      storyParagraph2Bn: z.string().optional(),
      storyParagraph2En: z.string().optional(),
      warehouseAddressBn: z.string().optional(),
      warehouseAddressEn: z.string().optional(),
      helplineHoursBn: z.string().optional(),
      helplineHoursEn: z.string().optional(),
    }),
  }),
  z.object({
    operation: z.literal('review_manual_bkash'),
    orderNo: z.string().min(1),
    trxId: z.string().optional(),
    decision: z.enum(['under_review', 'approved', 'rejected', 'reversed']),
    reviewNoteBn: z.string().optional(),
  }),
  z.object({
    operation: z.literal('input_manual_mfs'),
    orderNo: z.string().min(1),
    provider: z.enum(['bkash', 'nagad', 'rocket']),
    senderPhone: z.string().min(11),
    trxId: z.string().min(4),
    amountTaka: z.number().positive(),
    autoVerify: z.boolean().optional(),
    reviewNoteBn: z.string().optional(),
  }),
  z.object({
    operation: z.literal('resolve_customer_refund'),
    refundId: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    emergencySelfApprovalOverride: z.boolean().optional(),
    emergencyOverrideReasonBn: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    // CRITICAL SECURITY FIX (Phase 1): Strictly require verified signed session token; NEVER fallback to 'usr-super-admin'
    const rawToken =
      req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ||
      extractAdminSessionTokenFromRequest(req);
    const session = verifyAdminSessionToken(rawToken);
    if (!session || session.purpose === 'enrollment') {
      return NextResponse.json(
        {
          success: false,
          errorBn: 'অননুমোদিত অ্যাক্সেস। অনুগ্রহ করে পুনরায় লগইন করুন (401 Unauthorized)।',
        },
        { status: 401 }
      );
    }

    const csrfCheck = verifyOriginAndCsrf(req, session);
    if (!csrfCheck.ok) {
      return NextResponse.json(
        { success: false, errorBn: csrfCheck.errorBn },
        { status: 403 }
      );
    }

    const ctx = getActorSecurityContext(session.userId);
    if (!ctx) {
      return NextResponse.json(
        { success: false, errorBn: 'অ্যাকাউন্ট নিষ্ক্রিয় অথবা পাওয়া যায়নি।' },
        { status: 401 }
      );
    }

    if (!canAccessAdminWorkspace(ctx)) {
      return NextResponse.json({ success: false, errorBn: 'অ্যাডমিন ওয়ার্কস্পেসে প্রবেশের অনুমতি নেই।' }, { status: 403 });
    }

    const rawBody = await req.text();
    const sizeCheck = assertJsonBodySize(rawBody, 256 * 1024);
    if (!sizeCheck.ok) {
      return NextResponse.json(
        { success: false, errorBn: sizeCheck.errorBn },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawBody) as unknown;
    const parsed = workspacePostSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          errorBn: firstIssue?.message ?? 'অনুরোধের তথ্য সঠিক নয়।',
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    if (payload.operation === 'order_grid_action' && payload.actionType === 'book_courier') {
      return NextResponse.json({ success: false, code: 'NOT_INTEGRATED', errorBn: 'যাচাইকৃত বুকিং adapter ছাড়া স্বয়ংক্রিয় কুরিয়ার বুকিং বন্ধ।' }, { status: 503 });
    }
    if (!canExecuteWorkspaceAction(ctx, payload.operation)) {
      return NextResponse.json({ success: false, errorBn: 'এই অ্যাকশনের অনুমতি নেই।' }, { status: 403 });
    }
    if (('provider' in payload && ['nagad', 'rocket'].includes(String(payload.provider))) ||
        ('courierProvider' in payload && payload.courierProvider === 'redx') ||
        ('paymentMethod' in payload && !['cod', 'bkash_manual'].includes(String(payload.paymentMethod)))) {
      return NextResponse.json({ success: false, errorBn: 'এই সেবায় নতুন কার্যক্রম অনুমোদিত নয়।' }, { status: 403 });
    }
    if (ctx.roleSlug !== 'super_admin' &&
        (payload.operation === 'update_full_order' ||
         (payload.operation === 'order_grid_action' && !['add_staff_note', 'log_call_status', 'log_call_attempt'].includes(payload.actionType)))) {
      return NextResponse.json({ success: false, errorBn: 'আর্থিক বা পূর্ণ অর্ডার পরিবর্তনে অ্যাডমিন প্রয়োজন।' }, { status: 403 });
    }

    // Phase 4A Handlers
    if (payload.operation === 'lookup_phone') {
      const history = lookupCustomerHistoryByPhone(ctx, payload.phone);
      return NextResponse.json({ success: true, history });
    }

    if (payload.operation === 'create_smart_order') {
      const res = createSmartAdminOrder(ctx, {
        ...payload.orderInput,
        duplicateOverrideReason: payload.duplicateOverrideReason,
      });
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'order_grid_action') {
      const res = executeOrderGridAction(ctx, payload);
      if (
        res.success && payload.actionType === 'update_status' &&
        (payload.newStatus === 'delivered' || payload.newStatus === 'returned')
      ) {
        for (const result of res.results) {
          if (result.ok) autoRecordOrderDeliveredOrReturned(ctx, result.orderNo, payload.newStatus);
        }
      }
      return NextResponse.json(res);
    }

    if (payload.operation === 'update_full_order') {
      const res = updateFullOrderDetails(ctx, payload);
      if (
        res.success &&
        (payload.status === 'delivered' || payload.status === 'returned')
      ) {
        autoRecordOrderDeliveredOrReturned(ctx, payload.orderNo, payload.status);
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'record_dispatched_message') {
      const p4cStore = readPhase4CStore();
      const adminStore = readAdminStore();
      const channelLabel: 'wa.me (Free)' | 'sms: (Free)' =
        payload.channel === 'sms_app' ? 'sms: (Free)' : 'wa.me (Free)';

      const logRecord: MessageDispatchLogRecord = {
        id: `msg-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
        orderNo: payload.orderNo,
        eventKey: payload.eventKey,
        channel: channelLabel,
        recipientPhone: payload.recipientPhone,
        renderedMessage: payload.messageText,
        deepLinkUrl: '',
        status: 'sent',
        createdAt: new Date().toISOString(),
      };

      p4cStore.messageLogs.unshift(logRecord);
      writePhase4CStore(p4cStore);

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'CUSTOMER_MESSAGE_DISPATCHED',
        targetType: 'order',
        targetId: payload.orderNo,
        summaryBn: `${ctx.username} কর্তৃক ${payload.orderNo} অর্ডারের গ্রাহককে ${channelLabel}-এর মাধ্যমে মেসেজ পাঠানো হয়েছে।`,
        metadata: {
          channel: payload.channel,
          phone: payload.recipientPhone,
          eventKey: payload.eventKey,
        },
      });
      writeAdminStore(adminStore);

      return NextResponse.json({ success: true, logRecord });
    }

    if (payload.operation === 'create_user') {
      const res = createAdminUserBySuperAdmin(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'reset_user_security') {
      const res = adminResetUserSecurity(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'upsert_role_matrix') {
      const res = upsertCustomRolePermissionMatrix(ctx, {
        ...payload,
        moduleUpdates: payload.moduleUpdates?.map((m) => ({
          ...m,
          moduleKey: m.moduleKey as PermissionModuleKey,
        })),
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    // Phase 4B Handlers
    if (payload.operation === 'generate_print_slips') {
      const res = generateOrderPrintSlips(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'update_print_config') {
      const res = updatePrintTemplateConfig(ctx, payload.patch);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'upsert_district_rate') {
      const res = upsertDistrictDeliveryRateOverride(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'create_pickup_batch') {
      const res = createPickupBatchAndManifest(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'confirm_batch_handover') {
      const res = confirmBatchHandoverShipped(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'settle_courier_remittance') {
      const res = recordCourierRemittanceSettlement(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'process_four_way_return') {
      const res = processFourWayOrderReturn(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'request_vendor_payout') {
      const res = requestVendorPayout(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'resolve_vendor_payout') {
      const res = resolveVendorPayoutRequest(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'submit_vendor_onboarding_15q') {
      const res = submitVendorOnboarding15Q(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'audit_vendor_closure') {
      const res = auditAndCloseVendorContract(ctx, payload.vendorId);
      return NextResponse.json(res, { status: res.canClose ? 200 : 400 });
    }

    // Phase 4C Handlers
    if (payload.operation === 'receive_qc_stock') {
      const res = receiveConsignmentStockWithQc(ctx, {
        variantId: payload.variantId,
        addedUnits: payload.receivedQty,
        qcProofUrl: payload.qcProofUrl,
        noteBn: payload.noteBn,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'add_expense_or_ad') {
      const res = addExpenseOrAdSpendEntry(ctx, {
        category: payload.category,
        sourceChannel: payload.sourceChannel,
        campaignName: payload.campaignName,
        amountPoisha: payload.amountPoisha,
        expenseDate:
          payload.expenseDate ?? new Date().toISOString().slice(0, 10),
        isRecurring: payload.isRecurring ?? false,
        noteBn: payload.noteBn,
      });
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'upsert_promo_code') {
      const res = upsertPromoCodeRule(ctx, {
        code: payload.code,
        titleBn: payload.code,
        discountType: payload.discountType,
        discountValue: payload.value,
        minOrderAmountPoisha: payload.minOrderSubtotalPoisha,
        maxDiscountCapPoisha: payload.maxDiscountCapPoisha ?? null,
        vendorIdScope: null,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'upsert_blacklist') {
      const res = upsertCustomerBlacklist(ctx, {
        phone: payload.phone,
        reasonBn: payload.reasonBn ?? '',
        remove: payload.action === 'remove',
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'update_message_template') {
      const res = updateMessageTemplateAndTrigger(ctx, {
        eventKey: payload.eventKey,
        templateBn: payload.templateBn ?? '',
        templateEn: payload.templateEn ?? '',
        waMeFreeEnabled: payload.waMeFreeEnabled ?? true,
        smsLinkFreeEnabled: payload.smsLinkFreeEnabled ?? true,
        whatsappCloudPaidEnabled: payload.whatsappCloudPaidEnabled ?? false,
        httpSmsGatewayEnabled: payload.httpSmsGatewayEnabled ?? false,
        emailResendEnabled: payload.emailResendEnabled ?? false,
        delayMinutes: payload.delayMinutes ?? 0,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'preview_order_message') {
      const res = renderOrderMessagePreview(ctx, {
        orderNo: payload.orderNo,
        eventKey: payload.eventKey,
        locale: 'bn',
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'toggle_automation_rule') {
      const res = toggleAutomationRuleOrKillSwitch(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'simulate_automation_rule') {
      const res = executeAutomationRuleSimulation(ctx, {
        ruleId: payload.ruleId,
        sampleOrderNo: payload.sampleOrderNo ?? 'ORD-261106-0001',
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'trigger_sheets_sync') {
      const res = triggerGoogleSheetsOneWaySync(ctx, payload.mode);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'save_or_revoke_credential') {
      const res = saveOrRevokeEncryptedCredential(ctx, {
        keyName: payload.keyName,
        rawSecretValue: payload.rawSecretValue,
        revoke: payload.action === 'revoke',
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'update_branding_thresholds') {
      const res = updateSiteBrandingAndThresholds(ctx, payload.patch);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'sync_courier_tracking') {
      const res = syncAllCourierTrackingStatuses(ctx);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'run_scheduled_job_now') {
      const res = runScheduledJobNow(ctx, payload.jobKey);
      if (payload.jobKey === 'courier_status_poller') {
        const syncRes = syncAllCourierTrackingStatuses(ctx);
        if (res.job) {
          res.job.lastOutputBn = `${res.job.lastOutputBn} · ${syncRes.messageBn}`;
        }
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    // Phase 5 Handlers
    if (payload.operation === 'run_phase5_audit') {
      const auditReport = runPhase5PreLaunchAudit();
      return NextResponse.json({ success: true, auditReport });
    }

    if (payload.operation === 'inspect_role_sanitization') {
      const inspection = simulateRoleFieldSanitization(
        payload.roleSlug as SystemRoleSlug
      );
      return NextResponse.json({ success: true, inspection });
    }

    if (payload.operation === 'run_consignment_lifecycle_dry_run') {
      const simulation = runConsignmentLifecycleDryRun({
        variantId: payload.variantId,
        districtId: payload.districtId,
        promoDiscountPoisha: payload.promoDiscountPoisha,
      });
      return NextResponse.json({ success: true, simulation });
    }

    // Phase 6 Handlers
    if (payload.operation === 'recover_abandoned_cart') {
      const res = recoverAbandonedCartToOrder(ctx, payload.cartId);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'record_cart_reminder') {
      const res = recordAbandonedCartReminderSent(
        ctx,
        payload.cartId,
        payload.channel
      );
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'simulate_courier_webhook') {
      const res = processCourierWebhookPayload(ctx, {
        provider: payload.provider,
        orderNo: payload.orderNo,
        rawStatus: payload.rawStatus,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'reconcile_courier_csv') {
      const res = parseAndReconcileCourierRemittanceCsv(ctx, {
        provider: payload.provider,
        settlementBatchRef: payload.settlementBatchRef,
        csvText: payload.csvText,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'moderate_product_review') {
      const res = moderateProductReview(ctx, {
        reviewId: payload.reviewId,
        decision: payload.decision,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'create_system_backup_snapshot') {
      const res = generateSystemBackupSnapshot(ctx);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    // Phase 7 Handlers
    if (payload.operation === 'submit_consignment_lot') {
      const res = submitConsignmentDispatchLot(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'review_consignment_lot') {
      const res = reviewConsignmentDispatchLot(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'submit_price_proposal') {
      const res = submitVendorPriceProposal(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'resolve_price_proposal') {
      const res = resolveVendorPriceProposal(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'create_flash_campaign') {
      const res = createMarginSafeFlashCampaign(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'promote_matured_escrow') {
      const res = promoteMaturedEscrowEntriesBatch(
        ctx,
        Boolean(payload.forcePromoteAllLocked)
      );
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'upsert_supplier_offer') {
      const res = upsertSupplierProductOffer(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'split_order_fulfillment_groups') {
      const res = splitOrderIntoVendorFulfillmentGroups(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'create_ledger_reversal') {
      const res = createLedgerReversalRequest(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    if (payload.operation === 'resolve_ledger_reversal') {
      const res = resolveLedgerReversalRequest(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'execute_customer_refund') {
      const res = executeCustomerRefundWorkflow(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 201 : 400 });
    }

    // Product & Category Studio Handlers
    if (payload.operation === 'upsert_product') {
      // Permission check: vendor can only manage their own products
      if (ctx.roleSlug === 'vendor' && ctx.vendorId && payload.product.vendorId !== ctx.vendorId) {
        return NextResponse.json(
          { success: false, errorBn: 'আপনি শুধুমাত্র আপনার নিজস্ব পণ্য পরিবর্তন করতে পারবেন।' },
          { status: 403 }
        );
      }

      const res = upsertAdminProduct(payload.product);
      if (res.success && res.product) {
        const adminStore = readAdminStore();
        appendImmutableAuditLog(adminStore, {
          actorUserId: ctx.userId,
          actorUsername: ctx.username,
          actorRole: ctx.roleSlug,
          actionCode: payload.product.productId ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED',
          targetType: 'product',
          targetId: res.product.productId,
          summaryBn: `পণ্য "${res.product.nameBn}" ${payload.product.productId ? 'আপডেট' : 'তৈরি'} করা হয়েছে (${res.product.variants.length}টি ভ্যারিয়েন্টসহ)।`,
          metadata: { nameEn: res.product.nameEn },
        });
        writeAdminStore(adminStore);
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'delete_product') {
      if (ctx.roleSlug === 'vendor') {
        return NextResponse.json(
          { success: false, errorBn: 'ভেন্ডর অ্যাকাউন্ট থেকে পণ্য ডিলিট অনুমোদিত নয়।' },
          { status: 403 }
        );
      }

      const res = deleteAdminProduct(payload.productId);
      if (res.success) {
        const adminStore = readAdminStore();
        appendImmutableAuditLog(adminStore, {
          actorUserId: ctx.userId,
          actorUsername: ctx.username,
          actorRole: ctx.roleSlug,
          actionCode: 'PRODUCT_ARCHIVED',
          targetType: 'product',
          targetId: payload.productId,
          summaryBn: `পণ্য আইডি ${payload.productId} ক্যাটালগ থেকে সরানো হয়েছে।`,
          metadata: {},
        });
        writeAdminStore(adminStore);
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'upsert_category') {
      if (ctx.roleSlug === 'vendor') {
        return NextResponse.json(
          { success: false, errorBn: 'শুধুমাত্র অ্যাডমিন ক্যাটাগরি পরিচালনা করতে পারেন।' },
          { status: 403 }
        );
      }

      const res = upsertAdminCategory(payload.category);
      if (res.success && res.category) {
        const adminStore = readAdminStore();
        appendImmutableAuditLog(adminStore, {
          actorUserId: ctx.userId,
          actorUsername: ctx.username,
          actorRole: ctx.roleSlug,
          actionCode: 'CATEGORY_CONFIG_UPDATED',
          targetType: 'system',
          targetId: res.category.id,
          summaryBn: `ক্যাটাগরি "${res.category.nameBn}" সংরক্ষিত হয়েছে।`,
          metadata: { slug: res.category.slug },
        });
        writeAdminStore(adminStore);
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'update_inquiry_status') {
      const res = updateCustomerInquiryStatus(
        payload.inquiryId,
        payload.status,
        payload.adminNotes
      );
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'update_about_contact_settings') {
      if (!hasModulePermission(ctx, 'settings_control_center', 'update')) {
        return NextResponse.json(
          { success: false, errorBn: 'শুধুমাত্র অ্যাডমিন সাইট সেটিংস পরিবর্তন করতে পারেন।' },
          { status: 403 }
        );
      }
      const res = updateAboutContactPageSettings(payload.patch);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'review_manual_bkash') {
      if (!hasModulePermission(ctx, 'orders', 'update')) {
        return NextResponse.json(
          {
            success: false,
            errorBn: 'ম্যানুয়াল বিকাশ ভেরিফিকেশনের অনুমতি আপনার রোলের নেই।',
          },
          { status: 403 }
        );
      }
      const res = reviewManualBkashSubmission(ctx, {
        orderNo: payload.orderNo,
        trxId: payload.trxId,
        decision: payload.decision,
        reviewNoteBn: payload.reviewNoteBn,
      });
      if (res.success && res.submission) {
        const adminStore = readAdminStore();
        appendImmutableAuditLog(adminStore, {
          actorUserId: ctx.userId,
          actorUsername: ctx.username,
          actorRole: ctx.roleSlug,
          actionCode: `MANUAL_BKASH_${payload.decision.toUpperCase()}`,
          targetType: 'order',
          targetId: res.submission.orderNo,
          summaryBn: `অর্ডার ${res.submission.orderNo}-এর বিকাশ TrxID (${res.submission.trxId}) "${payload.decision}" হিসেবে নিষ্পত্তি হয়েছে।`,
          metadata: {
            submissionId: res.submission.submissionId,
            trxId: res.submission.trxId,
            decision: payload.decision,
          },
        });
        writeAdminStore(adminStore);
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (payload.operation === 'input_manual_mfs') {
      if (!hasModulePermission(ctx, 'orders', 'update')) {
        return NextResponse.json(
          {
            success: false,
            errorBn:
              'ম্যানুয়াল MFS পেমেন্ট ইনপুট ও ভেরিফাই করার অনুমতি আপনার রোলের নেই।',
          },
          { status: 403 }
        );
      }
      const normPhone = normalizeBdPhone(payload.senderPhone);
      if (!normPhone) {
        return NextResponse.json(
          {
            success: false,
            errorBn: 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।',
          },
          { status: 400 }
        );
      }

      const idempKey = `admin_mfs_${payload.orderNo}_${payload.trxId.trim()}`;
      const amountPoisha = Math.round(payload.amountTaka * 100);
      const subRes = submitManualBkashPayment({
        orderNo: payload.orderNo,
        senderPhone: normPhone,
        trxId: payload.trxId.trim(),
        provider: payload.provider,
        submittedAmountPoisha: amountPoisha,
        idempotencyKey: idempKey,
        submittedByRole: ctx.roleSlug,
        submittedByUsername: ctx.username,
      });

      if (!subRes.success || !subRes.submission) {
        return NextResponse.json(
          {
            success: false,
            errorBn: subRes.errorBn ?? 'MFS পেমেন্ট রেকর্ড করা যায়নি।',
          },
          { status: 400 }
        );
      }

      // If autoVerify is requested, immediately approve the submission
      if (payload.autoVerify) {
        const verifyRes = reviewManualBkashSubmission(ctx, {
          orderNo: payload.orderNo,
          trxId: payload.trxId.trim(),
          decision: 'approved',
          reviewNoteBn:
            payload.reviewNoteBn ||
            `এডমিন (${ctx.username}) দ্বারা সরাসরি ইনপুট ও অনুমোদন সম্পন্ন।`,
        });

        if (!verifyRes.success) {
          return NextResponse.json(
            {
              success: false,
              errorBn:
                verifyRes.errorBn ?? 'পেমেন্ট জমা হয়েছে তবে অনুমোদন করা যায়নি।',
              submission: subRes.submission,
            },
            { status: 400 }
          );
        }
      }

      const adminStore = readAdminStore();
      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: `MFS_INPUT_${payload.provider.toUpperCase()}`,
        targetType: 'order',
        targetId: payload.orderNo,
        summaryBn: `অর্ডার ${payload.orderNo}-এ ${payload.provider.toUpperCase()} TrxID (${payload.trxId}) দিয়ে ৳${payload.amountTaka} ইনপুট ${payload.autoVerify ? 'ও ভেরিফাই' : ''} করা হয়েছে।`,
        metadata: {
          provider: payload.provider,
          trxId: payload.trxId,
          amountTaka: payload.amountTaka,
          autoVerify: Boolean(payload.autoVerify),
        },
      });
      writeAdminStore(adminStore);

      const erp = readErpState();
      const updatedOrder = erp.orders.find((o) => o.orderNo === payload.orderNo);

      return NextResponse.json({
        success: true,
        submission: subRes.submission,
        order: updatedOrder,
        messageBn: `${payload.provider.toUpperCase()} TrxID (${payload.trxId}) সফলভাবে ${payload.autoVerify ? 'রেকর্ড ও ভেরিফাই' : 'রেকর্ড'} করা হয়েছে।`,
      });
    }

    if (payload.operation === 'resolve_customer_refund') {
      const res = resolveCustomerRefundRequest(ctx, payload);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    return NextResponse.json(
      { success: false, errorBn: 'অবৈধ অপারেশন।' },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, errorBn: 'সার্ভারে ত্রুটি ঘটেছে।' },
      { status: 500 }
    );
  }
}
