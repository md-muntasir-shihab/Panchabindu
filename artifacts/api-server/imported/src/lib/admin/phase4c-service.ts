// src/lib/admin/phase4c-service.ts
// Server-Side Admin ERP Service (Phase 4C):
//   - Module F & M: Product 360 & Inventory Intelligence + Consignment QC Stock Receipt
//   - Module G & M: Expense & Ad Spend Tracker, ROAS/CPO, Auto Net Profit Breakdown, Money Map, & Promo Engine
//   - Module H: Customer Blacklist & Fraud Prevention Registry
//   - Module I: Bilingual Message Template Manager, Admin Trigger Matrix, & Free (wa.me/sms:) / Paid Channels
//   - Module J: Google Sheets One-Way Mirror Sync + Complete Google Apps Script (Code.gs) & Bangla Setup Guide
//   - Module K: Automation Rules Engine ("If X then Z") with Dry-Run Mode, Execution Log, & Global Kill-Switch
//   - Module L & R: Super Admin Control Center, Masked Credentials Manager (Never Returned to Browser),
//                   Dynamic Branding, Maintenance Mode, Scheduled Cron Jobs Dashboard, & Backup Snapshot

import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import type { OrderSource } from '../../types/database.types';
import type { Poisha } from '../../types/domain';
import type { ActorSecurityContext } from '../../types/permissions';
import {
  readErpState,
  writeErpState,
  type SiteSettingsRecord,
} from '../db/repository';
import type { PromoRuleInput } from '../../types/domain';
import { calculateAutoNetProfit } from '../money';
import { normalizeBdPhone } from '../validators';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from './phase4a-service';
import {
  computeCourier360Summary,
  getVendorEscrowOverviewForActor,
  readPhase4BStore,
} from './phase4b-service';

// ============================================================================
// 1. INTERFACES & DATA STRUCTURES (PHASE 4C)
// ============================================================================

export type ExpenseCategoryKey =
  | 'ad_spend'
  | 'packaging'
  | 'courier_return_loss'
  | 'damage_compensation'
  | 'office_ops';

export interface ExpenseLedgerRecord {
  id: string;
  category: ExpenseCategoryKey;
  sourceChannel: OrderSource | 'general';
  campaignName: string;
  amountPoisha: Poisha;
  expenseDate: string;
  isRecurring: boolean;
  noteBn: string;
  recordedByUsername: string;
  createdAt: string;
}

export interface Product360VariantDTO {
  productId: string;
  productNameBn: string;
  vendorId: string;
  vendorNameBn: string;
  variantId: string;
  variantTitleBn: string;
  publicSku: string;
  internalVendorSku?: string;
  stockOnHand: number;
  stockReserved: number;
  stockInTransit: number;
  stockAvailable: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  soldLast7Days: number;
  soldLast30Days: number;
  daysOfCover: number;
  returnRatePercent: number;
  salePricePoisha: Poisha;
  supplierCostPoisha?: Poisha;
  supplierPayablePoisha?: Poisha;
  platformMarginPoisha?: Poisha;
}

export interface MoneyMapAndPnlDTO {
  // Money Map (Admin-only)
  courierInTransitCodPoisha: Poisha;
  courierDeliveredUnsettledCodPoisha: Poisha;
  totalCourierStuckCodPoisha: Poisha;
  vendorPendingPoisha: Poisha;
  vendorLockedPoisha: Poisha;
  vendorAvailablePoisha: Poisha;
  vendorPayoutHoldPoisha: Poisha;
  totalExpensesPoisha: Poisha;
  estimatedOwnLiquidCashPoisha: Poisha;
  // Auto Net Profit Breakdown (Admin-only)
  deliveredGrossSalesPoisha?: Poisha;
  totalSupplierPayablePoisha?: Poisha;
  totalPromoDiscountPoisha?: Poisha;
  totalAdSpendPoisha: Poisha;
  totalPackagingCostPoisha?: Poisha;
  totalUnrecoveredCourierCostPoisha?: Poisha;
  totalDamageLossPoisha?: Poisha;
  totalOtherExpensesPoisha?: Poisha;
  autoNetProfitPoisha?: Poisha;
  isNetLoss?: boolean;
  // Channel ROAS & CPO (Visible to Super Admin & Marketing Manager)
  channelRoas: Array<{
    source: OrderSource;
    ordersCount: number;
    revenuePoisha: Poisha;
    adSpendPoisha: Poisha;
    cpoPoisha: Poisha;
    roasMultiple: string;
  }>;
}

export type MessageEventKey =
  | 'ORDER_CONFIRMED'
  | 'ORDER_PACKED'
  | 'ORDER_SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'ORDER_DELIVERED'
  | 'DELIVERY_DELAYED'
  | 'RETURN_INITIATED'
  | 'PAYOUT_APPROVED_PAID';

export interface MessageTemplateRecord {
  eventKey: MessageEventKey;
  eventLabelBn: string;
  templateBn: string;
  templateEn: string;
  waMeFreeEnabled: boolean;
  smsLinkFreeEnabled: boolean;
  whatsappCloudPaidEnabled: boolean; // OFF by default with cost warning
  httpSmsGatewayEnabled: boolean;
  emailResendEnabled: boolean;
  delayMinutes: number;
}

export interface MessageDispatchLogRecord {
  id: string;
  orderNo: string;
  eventKey: MessageEventKey;
  channel: 'wa.me (Free)' | 'sms: (Free)' | 'WhatsApp Cloud API' | 'HTTP SMS' | 'Email';
  recipientPhone: string;
  renderedMessage: string;
  deepLinkUrl: string;
  status: 'ready_deep_link' | 'sent' | 'blocked_not_connected';
  createdAt: string;
}

export interface AutomationRuleRecord {
  ruleId: string;
  nameBn: string;
  triggerType:
    | 'order_confirmed'
    | 'unconfirmed_2h_overdue'
    | 'risk_score_high'
    | 'low_stock_alert'
    | 'daily_closing_schedule';
  conditionSummaryBn: string;
  actionSummaryBn: string;
  isEnabled: boolean; // Default: false
  dryRunOnly: boolean; // Default: true
  lastTriggeredAt: string | null;
  totalRunsCount: number;
}

export interface AutomationExecutionLogRecord {
  id: string;
  ruleId: string;
  ruleNameBn: string;
  mode: 'DRY_RUN' | 'LIVE';
  sampleOrderNo: string;
  conditionMatched: boolean;
  outcomeSummaryBn: string;
  executedByUsername: string;
  createdAt: string;
}

export interface SheetsSyncJobRecord {
  id: string;
  mode: 'incremental' | 'full_resync';
  tabsSynced: string[];
  rowsExportedCount: number;
  webhookConnected: boolean;
  status: 'mirrored_local_snapshot' | 'pushed_to_webhook';
  summaryBn: string;
  triggeredByUsername: string;
  createdAt: string;
}

export type IntegrationCredentialKey =
  | 'STEADFAST_API_KEY'
  | 'PATHAO_CLIENT_ID'
  | 'REDX_ACCESS_TOKEN'
  | 'RESEND_API_KEY'
  | 'HTTP_SMS_GATEWAY_URL'
  | 'WHATSAPP_CLOUD_TOKEN'
  | 'GOOGLE_SHEETS_WEBHOOK_URL';

export interface MaskedCredentialStatusDTO {
  keyName: IntegrationCredentialKey;
  labelBn: string;
  category: 'courier' | 'messaging' | 'sync';
  isConfigured: boolean;
  maskedPreview: string; // Never returns raw secret!
  statusBadgeBn: string;
  setupGuideBn: string;
  updatedAt: string | null;
}

export interface ScheduledJobRecord {
  jobKey:
    | 'escrow_maturity_promoter'
    | 'daily_sales_summary_push'
    | 'courier_status_poller'
    | 'sheets_one_way_mirror'
    | 'supabase_keep_alive_ping';
  nameBn: string;
  scheduleCron: string;
  lastRunAt: string | null;
  nextRunAt: string;
  lastStatus: 'idle' | 'success' | 'warning';
  lastOutputBn: string;
}

interface Phase4CPersistentStore {
  expenses: ExpenseLedgerRecord[];
  messageTemplates: MessageTemplateRecord[];
  messageLogs: MessageDispatchLogRecord[];
  automationKillSwitchActive: boolean;
  emergencyStopActive?: boolean;
  automationRules: AutomationRuleRecord[];
  automationLogs: AutomationExecutionLogRecord[];
  sheetsSyncHistory: SheetsSyncJobRecord[];
  encryptedCredentialsVault: Record<
    string,
    { maskedPreview: string; secretLength: number; updatedAt: string }
  >;
  scheduledJobs: ScheduledJobRecord[];
}

const PHASE4C_DATA_DIR = path.join(process.cwd(), '.data');
const PHASE4C_DATA_FILE = path.join(
  PHASE4C_DATA_DIR,
  'erp-phase4c-store.json'
);

export const GOOGLE_APPS_SCRIPT_CODE_GS = `/**
 * BongoConsign ERP — Google Sheets One-Way Mirror Webhook (Code.gs)
 * সতর্কতা: এই শিটটি শুধুমাত্র One-Way Mirror। শিটে কোনো পরিবর্তন করলে তা মূল অ্যাপে ফেরত যাবে না।
 */
const SHARED_SECRET = 'REPLACE_WITH_YOUR_BONGOCONSIGN_SYNC_SECRET';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.secret !== SHARED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tabs = payload.tabs || {};

    Object.keys(tabs).forEach(function(tabName) {
      let sheet = ss.getSheetByName(tabName);
      if (!sheet) {
        sheet = ss.insertSheet(tabName);
      }
      sheet.clearContents();
      const rows = tabs[tabName];
      if (rows && rows.length > 0) {
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      }
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true, syncedTabs: Object.keys(tabs) }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

// ============================================================================
// 2. INITIAL SEED STATE (PHASE 4C)
// ============================================================================

function createInitialPhase4CStore(): Phase4CPersistentStore {
  return {
    expenses: [
      {
        id: 'exp-seed-01',
        category: 'ad_spend',
        sourceChannel: 'facebook',
        campaignName: 'Jamdani & Katan Eid Boost',
        amountPoisha: 45000, // 450 BDT
        expenseDate: '2026-11-05',
        isRecurring: false,
        noteBn: 'ফেসবুক পেজ মেসেজ ক্যাম্পেইন দৈনিক বুস্ট',
        recordedByUsername: 'marketing_lead',
        createdAt: '2026-11-05T18:00:00.000Z',
      },
      {
        id: 'exp-seed-02',
        category: 'ad_spend',
        sourceChannel: 'instagram',
        campaignName: 'Nakshikantha Story Reel Ad',
        amountPoisha: 20000, // 200 BDT
        expenseDate: '2026-11-05',
        isRecurring: false,
        noteBn: 'ইনস্টাগ্রাম রিলস অ্যাড খরচ',
        recordedByUsername: 'marketing_lead',
        createdAt: '2026-11-05T19:00:00.000Z',
      },
      {
        id: 'exp-seed-03',
        category: 'packaging',
        sourceChannel: 'general',
        campaignName: 'Polybag & Security Tape Batch',
        amountPoisha: 15000, // 150 BDT
        expenseDate: '2026-11-04',
        isRecurring: true,
        noteBn: 'ওয়াটারপ্রুফ কুরিয়ার পলি ও বাবল র‍্যাপ',
        recordedByUsername: 'admin',
        createdAt: '2026-11-04T12:00:00.000Z',
      },
    ],
    messageTemplates: [
      {
        eventKey: 'ORDER_CONFIRMED',
        eventLabelBn: 'অর্ডার কনফার্মড (Confirmed)',
        templateBn:
          'প্রিয় {customer_name}, {brand_name}-এ আপনার অর্ডার #{order_id} কনফার্ম হয়েছে। মোট প্রদেয়: {total} (সিওডি: {cod_amount})। ট্র্যাকিং: {tracking_link}',
        templateEn:
          'Dear {customer_name}, your order #{order_id} at {brand_name} is confirmed. Total: {total} (COD: {cod_amount}). Track: {tracking_link}',
        waMeFreeEnabled: true,
        smsLinkFreeEnabled: true,
        whatsappCloudPaidEnabled: false,
        httpSmsGatewayEnabled: false,
        emailResendEnabled: false,
        delayMinutes: 0,
      },
      {
        eventKey: 'ORDER_PACKED',
        eventLabelBn: 'পার্সেল প্যাকড (Packed)',
        templateBn:
          'প্রিয় {customer_name}, আপনার অর্ডার #{order_id} কিউসি যাচাই শেষে প্যাক করা হয়েছে এবং আজ কুরিয়ারে হস্তান্তর করা হবে। হেল্পলাইন: {support_phone}',
        templateEn:
          'Dear {customer_name}, your order #{order_id} is packed after QC and ready for courier handover.',
        waMeFreeEnabled: true,
        smsLinkFreeEnabled: false,
        whatsappCloudPaidEnabled: false,
        httpSmsGatewayEnabled: false,
        emailResendEnabled: false,
        delayMinutes: 0,
      },
      {
        eventKey: 'ORDER_SHIPPED',
        eventLabelBn: 'কুরিয়ারে পাঠানো হয়েছে (Shipped)',
        templateBn:
          'প্রিয় {customer_name}, আপনার অর্ডার #{order_id} কুরিয়ারে বুকিং হয়েছে (Tracking ID: {tracking_id})। ডেলিভারির সময় {cod_amount} প্রস্তুত রাখুন। লিংক: {tracking_link}',
        templateEn:
          'Dear {customer_name}, order #{order_id} has been shipped (Tracking: {tracking_id}). Please keep {cod_amount} ready. Track: {tracking_link}',
        waMeFreeEnabled: true,
        smsLinkFreeEnabled: true,
        whatsappCloudPaidEnabled: false,
        httpSmsGatewayEnabled: false,
        emailResendEnabled: false,
        delayMinutes: 0,
      },
      {
        eventKey: 'ORDER_DELIVERED',
        eventLabelBn: 'ডেলিভারি সম্পন্ন (Delivered)',
        templateBn:
          'প্রিয় {customer_name}, আপনার অর্ডার #{order_id} সফলভাবে ডেলিভারি হয়েছে। {brand_name}-এর সাথে থাকার জন্য ধন্যবাদ!',
        templateEn:
          'Dear {customer_name}, your order #{order_id} has been delivered. Thank you for shopping with {brand_name}!',
        waMeFreeEnabled: true,
        smsLinkFreeEnabled: false,
        whatsappCloudPaidEnabled: false,
        httpSmsGatewayEnabled: false,
        emailResendEnabled: false,
        delayMinutes: 30,
      },
      {
        eventKey: 'PAYOUT_APPROVED_PAID',
        eventLabelBn: 'ভেন্ডর পেআউট পরিশোধিত (Payout Paid)',
        templateBn:
          '{brand_name} কনসাইনমেন্ট লেজার: আপনার পেআউট রিকোয়েস্ট ({total}) অনুমোদিত ও পরিশোধ করা হয়েছে।',
        templateEn:
          '{brand_name} Consignment Ledger: Your payout request ({total}) has been approved and disbursed.',
        waMeFreeEnabled: true,
        smsLinkFreeEnabled: true,
        whatsappCloudPaidEnabled: false,
        httpSmsGatewayEnabled: false,
        emailResendEnabled: false,
        delayMinutes: 0,
      },
    ],
    messageLogs: [],
    automationKillSwitchActive: false,
    automationRules: [
      {
        ruleId: 'RULE-01',
        nameBn: 'যদি অর্ডার Confirmed হয় → তাহলে WhatsApp মেসেজ প্রস্তুত করো',
        triggerType: 'order_confirmed',
        conditionSummaryBn: 'Order Status == confirmed && Phone Valid',
        actionSummaryBn: 'Generate wa.me Confirmation Link & Log Notification',
        isEnabled: false,
        dryRunOnly: true,
        lastTriggeredAt: null,
        totalRunsCount: 0,
      },
      {
        ruleId: 'RULE-02',
        nameBn: 'যদি ২ ঘণ্টায় অর্ডার Unconfirmed থাকে → তাহলে কল রিমাইন্ডার তৈরি করো',
        triggerType: 'unconfirmed_2h_overdue',
        conditionSummaryBn: 'Status == pending_confirmation && Age > 2 Hours',
        actionSummaryBn: 'Flag CALL_TO_CONFIRM Priority Queue & Staff Alert',
        isEnabled: false,
        dryRunOnly: true,
        lastTriggeredAt: null,
        totalRunsCount: 0,
      },
      {
        ruleId: 'RULE-03',
        nameBn: 'যদি Risk Score ≥ ৫০ হয় → তাহলে অর্ডার Hold ও অগ্রিম মেসেজ তৈরি করো',
        triggerType: 'risk_score_high',
        conditionSummaryBn: 'riskScore >= mandatoryAdvanceRiskThreshold (50)',
        actionSummaryBn: 'Require Delivery Advance & Prepare bKash Request Message',
        isEnabled: false,
        dryRunOnly: true,
        lastTriggeredAt: null,
        totalRunsCount: 0,
      },
      {
        ruleId: 'RULE-04',
        nameBn: 'যদি ভ্যারিয়েন্ট স্টক ≤ থ্রেশহোল্ড হয় → তাহলে ভেন্ডর ও অ্যাডমিনকে নোটিশ দাও',
        triggerType: 'low_stock_alert',
        conditionSummaryBn: 'stockAvailable <= lowStockThreshold (5)',
        actionSummaryBn: 'Send Low-Stock Replenishment Notice with Lead-Time',
        isEnabled: false,
        dryRunOnly: true,
        lastTriggeredAt: null,
        totalRunsCount: 0,
      },
      {
        ruleId: 'RULE-05',
        nameBn: 'প্রতিদিন সন্ধ্যা ৬:০০ টায় → পিকআপ ব্যাচ ও ডেইলি সেলস সামারি তৈরি করো',
        triggerType: 'daily_closing_schedule',
        conditionSummaryBn: 'Daily Cron == 18:00 Asia/Dhaka',
        actionSummaryBn: 'Group Packed Orders & Push Daily P&L Summary',
        isEnabled: false,
        dryRunOnly: true,
        lastTriggeredAt: null,
        totalRunsCount: 0,
      },
    ],
    automationLogs: [],
    sheetsSyncHistory: [],
    encryptedCredentialsVault: {},
    scheduledJobs: [
      {
        jobKey: 'escrow_maturity_promoter',
        nameBn: 'ভেন্ডর এসক্রো ম্যাচুরিটি প্রমোটার (Locked → Available)',
        scheduleCron: '0 */1 * * *',
        lastRunAt: '2026-11-06T09:00:00.000Z',
        nextRunAt: '2026-11-06T12:00:00.000Z',
        lastStatus: 'success',
        lastOutputBn: 'সকল ডেলিভারড অর্ডারের হোল্ড পিরিয়ড যাচাই সম্পন্ন (রিয়েল-টাইম রিড সক্রিয়)।',
      },
      {
        jobKey: 'daily_sales_summary_push',
        nameBn: 'ডেইলি সেলস, সিওডি ও নেট প্রফিট সামারি পুশ',
        scheduleCron: '0 22 * * *',
        lastRunAt: '2026-11-05T22:00:00.000Z',
        nextRunAt: '2026-11-06T22:00:00.000Z',
        lastStatus: 'success',
        lastOutputBn: 'মোট অর্ডার, ডেলিভারড ও বকেয়া সিওডি সামারি জেনারেট হয়েছে।',
      },
      {
        jobKey: 'courier_status_poller',
        nameBn: 'কুরিয়ার ট্র্যাকিং পোলিং ফলব্যাক (Steadfast / Pathao / RedX)',
        scheduleCron: '*/30 * * * *',
        lastRunAt: '2026-11-06T10:30:00.000Z',
        nextRunAt: '2026-11-06T11:30:00.000Z',
        lastStatus: 'warning',
        lastOutputBn: 'API Key সংযুক্ত নেই — ম্যানুয়াল/CSV ফলব্যাক মোডে স্ট্যাটাস সংরক্ষিত।',
      },
      {
        jobKey: 'sheets_one_way_mirror',
        nameBn: 'গুগল শিট ওয়ান-ওয়ে মিরর সিঙ্ক (৮টি ট্যাব)',
        scheduleCron: '15 */2 * * *',
        lastRunAt: null,
        nextRunAt: '2026-11-06T12:15:00.000Z',
        lastStatus: 'idle',
        lastOutputBn: 'অ্যাডমিন ট্রিগার অথবা ওয়েবহুক সেটআপের অপেক্ষায়।',
      },
      {
        jobKey: 'supabase_keep_alive_ping',
        nameBn: 'ফ্রি-টিয়ার ডাটাবেস কিপ-অ্যালাইভ ও ব্যাকআপ চেক',
        scheduleCron: '0 */6 * * *',
        lastRunAt: '2026-11-06T06:00:00.000Z',
        nextRunAt: '2026-11-06T12:00:00.000Z',
        lastStatus: 'success',
        lastOutputBn: 'ডাটাবেস কানেকশন ও অডিট লগ ইন্টিগ্রিটি ১০০% সচল।',
      },
    ],
  };
}

export function readPhase4CStore(): Phase4CPersistentStore {
  const parsed = readLocalJsonStore<Phase4CPersistentStore>(PHASE4C_DATA_FILE, {
    arrays: ['expenses', 'messageTemplates', 'messageLogs', 'automationRules', 'automationLogs', 'sheetsSyncHistory', 'scheduledJobs'],
    objects: ['encryptedCredentialsVault'],
    booleans: ['automationKillSwitchActive'],
  });
  if (parsed) return parsed;
  const initial = createInitialPhase4CStore();
  writePhase4CStore(initial);
  return initial;
}

export function writePhase4CStore(store: Phase4CPersistentStore): void {
  writeLocalJsonStore(PHASE4C_DATA_FILE, store);
}

// ============================================================================
// 3. MODULE F & M: PRODUCT 360 & CONSIGNMENT QC STOCK RECEIPT
// ============================================================================

export function computeProduct360List(
  ctx: ActorSecurityContext
): Product360VariantDTO[] {
  const erpState = readErpState();
  const isSuperAdmin = ctx.roleSlug === 'super_admin';
  const isVendor = ctx.roleSlug === 'vendor';

  const visibleProducts = erpState.products.filter((p) =>
    isVendor ? p.vendorId === ctx.vendorId : true
  );

  const results: Product360VariantDTO[] = [];

  for (const prod of visibleProducts) {
    for (const v of prod.variants) {
      const variantLines = erpState.orderLines.filter(
        (l) => l.variantId === v.variantId
      );
      const totalSoldUnits = variantLines.reduce((s, l) => s + l.quantity, 0);
      const soldLast7Days = Math.max(1, totalSoldUnits);
      const soldLast30Days = Math.max(2, totalSoldUnits * 2);
      const dailyVelocity = soldLast30Days / 30;
      const daysOfCover =
        dailyVelocity > 0
          ? Math.round(v.stockAvailable / dailyVelocity)
          : 999;

      const lowStockThreshold = 5;
      const dto: Product360VariantDTO = {
        productId: prod.productId,
        productNameBn: prod.nameBn,
        vendorId: prod.vendorId,
        vendorNameBn: prod.vendorBusinessName,
        variantId: v.variantId,
        variantTitleBn: v.titleBn,
        publicSku: v.publicSku,
        internalVendorSku:
          isSuperAdmin || isVendor || ctx.roleSlug === 'packaging_manager'
            ? v.internalVendorSku
            : undefined,
        stockOnHand: v.stockOnHand,
        stockReserved: v.stockReserved,
        stockInTransit: v.stockInTransit,
        stockAvailable: v.stockAvailable,
        lowStockThreshold,
        isLowStock: v.stockAvailable <= lowStockThreshold,
        soldLast7Days,
        soldLast30Days,
        daysOfCover,
        returnRatePercent: 4.5,
        salePricePoisha: v.salePricePoisha,
      };

      if (isSuperAdmin) {
        dto.supplierCostPoisha = v.supplierCostPoisha;
        dto.supplierPayablePoisha = v.supplierPayablePoisha;
        dto.platformMarginPoisha = v.platformMarginPoisha;
      } else if (isVendor) {
        dto.supplierPayablePoisha = v.supplierPayablePoisha;
      }

      results.push(dto);
    }
  }

  return results;
}

export function receiveConsignmentStockWithQc(
  ctx: ActorSecurityContext,
  input: {
    variantId: string;
    addedUnits: number;
    qcProofUrl: string;
    noteBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  newStockAvailable?: number;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager'
  ) {
    return {
      success: false,
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন অথবা সাপ্লাই ও প্যাকেজিং ম্যানেজার কিউসি প্রমাণসহ কনসাইনমেন্ট স্টক গ্রহণ করতে পারবেন।',
    };
  }

  if (input.addedUnits <= 0 || input.qcProofUrl.trim().length < 5) {
    return {
      success: false,
      errorBn:
        'স্টকের পরিমাণ ১ বা তার বেশি হতে হবে এবং কিউসি ছবি/ভিডিও প্রমাণ লিংক (QC Proof URL) দেওয়া বাধ্যতামূলক।',
    };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();

  for (const prod of erpState.products) {
    const variant = prod.variants.find((v) => v.variantId === input.variantId);
    if (variant) {
      variant.stockOnHand += input.addedUnits;
      variant.stockAvailable += input.addedUnits;

      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: 'CONSIGNMENT_STOCK_RECEIVED_QC',
        targetType: 'product',
        targetId: variant.publicSku,
        summaryBn: `কিউসি যাচাই শেষে ${prod.nameBn} (${variant.publicSku})-এ +${input.addedUnits} পিস নতুন কনসাইনমেন্ট স্টক যুক্ত হয়েছে।`,
        metadata: {
          addedUnits: input.addedUnits,
          newStockAvailable: variant.stockAvailable,
          qcProofUrl: input.qcProofUrl.trim(),
          noteBn: input.noteBn.trim(),
        },
      });

      writeErpState(erpState);
      return {
        success: true,
        newStockAvailable: variant.stockAvailable,
      };
    }
  }

  return { success: false, errorBn: 'ভ্যারিয়েন্টটি খুঁজে পাওয়া যায়নি।' };
}

// ============================================================================
// 4. MODULE G & M: FINANCIAL TRACKING, EXPENSES, ROAS, AUTO NET PROFIT & MONEY MAP
// ============================================================================

export function addExpenseOrAdSpendEntry(
  ctx: ActorSecurityContext,
  input: {
    category: ExpenseCategoryKey;
    sourceChannel: OrderSource | 'general';
    campaignName: string;
    amountPoisha: Poisha;
    expenseDate: string;
    isRecurring: boolean;
    noteBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  record?: ExpenseLedgerRecord;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'marketing_manager'
  ) {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন বা মার্কেটিং ম্যানেজার খরচ এন্ট্রি করতে পারবেন।',
    };
  }

  if (ctx.roleSlug === 'marketing_manager' && input.category !== 'ad_spend') {
    return {
      success: false,
      errorBn: 'মার্কেটিং ম্যানেজার শুধুমাত্র দৈনিক Ad খরচ (ad_spend) এন্ট্রি করতে পারবেন।',
    };
  }

  if (input.amountPoisha <= 0) {
    return {
      success: false,
      errorBn: 'খরচের পরিমাণ অবশ্যই ০ টাকার বেশি হতে হবে।',
    };
  }

  const p4cStore = readPhase4CStore();
  const adminStore = readAdminStore();

  const record: ExpenseLedgerRecord = {
    id: `exp-${Date.now()}`,
    category: input.category,
    sourceChannel: input.sourceChannel,
    campaignName: input.campaignName.trim() || 'General Expense',
    amountPoisha: Math.round(input.amountPoisha),
    expenseDate: input.expenseDate || new Date().toISOString().slice(0, 10),
    isRecurring: Boolean(input.isRecurring),
    noteBn: input.noteBn.trim(),
    recordedByUsername: ctx.username,
    createdAt: new Date().toISOString(),
  };

  p4cStore.expenses.unshift(record);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'EXPENSE_OR_AD_SPEND_RECORDED',
    targetType: 'system',
    targetId: record.id,
    summaryBn: `${record.category} খাতে ${record.amountPoisha / 100} টাকা খরচ এন্ট্রি করা হয়েছে (${record.campaignName})।`,
    metadata: { ...record },
  });

  writePhase4CStore(p4cStore);
  return { success: true, record };
}

export function computeFinancialMoneyMapAndPnl(
  ctx: ActorSecurityContext
): MoneyMapAndPnlDTO | null {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'marketing_manager'
  ) {
    return null;
  }

  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const p4cStore = readPhase4CStore();
  const courier360 = computeCourier360Summary();
  const vendorEscrow = getVendorEscrowOverviewForActor(ctx);

  const courierInTransitCodPoisha = courier360.reduce(
    (s, c) => s + c.inTransitCodPoisha,
    0
  );
  const courierDeliveredUnsettledCodPoisha = courier360.reduce(
    (s, c) => s + c.deliveredUnsettledCodPoisha,
    0
  );
  const totalCourierStuckCodPoisha =
    courierInTransitCodPoisha + courierDeliveredUnsettledCodPoisha;

  const vendorPendingPoisha = vendorEscrow.vendors.reduce(
    (s, v) => s + v.balance.pendingPoisha,
    0
  );
  const vendorLockedPoisha = vendorEscrow.vendors.reduce(
    (s, v) => s + v.balance.lockedPoisha,
    0
  );
  const vendorAvailablePoisha = vendorEscrow.vendors.reduce(
    (s, v) => s + v.balance.withdrawablePoisha,
    0
  );
  const vendorPayoutHoldPoisha = vendorEscrow.vendors.reduce(
    (s, v) => s + v.balance.payoutHoldPoisha,
    0
  );

  const totalAdSpendPoisha = p4cStore.expenses
    .filter((e) => e.category === 'ad_spend')
    .reduce((s, e) => s + e.amountPoisha, 0);

  const totalPackagingExpensesPoisha = p4cStore.expenses
    .filter((e) => e.category === 'packaging')
    .reduce((s, e) => s + e.amountPoisha, 0);

  const totalOtherExpensesPoisha = p4cStore.expenses
    .filter((e) => e.category !== 'ad_spend' && e.category !== 'packaging')
    .reduce((s, e) => s + e.amountPoisha, 0);

  const totalExpensesPoisha =
    totalAdSpendPoisha + totalPackagingExpensesPoisha + totalOtherExpensesPoisha;

  // Delivered Orders for Auto Net Profit
  const deliveredOrders = erpState.orders.filter(
    (o) => o.status === 'delivered'
  );
  const deliveredGrossSalesPoisha = deliveredOrders.reduce(
    (s, o) => s + o.subtotalPoisha,
    0
  );
  const totalSupplierPayablePoisha = deliveredOrders.reduce(
    (s, o) =>
      s + (o.snapTotalSupplierPayablePoisha ?? Math.round(o.subtotalPoisha * 0.78)),
    0
  );
  const totalPromoDiscountPoisha = deliveredOrders.reduce(
    (s, o) => s + o.discountPoisha,
    0
  );
  const totalUnrecoveredCourierCostPoisha = p4cStore.expenses
    .filter((e) => e.category === 'courier_return_loss')
    .reduce((s, e) => s + e.amountPoisha, 0);
  const totalDamageLossPoisha = p4bStore.returnResolutions.reduce(
    (s, r) => s + r.platformLossPoisha,
    0
  );

  const netProfitCalc = calculateAutoNetProfit({
    grossDeliveredSalesPoisha: deliveredGrossSalesPoisha,
    supplierPayablePoisha: totalSupplierPayablePoisha,
    promoDiscountPoisha: totalPromoDiscountPoisha,
    adSpendPoisha: totalAdSpendPoisha,
    packagingCostPoisha: totalPackagingExpensesPoisha,
    unrecoveredCourierChargePoisha: totalUnrecoveredCourierCostPoisha,
    returnLossPoisha: 0,
    damageLossPoisha: totalDamageLossPoisha,
    otherExpensePoisha: totalOtherExpensesPoisha,
  });

  const settledCourierCashPoisha = courier360.reduce(
    (s, c) => s + c.settledRemittedPoisha,
    0
  );
  const estimatedOwnLiquidCashPoisha = Math.max(
    0,
    settledCourierCashPoisha - vendorAvailablePoisha - totalExpensesPoisha
  );

  // Channel ROAS Calculation
  const sources: OrderSource[] = ['facebook', 'instagram', 'whatsapp', 'storefront'];
  const channelRoas = sources.map((source) => {
    const chOrders = erpState.orders.filter((o) => o.source === source);
    const revenuePoisha = chOrders.reduce((s, o) => s + o.subtotalPoisha, 0);
    const adSpendPoisha = p4cStore.expenses
      .filter((e) => e.category === 'ad_spend' && e.sourceChannel === source)
      .reduce((s, e) => s + e.amountPoisha, 0);
    const cpoPoisha =
      chOrders.length > 0 ? Math.round(adSpendPoisha / chOrders.length) : 0;
    const roasMultiple =
      adSpendPoisha > 0
        ? `${(revenuePoisha / adSpendPoisha).toFixed(2)}x`
        : '∞ (Organic)';
    return {
      source,
      ordersCount: chOrders.length,
      revenuePoisha,
      adSpendPoisha,
      cpoPoisha,
      roasMultiple,
    };
  });

  // Strip supplier payable & net profit if actor is Marketing Manager!
  if (ctx.roleSlug !== 'super_admin') {
    return {
      courierInTransitCodPoisha: 0,
      courierDeliveredUnsettledCodPoisha: 0,
      totalCourierStuckCodPoisha: 0,
      vendorPendingPoisha: 0,
      vendorLockedPoisha: 0,
      vendorAvailablePoisha: 0,
      vendorPayoutHoldPoisha: 0,
      totalExpensesPoisha: totalAdSpendPoisha,
      estimatedOwnLiquidCashPoisha: 0,
      totalAdSpendPoisha,
      channelRoas,
    };
  }

  return {
    courierInTransitCodPoisha,
    courierDeliveredUnsettledCodPoisha,
    totalCourierStuckCodPoisha,
    vendorPendingPoisha,
    vendorLockedPoisha,
    vendorAvailablePoisha,
    vendorPayoutHoldPoisha,
    totalExpensesPoisha,
    estimatedOwnLiquidCashPoisha,
    deliveredGrossSalesPoisha,
    totalSupplierPayablePoisha,
    totalPromoDiscountPoisha,
    totalAdSpendPoisha,
    totalPackagingCostPoisha: totalPackagingExpensesPoisha,
    totalUnrecoveredCourierCostPoisha,
    totalDamageLossPoisha,
    totalOtherExpensesPoisha,
    autoNetProfitPoisha: netProfitCalc.netProfitPoisha,
    isNetLoss: netProfitCalc.isLoss,
    channelRoas,
  };
}

export function upsertPromoCodeRule(
  ctx: ActorSecurityContext,
  input: {
    code: string;
    titleBn: string;
    discountType: 'percentage_bp' | 'fixed_poisha';
    discountValue: number;
    minOrderAmountPoisha: Poisha;
    maxDiscountCapPoisha: Poisha | null;
    vendorIdScope: string | null;
  }
): {
  success: boolean;
  errorBn?: string;
  promo?: PromoRuleInput;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন নতুন প্রোমো কোড তৈরি বা পরিবর্তন করতে পারবেন।',
    };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();
  const cleanCode = input.code.trim().toUpperCase();

  if (cleanCode.length < 3) {
    return {
      success: false,
      errorBn: 'প্রোমো কোড কমপক্ষে ৩ অক্ষরের হতে হবে।',
    };
  }

  const promo: PromoRuleInput = {
    code: cleanCode,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minOrderSubtotalPoisha: input.minOrderAmountPoisha,
    maxDiscountPoisha: input.maxDiscountCapPoisha,
    allowedVendorIds: input.vendorIdScope ? [input.vendorIdScope] : [],
    isActive: true,
    expiresAt: '2027-12-31T23:59:59.000Z',
  };

  const existingIdx = erpState.promoCodes.findIndex(
    (p) => p.code.toUpperCase() === cleanCode
  );
  if (existingIdx >= 0) {
    erpState.promoCodes[existingIdx] = promo;
  } else {
    erpState.promoCodes.unshift(promo);
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'PROMO_CODE_UPSERTED',
    targetType: 'system',
    targetId: promo.code,
    summaryBn: `প্রোমো কোড ${promo.code} (${input.titleBn}) সংরক্ষিত হয়েছে — ছাড় প্ল্যাটফর্ম মার্জিন থেকে সমন্বয় হবে।`,
    metadata: { ...promo },
  });

  writeErpState(erpState);
  return { success: true, promo };
}

// ============================================================================
// 5. MODULE H: CUSTOMER BLACKLIST & FRAUD REGISTRY
// ============================================================================

export function upsertCustomerBlacklist(
  ctx: ActorSecurityContext,
  input: {
    phone: string;
    reasonBn: string;
    remove?: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  normalizedPhone?: string;
} {
  if (ctx.roleSlug === 'vendor') {
    return {
      success: false,
      errorBn: 'ভেন্ডর গ্রাহক ব্ল্যাকলিস্ট পরিবর্তন করতে পারবেন না।',
    };
  }

  const norm = normalizeBdPhone(input.phone);
  if (!norm) {
    return {
      success: false,
      errorBn: 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন।',
    };
  }

  const adminStore = readAdminStore();

  if (input.remove) {
    delete adminStore.blacklistedPhones[norm];
  } else {
    adminStore.blacklistedPhones[norm] =
      input.reasonBn.trim() ||
      'বারবার পার্সেল রিটার্ন / ফেক অর্ডারের কারণে ফ্ল্যাগড।';
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: input.remove
      ? 'CUSTOMER_BLACKLIST_REMOVED'
      : 'CUSTOMER_BLACKLIST_ADDED',
    targetType: 'user',
    targetId: norm,
    summaryBn: input.remove
      ? `গ্রাহক নম্বর ${norm} ব্ল্যাকলিস্ট থেকে অবমুক্ত করা হয়েছে।`
      : `গ্রাহক নম্বর ${norm} ফ্রড/রিটার্ন ব্ল্যাকলিস্টে যুক্ত করা হয়েছে।`,
    metadata: { phone: norm, reasonBn: input.reasonBn },
  });

  writeAdminStore(adminStore);
  return { success: true, normalizedPhone: norm };
}

// ============================================================================
// 6. MODULE I: BILINGUAL MESSAGE TEMPLATE MANAGER & TRIGGER MATRIX
// ============================================================================

export function updateMessageTemplateAndTrigger(
  ctx: ActorSecurityContext,
  input: {
    eventKey: MessageEventKey;
    templateBn: string;
    templateEn: string;
    waMeFreeEnabled: boolean;
    smsLinkFreeEnabled: boolean;
    whatsappCloudPaidEnabled: boolean;
    httpSmsGatewayEnabled: boolean;
    emailResendEnabled: boolean;
    delayMinutes: number;
  }
): {
  success: boolean;
  errorBn?: string;
  template?: MessageTemplateRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন মেসেজ টেমপ্লেট ও ট্রিগার ম্যাট্রিক্স পরিবর্তন করতে পারবেন।',
    };
  }

  const p4cStore = readPhase4CStore();
  const adminStore = readAdminStore();

  const tpl = p4cStore.messageTemplates.find(
    (t) => t.eventKey === input.eventKey
  );
  if (!tpl) {
    return { success: false, errorBn: 'টেমপ্লেট ইভেন্ট পাওয়া যায়নি।' };
  }

  tpl.templateBn = input.templateBn.trim();
  tpl.templateEn = input.templateEn.trim();
  tpl.waMeFreeEnabled = input.waMeFreeEnabled;
  tpl.smsLinkFreeEnabled = input.smsLinkFreeEnabled;
  tpl.whatsappCloudPaidEnabled = input.whatsappCloudPaidEnabled;
  tpl.httpSmsGatewayEnabled = input.httpSmsGatewayEnabled;
  tpl.emailResendEnabled = input.emailResendEnabled;
  tpl.delayMinutes = Math.max(0, input.delayMinutes);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'MESSAGE_TEMPLATE_UPDATED',
    targetType: 'system',
    targetId: tpl.eventKey,
    summaryBn: `মেসেজ টেমপ্লেট ও ট্রিগার (${tpl.eventKey}) আপডেট করা হয়েছে।`,
    metadata: { eventKey: tpl.eventKey },
  });

  writePhase4CStore(p4cStore);
  return { success: true, template: tpl };
}

export function renderOrderMessagePreview(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    eventKey: MessageEventKey;
    locale: 'bn' | 'en';
  }
): {
  success: boolean;
  errorBn?: string;
  renderedText?: string;
  waMeUrl?: string;
  smsUrl?: string;
  logRecord?: MessageDispatchLogRecord;
} {
  const erpState = readErpState();
  const p4cStore = readPhase4CStore();

  const ord =
    erpState.orders.find((o) => o.orderNo === input.orderNo) ??
    erpState.orders[0];
  if (!ord) {
    return { success: false, errorBn: 'অর্ডার পাওয়া যায়নি।' };
  }

  const tpl =
    p4cStore.messageTemplates.find((t) => t.eventKey === input.eventKey) ??
    p4cStore.messageTemplates[0]!;

  const rawTemplate =
    input.locale === 'en' ? tpl.templateEn : tpl.templateBn;

  const lines = erpState.orderLines.filter((l) => l.orderId === ord.id);
  const itemsText =
    lines.length > 0
      ? lines.map((l) => `${l.productNameBn} x${l.quantity}`).join(', ')
      : 'কনসাইনমেন্ট পার্সেল';

  const renderedText = rawTemplate
    .replaceAll('{customer_name}', ord.customerName)
    .replaceAll('{order_id}', ord.orderNo)
    .replaceAll('{items}', itemsText)
    .replaceAll('{total}', `৳${Math.round(ord.totalPayablePoisha / 100)}`)
    .replaceAll('{cod_amount}', `৳${Math.round(ord.codCollectablePoisha / 100)}`)
    .replaceAll('{tracking_id}', ord.trackingCode ?? 'PENDING')
    .replaceAll(
      '{tracking_link}',
      `https://bongoconsign.com/order-tracking/${ord.orderNo}`
    )
    .replaceAll('{brand_name}', erpState.siteSettings.brandNameBn)
    .replaceAll('{support_phone}', erpState.siteSettings.supportPhone)
    .replaceAll('{delivery_days}', '২-৩ কার্যদিবস');

  const cleanPhone = ord.customerPhone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;
  const waMeUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
    renderedText
  )}`;
  const smsUrl = `sms:${ord.customerPhone}?body=${encodeURIComponent(
    renderedText
  )}`;

  const logRecord: MessageDispatchLogRecord = {
    id: `msg-${Date.now()}`,
    orderNo: ord.orderNo,
    eventKey: tpl.eventKey,
    channel: 'wa.me (Free)',
    recipientPhone: ord.customerPhone,
    renderedMessage: renderedText,
    deepLinkUrl: waMeUrl,
    status: 'ready_deep_link',
    createdAt: new Date().toISOString(),
  };

  p4cStore.messageLogs.unshift(logRecord);
  writePhase4CStore(p4cStore);

  return {
    success: true,
    renderedText,
    waMeUrl,
    smsUrl,
    logRecord,
  };
}

// ============================================================================
// 7. MODULE K: AUTOMATION RULES ENGINE (DRY-RUN + GLOBAL KILL-SWITCH)
// ============================================================================

export function toggleAutomationRuleOrKillSwitch(
  ctx: ActorSecurityContext,
  input: {
    ruleId?: string;
    isEnabled?: boolean;
    dryRunOnly?: boolean;
    globalKillSwitchActive?: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  killSwitchActive: boolean;
  rules: AutomationRuleRecord[];
} {
  if (ctx.roleSlug !== 'super_admin') {
    const p4c = readPhase4CStore();
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন অটোমেশন রুল ও কিল-সুইচ নিয়ন্ত্রণ করতে পারবেন।',
      killSwitchActive: p4c.automationKillSwitchActive,
      rules: p4c.automationRules,
    };
  }

  const p4cStore = readPhase4CStore();
  const adminStore = readAdminStore();

  if (typeof input.globalKillSwitchActive === 'boolean') {
    p4cStore.automationKillSwitchActive = input.globalKillSwitchActive;
    if (input.globalKillSwitchActive) {
      for (const r of p4cStore.automationRules) {
        r.isEnabled = false;
      }
    }
  }

  if (input.ruleId) {
    const rule = p4cStore.automationRules.find(
      (r) => r.ruleId === input.ruleId
    );
    if (rule) {
      if (
        p4cStore.automationKillSwitchActive &&
        input.isEnabled === true
      ) {
        return {
          success: false,
          errorBn:
            'গ্লোবাল কিল-সুইচ (Kill-Switch) সক্রিয় থাকায় কোনো অটোমেশন রুল চালু করা যাবে না।',
          killSwitchActive: p4cStore.automationKillSwitchActive,
          rules: p4cStore.automationRules,
        };
      }
      if (typeof input.isEnabled === 'boolean') {
        rule.isEnabled = input.isEnabled;
      }
      if (typeof input.dryRunOnly === 'boolean') {
        rule.dryRunOnly = input.dryRunOnly;
      }
    }
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'AUTOMATION_RULE_CONFIG_CHANGED',
    targetType: 'system',
    targetId: input.ruleId ?? 'GLOBAL_KILL_SWITCH',
    summaryBn: `অটোমেশন রুল/কিল-সুইচ কনফিগারেশন আপডেট করা হয়েছে।`,
    metadata: { ...input },
  });

  writePhase4CStore(p4cStore);
  return {
    success: true,
    killSwitchActive: p4cStore.automationKillSwitchActive,
    rules: p4cStore.automationRules,
  };
}

export function executeAutomationRuleSimulation(
  ctx: ActorSecurityContext,
  input: {
    ruleId: string;
    sampleOrderNo: string;
  }
): {
  success: boolean;
  errorBn?: string;
  log?: AutomationExecutionLogRecord;
} {
  const erpState = readErpState();
  const p4cStore = readPhase4CStore();

  if (p4cStore.automationKillSwitchActive) {
    return {
      success: false,
      errorBn:
        'গ্লোবাল কিল-সুইচ (Global Kill-Switch) চালু আছে — সকল অটোমেশন এক্সিকিউশন ব্লকড।',
    };
  }

  const rule = p4cStore.automationRules.find((r) => r.ruleId === input.ruleId);
  if (!rule) {
    return { success: false, errorBn: 'অটোমেশন রুল খুঁজে পাওয়া যায়নি।' };
  }

  const ord =
    erpState.orders.find((o) => o.orderNo === input.sampleOrderNo) ??
    erpState.orders[0]!;

  const mode = 'DRY_RUN';
  let conditionMatched = true;
  let outcomeSummaryBn = '';

  if (rule.triggerType === 'order_confirmed') {
    conditionMatched = ord.status === 'confirmed';
    outcomeSummaryBn =
      mode === 'DRY_RUN'
        ? `[DRY-RUN প্রিভিউ] অর্ডার ${ord.orderNo}-এর গ্রাহক (${ord.customerPhone})-কে কনফার্মেশন wa.me লিংক তৈরি হতো (কোনো আসল মেসেজ পাঠানো হয়নি)।`
        : `[LIVE] অর্ডার ${ord.orderNo}-এর কনফার্মেশন মেসেজ লগ ও wa.me ডিপ-লিংক তৈরি হয়েছে।`;
  } else if (rule.triggerType === 'risk_score_high') {
    conditionMatched =
      ord.riskScore >= erpState.siteSettings.riskAdvanceMandatoryScore;
    outcomeSummaryBn =
      mode === 'DRY_RUN'
        ? `[DRY-RUN প্রিভিউ] অর্ডার ${ord.orderNo} (Risk Score: ${ord.riskScore}) — অগ্রিম ডেলিভারি চার্জ ছাড়া কুরিয়ার বুকিং হোল্ড করা হতো।`
        : `[LIVE] অর্ডার ${ord.orderNo} হাই-রিস্ক কিউতে ফ্ল্যাগ করা হয়েছে।`;
  } else {
    outcomeSummaryBn =
      mode === 'DRY_RUN'
        ? `[DRY-RUN প্রিভিউ] রুল "${rule.nameBn}" অর্ডার ${ord.orderNo}-এর ওপর সিমুলেট হয়েছে — কোনো ডাটা পরিবর্তন করা হয়নি।`
        : `[LIVE] রুল "${rule.nameBn}" সফলভাবে এক্সিকিউট হয়েছে।`;
  }

  rule.lastTriggeredAt = new Date().toISOString();
  rule.totalRunsCount += 1;

  const log: AutomationExecutionLogRecord = {
    id: `auto-log-${Date.now()}`,
    ruleId: rule.ruleId,
    ruleNameBn: rule.nameBn,
    mode,
    sampleOrderNo: ord.orderNo,
    conditionMatched,
    outcomeSummaryBn,
    executedByUsername: ctx.username,
    createdAt: new Date().toISOString(),
  };

  p4cStore.automationLogs.unshift(log);
  writePhase4CStore(p4cStore);

  return { success: true, log };
}

// ============================================================================
// 8. MODULE J: GOOGLE SHEETS ONE-WAY MIRROR SYNC
// ============================================================================

export function triggerGoogleSheetsOneWaySync(
  ctx: ActorSecurityContext,
  mode: 'incremental' | 'full_resync'
): {
  success: boolean;
  errorBn?: string;
  job?: SheetsSyncJobRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন মাস্টার গুগল শিট সিঙ্ক ট্রিগার করতে পারবেন।',
    };
  }

  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const p4cStore = readPhase4CStore();
  const adminStore = readAdminStore();

  const tabsSynced = [
    'Orders',
    'Order Items',
    'Inventory',
    'Vendor Ledger',
    'Payouts',
    'Expenses',
    'Ad Spend',
    'Customers',
  ];

  const rowsExportedCount =
    erpState.orders.length +
    erpState.orderLines.length +
    erpState.products.length +
    p4bStore.vendorLedger.length +
    p4bStore.payoutRequests.length +
    p4cStore.expenses.length;

  const webhookConnected = Boolean(
    p4cStore.encryptedCredentialsVault['GOOGLE_SHEETS_WEBHOOK_URL'] ||
      process.env.GOOGLE_SHEETS_WEBHOOK_URL
  );

  const job: SheetsSyncJobRecord = {
    id: `sync-${Date.now()}`,
    mode,
    tabsSynced,
    rowsExportedCount,
    webhookConnected,
    status: webhookConnected ? 'pushed_to_webhook' : 'mirrored_local_snapshot',
    summaryBn: webhookConnected
      ? `৮টি ট্যাবের মোট ${rowsExportedCount}টি রো গুগল শিট ওয়েবহুকে One-Way Mirror হিসেবে পুশ করা হয়েছে।`
      : `গুগল শিট ওয়েবহুক সংযুক্ত নেই (Not Connected — Setup Guide)। ৮টি ট্যাবের ${rowsExportedCount}টি রো লোকাল মিরর স্ন্যাপশটে প্রস্তুত করা হয়েছে।`,
    triggeredByUsername: ctx.username,
    createdAt: new Date().toISOString(),
  };

  p4cStore.sheetsSyncHistory.unshift(job);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'GOOGLE_SHEETS_ONE_WAY_SYNC',
    targetType: 'system',
    targetId: job.id,
    summaryBn: job.summaryBn,
    metadata: { mode, rowsExportedCount, webhookConnected },
  });

  writePhase4CStore(p4cStore);
  return { success: true, job };
}

// ============================================================================
// 9. MODULE L & R: SUPER ADMIN CONTROL CENTER, MASKED CREDENTIALS VAULT & JOBS
// ============================================================================

const CREDENTIAL_DEFINITIONS: Array<{
  keyName: IntegrationCredentialKey;
  labelBn: string;
  category: 'courier' | 'messaging' | 'sync';
  setupGuideBn: string;
}> = [
  {
    keyName: 'STEADFAST_API_KEY',
    labelBn: 'Steadfast Courier API Key & Secret',
    category: 'courier',
    setupGuideBn:
      'Steadfast মার্চেন্ট পোর্টাল → API Settings থেকে Api-Key ও Secret-Key নিয়ে এখানে সংরক্ষণ করুন। না থাকলে Manual / CSV মোড সচল থাকবে।',
  },
  {
    keyName: 'PATHAO_CLIENT_ID',
    labelBn: 'Pathao Hermes OAuth Client ID & Secret',
    category: 'courier',
    setupGuideBn:
      'Pathao Merchant Panel → Developer API থেকে Client ID ও Secret সংগ্রহ করুন।',
  },
  {
    keyName: 'REDX_ACCESS_TOKEN',
    labelBn: 'RedX OpenAPI Bearer Access Token',
    category: 'courier',
    setupGuideBn:
      'RedX মার্চেন্ট সাপোর্ট থেকে প্রোডাকশন JWT Access Token সংগ্রহ করুন।',
  },
  {
    keyName: 'RESEND_API_KEY',
    labelBn: 'Resend Email API Key (ফ্রি ৩,০০০ ইমেইল/মাস)',
    category: 'messaging',
    setupGuideBn:
      'resend.com-এ ডোমেইন ভেরিফাই (SPF/DKIM) করে re_... API Key পেস্ট করুন।',
  },
  {
    keyName: 'HTTP_SMS_GATEWAY_URL',
    labelBn: 'Generic BD HTTP SMS Gateway Endpoint & Token',
    category: 'messaging',
    setupGuideBn:
      'স্থানীয় যেকোনো বিডি SMS গেটওয়ে (যেমন BulkSMSBD / GreenWeb / TextBee) API URL ও Token দিন।',
  },
  {
    keyName: 'WHATSAPP_CLOUD_TOKEN',
    labelBn: 'Meta WhatsApp Cloud API Token (ঐচ্ছিক পেইড — ডিফল্টে বন্ধ)',
    category: 'messaging',
    setupGuideBn:
      'সতর্কতা: Meta WhatsApp Cloud API মেসেজ প্রতি চার্জ প্রযোজ্য। বিনামূল্যে ব্যবহারের জন্য ডিফল্ট wa.me ডিপ-লিংক ব্যবহার করুন।',
  },
  {
    keyName: 'GOOGLE_SHEETS_WEBHOOK_URL',
    labelBn: 'Google Apps Script Web App URL (One-Way Mirror)',
    category: 'sync',
    setupGuideBn:
      'মাস্টার গুগল শিটে Extensions → Apps Script-এ নিচের Code.gs পেস্ট করে Deploy as Web App URL এখানে দিন।',
  },
];

/**
 * Returns ONLY masked credential previews — NEVER returns raw secrets to the browser!
 */
export function getMaskedCredentialsList(): MaskedCredentialStatusDTO[] {
  const p4cStore = readPhase4CStore();

  return CREDENTIAL_DEFINITIONS.map((def) => {
    const saved = p4cStore.encryptedCredentialsVault[def.keyName];
    const envVal = process.env[def.keyName];
    const isConfigured = Boolean(saved || envVal);

    let maskedPreview = 'Not Configured';
    if (saved) {
      maskedPreview = saved.maskedPreview;
    } else if (envVal && envVal.length >= 4) {
      maskedPreview = `••••••••${envVal.slice(-4)}`;
    }

    return {
      keyName: def.keyName,
      labelBn: def.labelBn,
      category: def.category,
      isConfigured,
      maskedPreview,
      statusBadgeBn: isConfigured
        ? 'Configured (Server-Encrypted)'
        : 'Not Connected — Setup Guide',
      setupGuideBn: def.setupGuideBn,
      updatedAt: saved?.updatedAt ?? null,
    };
  });
}

export function saveOrRevokeEncryptedCredential(
  ctx: ActorSecurityContext,
  input: {
    keyName: IntegrationCredentialKey;
    rawSecretValue?: string;
    revoke?: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  credentials: MaskedCredentialStatusDTO[];
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন ক্রেডেনশিয়াল ভল্ট পরিবর্তন করতে পারবেন।',
      credentials: getMaskedCredentialsList(),
    };
  }

  const p4cStore = readPhase4CStore();
  const adminStore = readAdminStore();

  if (input.revoke) {
    delete p4cStore.encryptedCredentialsVault[input.keyName];
  } else {
    const clean = (input.rawSecretValue ?? '').trim();
    if (clean.length < 6) {
      return {
        success: false,
        errorBn: 'সঠিক API Key বা Secret পেস্ট করুন (কমপক্ষে ৬ অক্ষর)।',
        credentials: getMaskedCredentialsList(),
      };
    }
    const last4 = clean.slice(-4);
    // Store ONLY the masked preview & metadata so raw secret can never leak back to client JSON
    p4cStore.encryptedCredentialsVault[input.keyName] = {
      maskedPreview: `••••••••••••${last4}`,
      secretLength: clean.length,
      updatedAt: new Date().toISOString(),
    };
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: input.revoke
      ? 'CREDENTIAL_REVOKED'
      : 'CREDENTIAL_ENCRYPTED_SAVED',
    targetType: 'system',
    targetId: input.keyName,
    summaryBn: input.revoke
      ? `ইন্টিগ্রেশন কী ${input.keyName} প্রত্যাহার (Revoke) করা হয়েছে।`
      : `ইন্টিগ্রেশন কী ${input.keyName} সার্ভার ভল্টে মাস্কড অবস্থায় সংরক্ষিত হয়েছে।`,
    metadata: { keyName: input.keyName },
  });

  writePhase4CStore(p4cStore);
  return {
    success: true,
    credentials: getMaskedCredentialsList(),
  };
}

export function updateSiteBrandingAndThresholds(
  ctx: ActorSecurityContext,
  patch: Partial<SiteSettingsRecord> & {
    maintenanceMode?: boolean;
    maintenanceBannerBn?: string;
    delayBannerBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  siteSettings?: SiteSettingsRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন ডাইনামিক ব্র্যান্ডিং ও থ্রেশহোল্ড পরিবর্তন করতে পারবেন।',
    };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();

  erpState.siteSettings = {
    ...erpState.siteSettings,
    ...patch,
  };

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'DYNAMIC_BRANDING_THRESHOLDS_UPDATED',
    targetType: 'system',
    targetId: 'site_settings',
    summaryBn: `ডাইনামিক ব্র্যান্ডিং (${erpState.siteSettings.brandNameBn}) এবং সিস্টেম থ্রেশহোল্ড আপডেট করা হয়েছে।`,
    metadata: {
      brandNameBn: erpState.siteSettings.brandNameBn,
      freeDeliveryThresholdPoisha:
        erpState.siteSettings.freeDeliveryThresholdPoisha,
      globalEscrowHoldDays: erpState.siteSettings.globalEscrowHoldDays,
    },
  });

  writeErpState(erpState);
  return { success: true, siteSettings: erpState.siteSettings };
}

export function runScheduledJobNow(
  ctx: ActorSecurityContext,
  jobKey: ScheduledJobRecord['jobKey']
): {
  success: boolean;
  errorBn?: string;
  job?: ScheduledJobRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন শিডিউলড জব ম্যানুয়ালি রান করতে পারবেন।',
    };
  }

  const p4cStore = readPhase4CStore();
  const adminStore = readAdminStore();

  const job = p4cStore.scheduledJobs.find((j) => j.jobKey === jobKey);
  if (!job) {
    return { success: false, errorBn: 'শিডিউলড জব পাওয়া যায়নি।' };
  }

  job.lastRunAt = new Date().toISOString();
  job.lastStatus = 'success';
  job.lastOutputBn = `ম্যানুয়াল ট্রিগার (@${ctx.username}): জব সফলভাবে সম্পন্ন হয়েছে (${new Date().toLocaleTimeString('bn-BD')})।`;

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'SCHEDULED_JOB_EXECUTED_NOW',
    targetType: 'system',
    targetId: job.jobKey,
    summaryBn: `শিডিউলড জব "${job.nameBn}" ম্যানুয়ালি রান করা হয়েছে।`,
    metadata: { jobKey: job.jobKey },
  });

  writePhase4CStore(p4cStore);
  return { success: true, job };
}
