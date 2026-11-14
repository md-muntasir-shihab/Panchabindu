'use client';
import { localizedField } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';
import { uiText } from '@/lib/i18n/ui-text';


// src/components/admin/admin-erp-client.tsx
// Phase 4A: Multi-Vendor Consignment Admin ERP Workspace
//   - Strict Login Screen (Username + Password + 6-Digit TOTP 2FA + 5-Attempt Lockout)
//   - Forced First-Login Password Rotation & TOTP 2FA Enrollment Gate
//   - Module M: Today Operational Command Screen (Role-Aware 1-Tap Queues)
//   - Module N: Orders Grid — One-Click Action System (Row + Bulk Actions, Next Best Action Chips, Mobile Bottom Sheet)
//   - Module A: Smart Order Entry (Live Phone History/Fraud Check, 24h Duplicate Guard, Profit-at-Entry, Stock Safety)
//   - Module P & RBAC: User Management (One-Time Temp Password + WhatsApp Share), 2FA Reset, Custom Role Matrix, & Immutable Audit Logs

import * as React from 'react';
import { Link } from 'wouter';
import { adminApiRequest, type AdminFetchOptions } from '@/lib/admin/admin-fetch';

/**
 * Custom API request wrapper for Admin ERP dashboard.
 * Wraps 'fetch' calls internally to inject session/CSRF authentication headers
 * and handle request/response logging, preventing the runtime TypeError:
 * 'Cannot set property fetch of #<Window> which has only a getter'.
 */
const customApiRequest = (
  input: RequestInfo | URL,
  init?: AdminFetchOptions
): Promise<Response> => {
  return adminApiRequest(input, init);
};

// Internal API client reference — replaces any window.fetch overrides
const fetch = customApiRequest;
import {
  ShieldCheck,
  Lock,
  LogOut,
  ClipboardList,
  PlusCircle,
  Users,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  MessageSquare,
  Truck,
  MapPin,
  Search,
  Check,
  Copy,
  RefreshCw,
  FileText,
  KeyRound,
  Eye,
  Package,
  Store,
  Printer,
  Wallet,
  Banknote,
  TrendingUp,
  Zap,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Menu,
  ExternalLink,
  PhoneMissed,
  XSquare,
  Trash2,
  Plus,
  Minus,
  Send,
  Bell,
  CheckCheck,
  Filter,
  Download,
  ArrowUpRight,
} from 'lucide-react';
import type {
  CourierProvider,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/types/database.types';
import type {
  NextBestActionCode,
  OrderGridRowDTO,
} from '@/types/domain';
import type {
  PermissionModuleKey,
  SystemRoleSlug,
} from '@/types/permissions';
import type {
  ImmutableAuditLogRecord,
  RoleDefinitionRecord,
  SanitizedAdminUserDTO,
} from '@/lib/admin/phase4a-service';
import { getLiveCourierTrackingUrl } from '@/lib/courier/tracking-urls';
import type {
  Courier360ProviderSummary,
  CourierClaimRecord,
  CourierRemittanceLedgerRecord,
  DistrictRateOverrideRecord,
  ImmutableVendorLedgerRecord,
  PickupBatchRecord,
  PrintTemplateConfig,
  ReturnResolutionRecord,
  VendorPayoutRequestRecord,
  VendorProfileRecord,
} from '@/lib/admin/phase4b-service';
import type {
  AutomationExecutionLogRecord,
  AutomationRuleRecord,
  ExpenseLedgerRecord,
  MaskedCredentialStatusDTO,
  MessageDispatchLogRecord,
  MessageTemplateRecord,
  MoneyMapAndPnlDTO,
  Product360VariantDTO,
  ScheduledJobRecord,
  SheetsSyncJobRecord,
} from '@/lib/admin/phase4c-service';
import type {
  AboutContactPageSettings,
  CategoryRecord,
  CustomerInquiryRecord,
  InternalProductRecord,
  SiteSettingsRecord,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import type { PromoRuleInput, VendorEscrowBalance } from '@/types/domain';
import {
  BD_DISTRICTS,
  getDistrictById,
  getDistrictDeliveryRates,
  getThanasByDistrict,
} from '@/lib/geo/bd-geocode';
import {
  calculateDeliveryCharge,
  formatPoishaToBdt,
} from '@/lib/money';
import {
  evaluateAddressQuality,
  normalizeBdPhone,
} from '@/lib/validators';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';
import { Badge, Button, Card, EmptyState, InfoTooltip, Input } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { PrintEnginePanel } from './print-engine-panel';
import { ContactManagementPanel } from './contact-management-panel';
import {
  Courier360AndRatesPanel,
  VendorEscrowAndReturnPanel,
} from './courier-and-escrow-panel';
import { VendorControlPanel } from './vendor-control-panel';
import { VendorPayoutRegisterPanel } from './vendor-payout-register-panel';
import {
  FinanceProduct360AndExpensesPanel,
  MessagingAutomationAndSheetsPanel,
  SuperAdminControlCenterPanel,
} from './phase4c-panels';
import { Phase5ReadinessPanel } from './phase5-readiness-panel';
import type {
  ConsignmentLifecycleDryRunDTO,
  Phase5AuditReportDTO,
  RoleSanitizationInspectionDTO,
} from '@/lib/admin/phase5-service';
import { Phase6LiveOpsPanel } from './phase6-ops-panel';
import type { Phase6WorkspaceOverviewDTO } from '@/lib/admin/phase6-service';
import { Phase7PortalPanel } from './phase7-portal-panel';
import type { Phase7WorkspaceOverviewDTO } from '@/lib/admin/phase7-service';
import { ProductManagementStudioPanel } from './product-studio-panel';
import { OperationalHelpModal } from './operational-help-modal';

export interface AdminErpClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
}

export type AdminTabKey =
  | 'today_screen'
  | 'orders_grid'
  | 'smart_order_entry'
  | 'print_engine'
  | 'courier_360'
  | 'vendor_escrow'
  | 'product_studio'
  | 'finance_product360'
  | 'messaging_automation'
  | 'contact_management'
  | 'control_center'
  | 'users_and_rbac'
  | 'phase5_readiness'
  | 'phase6_ops'
  | 'phase7_portal'
  | 'vendor_control'
  | 'vendor_payouts';

type EnrichedOrderRow = Partial<OrderGridRowDTO> & {
  callAttempts: number;
  callStatus?:
    | 'pending'
    | 'confirmed_yes'
    | 'not_answered_busy'
    | 'cancelled_no'
    | 'call_back_requested';
  callStatusNote?: string;
  internalStaffNote?: string;
  items?: Array<{
    productId: string;
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    quantity: number;
    unitSalePricePoisha: number;
    lineSubtotalPoisha: number;
  }>;
};

interface WorkspaceSnapshotResponse {
  siteSettings?: SiteSettingsRecord;
  authorized: boolean;
  requiresFirstLoginGate?: boolean;
  errorBn?: string;
  currentUser?: SanitizedAdminUserDTO;
  activeRole?: RoleDefinitionRecord;
  orders?: EnrichedOrderRow[];
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
  printConfig?: PrintTemplateConfig;
  districtRates?: DistrictRateOverrideRecord[];
  courier360?: Courier360ProviderSummary[];
  pickupBatches?: PickupBatchRecord[];
  remittanceLedger?: CourierRemittanceLedgerRecord[];
  courierClaims?: CourierClaimRecord[];
  vendorEscrow?: {
    vendors: Array<{
      profile: VendorProfileRecord;
      balance: VendorEscrowBalance;
    }>;
    ledgerEntries: ImmutableVendorLedgerRecord[];
    payoutRequests: VendorPayoutRequestRecord[];
    returnResolutions: ReturnResolutionRecord[];
  };
  product360?: Product360VariantDTO[];
  moneyMapPnl?: MoneyMapAndPnlDTO | null;
  expenses?: ExpenseLedgerRecord[];
  promoCodes?: PromoRuleInput[];
  blacklistedPhones?: Record<
    string,
    string | { reasonBn: string; blacklistedAt?: string }
  >;
  messageTemplates?: MessageTemplateRecord[];
  messageLogs?: MessageDispatchLogRecord[];
  automationKillSwitchActive?: boolean;
  automationRules?: AutomationRuleRecord[];
  automationLogs?: AutomationExecutionLogRecord[];
  sheetsSyncHistory?: SheetsSyncJobRecord[];
  maskedCredentials?: MaskedCredentialStatusDTO[];
  scheduledJobs?: ScheduledJobRecord[];
  phase5Audit?: Phase5AuditReportDTO | null;
  phase5RoleInspection?: RoleSanitizationInspectionDTO | null;
  phase5LifecycleDryRun?: ConsignmentLifecycleDryRunDTO | null;
  phase6Overview?: Phase6WorkspaceOverviewDTO | null;
  phase7Overview?: Phase7WorkspaceOverviewDTO | null;
  categories?: CategoryRecord[];
  vendors?: VendorProfileRecord[];
  inquiries?: CustomerInquiryRecord[];
  aboutContactPage?: AboutContactPageSettings;
}

const NEXT_ACTION_LABELS: Record<
  NextBestActionCode,
  { bn: string; en: string; status: 'warning' | 'danger' | 'info' | 'success' | 'neutral' }
> = {
  CALL_TO_CONFIRM: {
    bn: 'কল করে কনফার্ম করুন',
    en: 'Call to Confirm',
    status: 'warning',
  },
  FIX_ADDRESS: {
    bn: 'ঠিকানা সংশোধন প্রয়োজন',
    en: 'Fix Address',
    status: 'danger',
  },
  COLLECT_MANDATORY_ADVANCE: {
    bn: 'বাধ্যতামূলক অগ্রিম নিন',
    en: 'Collect Advance',
    status: 'danger',
  },
  VERIFY_BKASH_TRX: {
    bn: 'বিকাশ TrxID যাচাই করুন',
    en: 'Verify bKash Trx',
    status: 'warning',
  },
  READY_TO_PACK: {
    bn: 'প্যাকিংয়ের জন্য প্রস্তুত',
    en: 'Ready to Pack',
    status: 'info',
  },
  READY_TO_BOOK_COURIER: {
    bn: 'কুরিয়ার বুকিং বাকি',
    en: 'Ready to Book',
    status: 'info',
  },
  HANDOVER_TO_COURIER: {
    bn: 'কুরিয়ারে হস্তান্তর করুন',
    en: 'Handover to Courier',
    status: 'info',
  },
  SHIP_OVERDUE: {
    bn: 'শিপমেন্ট বিলম্বিত',
    en: 'Ship Overdue',
    status: 'danger',
  },
  AWAITING_COD_REMITTANCE: {
    bn: 'সিওডি রেমিট্যান্স বাকি',
    en: 'COD Unsettled',
    status: 'warning',
  },
  PROCESS_PENDING_RETURN: {
    bn: 'রিটার্ন যাচাই বাকি',
    en: 'Return Pending',
    status: 'danger',
  },
  COMPLETED: {
    bn: 'সম্পন্ন',
    en: 'Completed',
    status: 'success',
  },
};

function getCourierTrackingUrl(
  provider?: CourierProvider | null,
  trackingCode?: string | null,
  consignmentId?: string | null,
  orderNo?: string | null
): string {
  if (!trackingCode && !consignmentId) {
    return orderNo ? `/order-tracking?orderNo=${orderNo}` : '#';
  }
  const code = trackingCode ?? consignmentId ?? '';
  switch (provider) {
    case 'steadfast':
      return `https://steadfast.com.bd/t/${encodeURIComponent(code)}`;
    case 'pathao':
      return `https://pathao.com/courier/tracking/?consignment_id=${encodeURIComponent(consignmentId ?? code)}`;
    case 'redx':
      return `https://redx.com.bd/track/${encodeURIComponent(code)}`;
    case 'bd_post':
      return `https://www.bdpost.gov.bd/tracking?id=${encodeURIComponent(code)}`;
    default:
      return orderNo ? `/order-tracking?orderNo=${orderNo}` : '#';
  }
}

function getCourierProviderBadgeStyle(provider?: CourierProvider | null): {
  bg: string;
  label: string;
} {
  switch (provider) {
    case 'steadfast':
      return { bg: 'bg-slate-900 text-white', label: 'Steadfast' };
    case 'pathao':
      return { bg: 'bg-rose-600 text-white', label: 'Pathao' };
    case 'redx':
      return { bg: 'bg-red-600 text-white', label: 'RedX' };
    case 'bd_post':
      return { bg: 'bg-emerald-700 text-white', label: 'ডাক বিভাগ' };
    default:
      return { bg: 'bg-slate-700 text-white', label: 'ম্যানুয়াল / লোকাল' };
  }
}

// ---------------------------------------------------------------------------
// Order state-machine guard (mirrors ORDER_STATE_MACHINE_RULES on the server)
// ---------------------------------------------------------------------------
// The server rejects an illegal transition with a 400 and the whole row update
// silently fails. Mirroring the legal edges here lets the grid offer only the
// statuses that can actually be reached, so a click is never a dead end.
const ORDER_TRANSITION_EDGES: Record<string, readonly string[]> = {
  pending_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'return_initiated'],
  out_for_delivery: ['delivered', 'return_initiated'],
  delivered: ['returned', 'return_initiated'],
  return_initiated: ['returned'],
  returned: [],
  cancelled: [],
};

const ORDER_STATUS_LABEL_BN: Record<string, string> = {
  pending_confirmation: 'কল বাকি (Pending)',
  confirmed: 'কনফার্মড',
  packed: 'প্যাকড',
  shipped: 'শিপড',
  out_for_delivery: 'ডেলিভারি চলছে',
  delivered: 'ডেলিভার্ড',
  return_initiated: 'রিটার্ন শুরু',
  returned: 'রিটার্নড',
  cancelled: 'বাতিল',
};

function allowedTransitionsFrom(status: string | undefined): readonly string[] {
  return ORDER_TRANSITION_EDGES[status ?? ''] ?? [];
}

function OrderStatusSolidButton({
  ord,
  onAction,
  locale,
  onOpenMfsModal,
  onRequestTracking,
}: {
  ord: Partial<OrderGridRowDTO> & {
    callAttempts?: number;
    callStatus?: 'pending' | 'confirmed_yes' | 'not_answered_busy' | 'cancelled_no' | 'call_back_requested';
    internalStaffNote?: string;
  };
  onAction: (payload: {
    orderNos: string[];
    actionType:
      | 'update_status'
      | 'fix_address'
      | 'verify_bkash'
      | 'book_courier'
      | 'log_call_attempt'
      | 'log_call_status'
      | 'add_staff_note'
      | 'attach_tracking';
    newStatus?: OrderStatus;
    courierProvider?: CourierProvider;
    callStatus?: 'pending' | 'confirmed_yes' | 'not_answered_busy' | 'cancelled_no' | 'call_back_requested';
    callStatusNote?: string;
    staffNote?: string;
    trackingCode?: string;
    consignmentId?: string;
    selfApprovalOverrideReasonBn?: string;
  }) => Promise<void>;
  locale: 'bn' | 'en';
  onOpenMfsModal?: (ord: any) => void;
  /** Opens the order edit sheet focused on the courier/tracking fields. */
  onRequestTracking?: (ord: any) => void;
}) {
  const status = ord.status ?? 'pending_confirmation';
  const attempts = ord.callAttempts ?? 0;
  const [showVerifyPopover, setShowVerifyPopover] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [copiedTrx, setCopiedTrx] = React.useState(false);
  /** Written to the audit log when a super admin verifies their own entry. */
  const [verifyNote, setVerifyNote] = React.useState('');
  const [trackingDraft, setTrackingDraft] = React.useState('');

  const isTrxPending =
    Boolean(ord.manualPaymentTrxId) &&
    ord.paymentStatus !== 'paid_verified' &&
    ord.paymentStatus !== 'partial_verified';

  const mfsProviderLabel =
    ord.paymentMethod === 'nagad_manual'
      ? 'নগদ'
      : ord.paymentMethod === 'rocket_manual'
      ? 'রকেট'
      : 'বিকাশ';

  const advanceAmountPoisha = Math.max(
    0,
    (ord.totalPayablePoisha ?? 0) - (ord.codCollectablePoisha ?? 0)
  ) || (ord.advancePaidPoisha ?? 0);

  if (status === 'pending_confirmation') {
    return (
      <div className="space-y-1 relative">
        {/* Inline TrxID Badge */}
        {ord.manualPaymentTrxId ? (
          <div className="flex items-center justify-between gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 font-medium">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-[9px] uppercase px-1 py-0.2 rounded bg-amber-600/20 text-amber-700 dark:text-amber-400">
                {mfsProviderLabel}
              </span>
              <span className="font-mono text-ink truncate select-all">
                {ord.manualPaymentTrxId}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className={`text-[9px] font-bold ${
                  isTrxPending ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {isTrxPending ? 'যাচাই বাকি' : '✓ ভেরিফাইড'}
              </span>
              {onOpenMfsModal && (
                <button
                  type="button"
                  onClick={() => onOpenMfsModal(ord)}
                  title={uiText("MFS তথ্য এডিট / পরিবর্তন", locale)}
                  className="p-0.5 hover:text-ink text-muted cursor-pointer"
                >
                  <Wallet className="w-2.5 h-2.5 text-amber-700 dark:text-amber-400" />
                </button>
              )}
            </div>
          </div>
        ) : onOpenMfsModal ? (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => onOpenMfsModal(ord)}
              className="text-[10px] text-muted hover:text-amber-700 dark:hover:text-amber-400 flex items-center gap-0.5 cursor-pointer font-medium"
              title={uiText("অগ্রিম কুরিয়ার চার্জ বা MFS পেমেন্ট TrxID যোগ করুন", locale)}
            >
              <Wallet className="w-2.5 h-2.5" />
              <span><LocalizedText source={"+ MFS TrxID"} area="admin" /></span>
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-1 w-full">
          <button
            type="button"
            onClick={() => {
              if (isTrxPending) {
                setShowVerifyPopover(true);
              } else {
                void onAction({
                  orderNos: [ord.orderNo!],
                  actionType: 'log_call_status',
                  callStatus: 'confirmed_yes',
                });
              }
            }}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-[var(--radius-sm)] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer select-none"
            title={
              isTrxPending
                ? 'TrxID ও অগ্রিম কুরিয়ার চার্জ যাচাই করে কনফার্ম করুন'
                : 'গ্রাহক ফোনে নিশ্চিত করেছেন — কনফার্ম করুন'
            }
          >
            <Check className="w-3 h-3" />
            <span><LocalizedText source={"হ্যাঁ (Confirm)"} area="admin" /></span>
          </button>
          <button
            type="button"
            onClick={() => {
              void onAction({
                orderNos: [ord.orderNo!],
                actionType: 'log_call_status',
                callStatus: 'not_answered_busy',
              });
            }}
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-[var(--radius-sm)] bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer select-none"
            title={uiText("কল রিসিভ হয়নি বা ব্যস্ত — চেষ্টা রেকর্ড করুন", locale)}
          >
            <PhoneMissed className="w-3 h-3" />
            <span><LocalizedText source={"ব্যস্ত"} area="admin" />{attempts > 0 ? ` (${attempts})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void onAction({
                orderNos: [ord.orderNo!],
                actionType: 'log_call_status',
                callStatus: 'cancelled_no',
              });
            }}
            className="inline-flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-[var(--radius-sm)] bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-[11px] shadow-2xs transition-colors cursor-pointer select-none"
            title={uiText("গ্রাহক বাতিল করেছেন — অর্ডার ক্যান্সেল করুন", locale)}
          >
            <XSquare className="w-3 h-3" />
            <span><LocalizedText source={"না"} area="admin" /></span>
          </button>
        </div>

        {/* Inline TrxID & Advance Courier Verification Popover */}
        {showVerifyPopover && (
          <div className="absolute bottom-full left-0 mb-1.5 z-40 w-72 max-w-[calc(100vw-2rem)] p-3 bg-surface border border-border shadow-xl rounded-[var(--radius-md)] text-xs text-ink space-y-2.5">
            <div className="flex items-center justify-between border-b border-border pb-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span><LocalizedText source={"TrxID ও অগ্রিম কুরিয়ার চার্জ"} area="admin" /></span>
              </span>
              <button
                type="button"
                onClick={() => setShowVerifyPopover(false)}
                className="text-muted hover:text-ink cursor-pointer p-0.5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 bg-bg p-2 rounded border border-border text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted"><LocalizedText source={"মাধ্যম:"} area="admin" /></span>
                <span className="font-bold uppercase text-ink">
                  {mfsProviderLabel}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Transaction ID:</span>
                <div className="flex items-center gap-1 font-mono font-bold text-ink">
                  <span>{ord.manualPaymentTrxId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (ord.manualPaymentTrxId && navigator.clipboard) {
                        void navigator.clipboard.writeText(
                          ord.manualPaymentTrxId
                        );
                        setCopiedTrx(true);
                        setTimeout(() => setCopiedTrx(false), 1200);
                      }
                    }}
                    className="p-0.5 hover:text-ink text-muted cursor-pointer"
                    title={uiText("কপি TrxID", locale)}
                  >
                    {copiedTrx ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted"><LocalizedText source={"অগ্রিম কুরিয়ার চার্জ:"} area="admin" /></span>
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  {formatPoishaToBdt(advanceAmountPoisha, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted"><LocalizedText source={"গ্রাহক:"} area="admin" /></span>
                <span className="font-mono text-ink">{ord.customerPhone}</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-0.5">
              <input
                type="text"
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                placeholder={uiText(
                  "যাচাইয়ের প্রমাণ / কারণ (অডিটে যাবে) — কমপক্ষে ৫ অক্ষর",
                  locale
                )}
                className="w-full min-h-[32px] px-2 py-1 text-[11px] bg-bg text-ink border border-border rounded-[var(--radius-sm)]"
              />
              <p className="text-[10px] text-muted leading-snug">
                <LocalizedText
                  source={"মেকার-চেকার: নিজে এন্ট্রি করা TrxID নিজে অনুমোদন করতে উপরের কারণটি আবশ্যক। অন্য অ্যাডমিন অনুমোদন করলে কারণ ছাড়াই হবে।"}
                  area="admin"
                />
              </p>
              <button
                type="button"
                disabled={isVerifying}
                onClick={async () => {
                  setIsVerifying(true);
                  try {
                    // 1. Verify TrxID. The reason doubles as the audit note, so
                    // a solo super admin is not blocked by maker-checker.
                    await onAction({
                      orderNos: [ord.orderNo!],
                      actionType: 'verify_bkash',
                      staffNote: verifyNote.trim() || undefined,
                      selfApprovalOverrideReasonBn: verifyNote.trim() || undefined,
                    });
                    // 2. Mark confirmed
                    await onAction({
                      orderNos: [ord.orderNo!],
                      actionType: 'log_call_status',
                      callStatus: 'confirmed_yes',
                    });
                    setShowVerifyPopover(false);
                  } finally {
                    setIsVerifying(false);
                  }
                }}
                className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                <span>
                  {isVerifying ? 'যাচাই হচ্ছে...' : '✓ ভেরিফাই ও কনফার্ম'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void onAction({
                    orderNos: [ord.orderNo!],
                    actionType: 'log_call_status',
                    callStatus: 'confirmed_yes',
                  });
                  setShowVerifyPopover(false);
                }}
                className="w-full py-1 px-2 border border-border bg-bg hover:bg-surface text-ink font-semibold rounded text-[10px] cursor-pointer"
              >
                <LocalizedText source={"শুধু কনফার্ম (যাচাই পরে)"} area="admin" />{" "}</button>

              {onOpenMfsModal && (
                <button
                  type="button"
                  onClick={() => {
                    setShowVerifyPopover(false);
                    onOpenMfsModal(ord);
                  }}
                  className="w-full py-1 px-2 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold rounded text-[10px] cursor-pointer flex items-center justify-center gap-1"
                >
                  <Wallet className="w-3 h-3" />
                  <span><LocalizedText source={"MFS বিস্তারিত প্যানেলে পরিবর্তন / যাচাই"} area="admin" /></span>
                </button>
              )}
            </div>
          </div>
        )}

        {ord.callStatus && ord.callStatus !== 'pending' && (
          <p className="text-[10px] text-muted">
            {ord.callStatus === 'confirmed_yes'
              ? '✓ কল কনফার্মড'
              : ord.callStatus === 'not_answered_busy'
              ? `⚠ শেষ কল ব্যস্ত (${attempts} চেষ্টা)`
              : ord.callStatus === 'cancelled_no'
              ? '✕ গ্রাহক বাতিল করেছেন'
              : '⌛ পরে কল করতে হবে'}
          </p>
        )}
      </div>
    );
  }

  if (status === 'confirmed') {
    return (
      <button
        type="button"
        onClick={() => {
          void onAction({
            orderNos: [ord.orderNo!],
            actionType: 'update_status',
            newStatus: 'packed',
          });
        }}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer select-none"
        title={uiText("প্যাকিং সম্পন্ন করুন", locale)}
      >
        <Package className="w-3.5 h-3.5" />
        <span>{locale === 'bn' ? 'প্যাকিং সম্পন্ন করুন' : 'Pack Order'}</span>
      </button>
    );
  }

  if (status === 'packed') {
    const hasTracking = Boolean(ord.trackingCode?.trim() || ord.consignmentId?.trim());
    if (!hasTracking) {
      // `book_courier` has no verified adapter (the server answers 503), so the
      // operator records the courier's tracking code here — precisely the
      // precondition that packed -> shipped requires.
      return (
        <div className="space-y-1">
          <input
            type="text"
            value={trackingDraft}
            onChange={(e) => setTrackingDraft(e.target.value.toUpperCase())}
            placeholder={uiText("কুরিয়ার ট্র্যাকিং কোড (যেমন SF-1234-567)", locale)}
            className="w-full min-h-[28px] px-2 py-1 text-[11px] bg-bg text-ink border border-border rounded-[var(--radius-sm)]"
            aria-label="Courier tracking code"
          />
          <button
            type="button"
            disabled={trackingDraft.trim().length < 3}
            onClick={() =>
              void onAction({
                orderNos: [ord.orderNo!],
                actionType: 'attach_tracking',
                trackingCode: trackingDraft.trim(),
                courierProvider: ord.courierProvider ?? 'steadfast',
              })
            }
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer select-none disabled:opacity-50"
            title={uiText("শিপড করার আগে কুরিয়ার ট্র্যাকিং কোড আবশ্যক", locale)}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>
              {locale === 'bn' ? 'ট্র্যাকিং সংরক্ষণ ও শিপ করুন' : 'Save tracking & ship'}
            </span>
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          void onAction({
            orderNos: [ord.orderNo!],
            actionType: 'update_status',
            newStatus: 'shipped',
          });
        }}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer select-none"
        title={uiText("কুরিয়ারে হস্তান্তর ও শিপড করুন", locale)}
      >
        <Truck className="w-3.5 h-3.5" />
        <span>{locale === 'bn' ? 'কুরিয়ারে পাঠান (Ship Now)' : 'Handover to Courier'}</span>
      </button>
    );
  }

  if (status === 'shipped') {
    return (
      <button
        type="button"
        onClick={() => {
          void onAction({
            orderNos: [ord.orderNo!],
            actionType: 'update_status',
            newStatus: 'out_for_delivery',
          });
        }}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer select-none"
        title={uiText("আউট ফর ডেলিভারি মার্ক করুন", locale)}
      >
        <Truck className="w-3.5 h-3.5" />
        <span>{locale === 'bn' ? 'আউট ফর ডেলিভারি' : 'Out for Delivery'}</span>
      </button>
    );
  }

  if (status === 'out_for_delivery') {
    return (
      <button
        type="button"
        onClick={() => {
          void onAction({
            orderNos: [ord.orderNo!],
            actionType: 'update_status',
            newStatus: 'delivered',
          });
        }}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer select-none"
        title={uiText("ডেলিভারি সফল ও সিওডি জমা সম্পন্ন করুন", locale)}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{locale === 'bn' ? 'ডেলিভারি সম্পন্ন (Mark Delivered)' : 'Mark Delivered'}</span>
      </button>
    );
  }

  if (status === 'delivered') {
    return (
      <span className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-emerald-600 text-white font-bold text-xs shadow-sm select-none">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{locale === 'bn' ? 'ডেলিভার্ড (COD জমা)' : 'Delivered (COD Remitted)'}</span>
      </span>
    );
  }

  if (status === 'cancelled') {
    return (
      <span className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-slate-700 text-white font-bold text-xs select-none">
        <span>{locale === 'bn' ? 'বাতিলকৃত' : 'Cancelled'}</span>
      </span>
    );
  }

  return (
    <span className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-rose-600 text-white font-bold text-xs select-none">
      <span>{locale === 'bn' ? 'রিটার্ন সম্পন্ন' : 'Returned'}</span>
    </span>
  );
}

function CourierInfoCard({
  ord,
  locale,
  onBookCourier,
}: {
  ord: Partial<OrderGridRowDTO>;
  locale: 'bn' | 'en';
  onBookCourier?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const badge = getCourierProviderBadgeStyle(ord.courierProvider);
  const trackingUrl = getCourierTrackingUrl(
    ord.courierProvider,
    ord.trackingCode,
    ord.consignmentId,
    ord.orderNo
  );

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ord.trackingCode) {
      navigator.clipboard.writeText(ord.trackingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-bold ${badge.bg}`}
        >
          {badge.label}
        </span>
        {ord.status === 'delivered' ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
            <LocalizedText source={"ডেলিভার্ড"} area="admin" />{" "}</span>
        ) : ord.status === 'shipped' || ord.status === 'out_for_delivery' ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 font-semibold border border-purple-300">
            <LocalizedText source={"ইন-ট্রানজিট"} area="admin" />{" "}</span>
        ) : ord.status === 'packed' ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-800 font-semibold border border-indigo-300">
            <LocalizedText source={"প্যাকড"} area="admin" />{" "}</span>
        ) : null}
      </div>

      {ord.trackingCode ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="font-bold text-ink select-all">
              {ord.trackingCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-muted hover:text-ink hover:bg-surface rounded cursor-pointer"
              title={uiText("ট্র্যাকিং কোড কপি করুন", locale)}
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-blue-700 hover:text-blue-900 hover:underline font-bold"
          >
            <ExternalLink className="w-3 h-3" />
            <span><LocalizedText source={"লাইভ ট্র্যাকিং লিংক"} area="admin" /></span>
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted">
          <span className="text-[11px]"><LocalizedText source={"বুকিং বাকি (Not Booked)"} area="admin" /></span>
          {onBookCourier && (
            <button
              type="button"
              onClick={onBookCourier}
              className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
            >
              <LocalizedText source={"+ বুক করুন"} area="admin" />{" "}</button>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminErpClient({ siteSettings: publicSettings }: AdminErpClientProps) {
  const locale = useLocaleStore((s) => s.adminLocale);
  const toggleLocale = useLocaleStore((s) => s.toggleAdminLocale);
  React.useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  // Strict Authentication & First-Login Gate State
  const [isCheckingSession, setIsCheckingSession] = React.useState(true);
  const [workspaceLoadFailed, setWorkspaceLoadFailed] = React.useState(false);
  const [snapshot, setSnapshot] =
    React.useState<WorkspaceSnapshotResponse | null>(null);
  const siteSettings = snapshot?.siteSettings ?? publicSettings;

  // Login Form State
  const [loginUsername, setLoginUsername] = React.useState('panchabindu_owner');
  const [loginPassword, setLoginPassword] = React.useState('');
  const [loginTotp, setLoginTotp] = React.useState('');
  const [loginTotpEnabled, setLoginTotpEnabled] = React.useState(false);
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState<string | null>(null);

  // First-Login Gate State
  const [gateUser, setGateUser] = React.useState<SanitizedAdminUserDTO | null>(
    null
  );
  const [gateCurrentPass, setGateCurrentPass] = React.useState('');
  const [gateNewPass, setGateNewPass] = React.useState('');
  const [gateTotp, setGateTotp] = React.useState('');
  const [gateTotpUri, setGateTotpUri] = React.useState<string | null>(null);
  const [gateError, setGateError] = React.useState<string | null>(null);
  const [gateSubmitting, setGateSubmitting] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetch('/api/admin/auth', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { twoFactorLoginEnabled?: boolean; defaultAdminUsername?: string }) => {
        if (!active) return;
        setLoginTotpEnabled(data.twoFactorLoginEnabled === true);
        if (data.defaultAdminUsername) setLoginUsername(data.defaultAdminUsername);
      })
      .catch(() => {
        if (active) setLoginTotpEnabled(true);
      });
    return () => { active = false; };
  }, []);

  // Workspace Navigation & Toast Banner State
  const [activeTab, setActiveTab] = React.useState<AdminTabKey>('today_screen');
  const [helpModalTab, setHelpModalTab] = React.useState<AdminTabKey | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = React.useState(false);
  React.useEffect(() => {
    if (!isMobileSidebarOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileSidebarOpen]);
  const [actionFeedback, setActionFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Admin Notification System State
  const [isNotificationOpen, setIsNotificationOpen] = React.useState(false);
  const [notificationFilter, setNotificationFilter] = React.useState<
    'all' | 'vendor_approval' | 'stock_alert' | 'order_alert'
  >('all');
  const [readNotificationIds, setReadNotificationIds] = React.useState<string[]>([]);

  const allNotifications = React.useMemo(() => {
    if (!snapshot) return [];
    const list: Array<{
      id: string;
      type: 'vendor_approval' | 'stock_alert' | 'order_alert' | 'address_alert';
      titleBn: string;
      titleEn: string;
      descBn: string;
      descEn: string;
      timestamp: string;
      targetTab: AdminTabKey;
      severity: 'info' | 'warning' | 'danger';
    }> = [];

    // 1. Pending Vendor Approval Requests & Payout Requests
    if (snapshot.vendorEscrow?.vendors) {
      for (const v of snapshot.vendorEscrow.vendors) {
        if (v.profile.status === 'pending_onboarding') {
          list.push({
            id: `vendor-appr-${v.profile.vendorId}`,
            type: 'vendor_approval',
            titleBn: `ভেন্ডর অনুমোদন অনুরোধ: ${v.profile.businessNameBn}`,
            titleEn: `Vendor Approval Request: ${v.profile.businessNameEn}`,
            descBn: `অনবোর্ডিং ভেন্ডর স্ট্যাটাস: পেন্ডিং অনুমোদন (মালিক: ${v.profile.ownerNameBn})`,
            descEn: `Vendor status: Pending Approval (Owner: ${v.profile.ownerNameBn})`,
            timestamp: 'পেন্ডিং',
            targetTab: 'vendor_escrow',
            severity: 'warning',
          });
        }
      }
    }

    if (snapshot.vendorEscrow?.payoutRequests) {
      for (const pr of snapshot.vendorEscrow.payoutRequests) {
        if (pr.status === 'requested') {
          list.push({
            id: `vendor-payout-${pr.payoutId}`,
            type: 'vendor_approval',
            titleBn: `পেআউট অনুরোধ: ${pr.vendorNameBn}`,
            titleEn: `Payout Request: ${pr.vendorNameBn}`,
            descBn: `মেথড: ${pr.payoutMethodBn}, অ্যাকাউন্ট: ${pr.payoutAccountNo}`,
            descEn: `Method: ${pr.payoutMethodBn}, Account: ${pr.payoutAccountNo}`,
            timestamp: 'পেন্ডিং পেআউট',
            targetTab: 'vendor_escrow',
            severity: 'warning',
          });
        }
      }
    }

    // 2. Low Stock Variant Alerts
    if (snapshot.products) {
      for (const p of snapshot.products) {
        if (p.variants) {
          for (const varItem of p.variants) {
            if (varItem.stockAvailable <= (p.lowStockThreshold ?? 5)) {
              list.push({
                id: `stock-low-${varItem.variantId}`,
                type: 'stock_alert',
                titleBn: `স্টক সতর্কতা: ${p.nameBn} (${varItem.titleBn})`,
                titleEn: `Low Stock Alert: ${p.nameEn} (${varItem.titleEn})`,
                descBn: `স্টকে মাত্র ${varItem.stockAvailable} টি অবশিষ্ট (সীমা: ${p.lowStockThreshold ?? 5})`,
                descEn: `Only ${varItem.stockAvailable} items remaining (threshold: ${p.lowStockThreshold ?? 5})`,
                timestamp: 'জরুরি',
                targetTab: 'finance_product360',
                severity: 'danger',
              });
            }
          }
        }
      }
    }

    // 3. Call Confirmation Queue
    if (snapshot.todayQueues?.callToConfirmCount && snapshot.todayQueues.callToConfirmCount > 0) {
      list.push({
        id: 'ord-call-confirm-queue',
        type: 'order_alert',
        titleBn: `ফোন কনফার্মেশন পেন্ডিং: ${snapshot.todayQueues.callToConfirmCount} টি অর্ডার`,
        titleEn: `Call Confirmation Pending: ${snapshot.todayQueues.callToConfirmCount} orders`,
        descBn: `নতুন কাস্টমার অর্ডারের ফোন কল যাচাইকরণ সম্পন্ন করুন।`,
        descEn: `Perform call verification for newly placed storefront orders.`,
        timestamp: 'লাইভ কিউ',
        targetTab: 'today_screen',
        severity: 'info',
      });
    }

    // 4. Address Fix Needed Queue
    if (snapshot.todayQueues?.fixAddressCount && snapshot.todayQueues.fixAddressCount > 0) {
      list.push({
        id: 'ord-fix-addr-queue',
        type: 'address_alert',
        titleBn: `ঠিকানা সংশোধন প্রয়োজন: ${snapshot.todayQueues.fixAddressCount} টি অর্ডার`,
        titleEn: `Address Fix Needed: ${snapshot.todayQueues.fixAddressCount} orders`,
        descBn: `কুরিয়ার বুকিংয়ের আগে গ্রাহকের বাসা/রোড নম্বর কনফার্ম করুন।`,
        descEn: `Confirm customer house/road details prior to courier booking.`,
        timestamp: 'লাইভ কিউ',
        targetTab: 'orders_grid',
        severity: 'warning',
      });
    }

    // 5. Unread Customer Inquiries Alert
    if (snapshot.inquiries) {
      const unread = snapshot.inquiries.filter((i) => i.status === 'unread');
      for (const inq of unread) {
        list.push({
          id: `inquiry-${inq.id}`,
          type: 'order_alert',
          titleBn: `নতুন কাস্টমার বার্তা: ${inq.name} (${inq.phone})`,
          titleEn: `New Customer Message: ${inq.name} (${inq.phone})`,
          descBn: `${inq.subject}: ${inq.message.slice(0, 60)}...`,
          descEn: `${inq.subject}: ${inq.message.slice(0, 60)}...`,
          timestamp: 'নতুন বার্তা',
          targetTab: 'control_center',
          severity: 'info',
        });
      }
    }

    return list;
  }, [snapshot]);

  const filteredNotifications = React.useMemo(() => {
    if (notificationFilter === 'all') return allNotifications;
    if (notificationFilter === 'order_alert') {
      return allNotifications.filter(
        (n) => n.type === 'order_alert' || n.type === 'address_alert'
      );
    }
    return allNotifications.filter((n) => n.type === notificationFilter);
  }, [allNotifications, notificationFilter]);

  const unreadNotificationCount = React.useMemo(() => {
    return allNotifications.filter((n) => !readNotificationIds.includes(n.id)).length;
  }, [allNotifications, readNotificationIds]);

  const handleMarkAllNotificationsAsRead = () => {
    setReadNotificationIds(allNotifications.map((n) => n.id));
  };

  const handleToggleReadNotification = (id: string) => {
    setReadNotificationIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Orders Grid Filter & Selection State
  const [orderSearch, setOrderSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [nextActionFilter, setNextActionFilter] = React.useState<string>('ALL');
  const [selectedOrderNos, setSelectedOrderNos] = React.useState<string[]>([]);
  const [activeActionOrder, setActiveActionOrder] =
    React.useState<EnrichedOrderRow | null>(null);
  const [editCustomerName, setEditCustomerName] = React.useState('');
  const [editCustomerPhone, setEditCustomerPhone] = React.useState('');
  const [editDistrictId, setEditDistrictId] = React.useState<number>(47);
  const [editUpazilaId, setEditUpazilaId] = React.useState<number>(365);
  const [editAddressStreet, setEditAddressStreet] = React.useState('');
  const [editAddressLandmark, setEditAddressLandmark] = React.useState('');
  const [editItems, setEditItems] = React.useState<
    Array<{
      productId: string;
      variantId: string;
      productNameBn: string;
      variantTitleBn: string;
      publicSku: string;
      quantity: number;
      unitSalePricePoisha: number;
      lineSubtotalPoisha: number;
    }>
  >([]);
  const [editDiscountTaka, setEditDiscountTaka] = React.useState<number>(0);
  const [editDeliveryChargeTaka, setEditDeliveryChargeTaka] =
    React.useState<number>(70);
  const [editAdvancePaidTaka, setEditAdvancePaidTaka] =
    React.useState<number>(0);
  const [editPaymentMethod, setEditPaymentMethod] =
    React.useState<PaymentMethod>('cod');
  const [editPaymentStatus, setEditPaymentStatus] =
    React.useState<PaymentStatus>('unpaid');
  const [editManualPaymentTrxId, setEditManualPaymentTrxId] =
    React.useState('');
  const [editCourierProvider, setEditCourierProvider] =
    React.useState<CourierProvider>('steadfast');
  const [editConsignmentId, setEditConsignmentId] = React.useState('');
  const [editTrackingCode, setEditTrackingCode] = React.useState('');
  const [editOrderStatus, setEditOrderStatus] =
    React.useState<OrderStatus>('pending_confirmation');
  const [editOrderSource, setEditOrderSource] =
    React.useState<OrderSource>('storefront');
  const [editCallStatus, setEditCallStatus] = React.useState<
    | 'pending'
    | 'confirmed_yes'
    | 'not_answered_busy'
    | 'cancelled_no'
    | 'call_back_requested'
  >('pending');
  const [editCallStatusNote, setEditCallStatusNote] = React.useState('');
  const [editStaffNote, setEditStaffNote] = React.useState('');
  const [bookingOverrideReason, setBookingOverrideReason] = React.useState('');
  const [isSavingOrder, setIsSavingOrder] = React.useState(false);

  // Customer Message Studio State
  const [activeMessageOrder, setActiveMessageOrder] =
    React.useState<EnrichedOrderRow | null>(null);
  const [messageTemplateType, setMessageTemplateType] = React.useState<
    'tracking_link' | 'order_confirmed' | 'delivered' | 'advance_reminder'
  >('tracking_link');
  const [messageCustomText, setMessageCustomText] = React.useState('');
  const [messageCopied, setMessageCopied] = React.useState(false);
  const [messageSending, setMessageSending] = React.useState(false);

  // Live Courier Tracking Sync State
  const [isSyncingTracking, setIsSyncingTracking] = React.useState(false);
  // Tracks whether sync_courier_tracking is actually allowed, so the grid can
  // hide/disable the control instead of failing on every click.
  const [trackingSyncAvailable, setTrackingSyncAvailable] = React.useState(true);
  const [lastTrackingSyncAt, setLastTrackingSyncAt] = React.useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  // Manual MFS Payment (bKash / Nagad / Rocket) State
  const [mfsModalOrder, setMfsModalOrder] = React.useState<EnrichedOrderRow | null>(null);
  const [mfsProvider, setMfsProvider] = React.useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const [mfsSenderPhone, setMfsSenderPhone] = React.useState('');
  const [mfsTrxId, setMfsTrxId] = React.useState('');
  const [mfsAmountTaka, setMfsAmountTaka] = React.useState('');
  const [mfsAutoVerify, setMfsAutoVerify] = React.useState(true);
  const [mfsNoteBn, setMfsNoteBn] = React.useState('');
  // maker-checker: approving your own entry needs an explicit, audited reason.
  const [mfsSelfApprovalBlocked, setMfsSelfApprovalBlocked] = React.useState(false);
  const [mfsOverrideReason, setMfsOverrideReason] = React.useState('');
  const [isSubmittingMfs, setIsSubmittingMfs] = React.useState(false);

  // Smart Order Entry State
  const [smartPhone, setSmartPhone] = React.useState('');
  const [smartName, setSmartName] = React.useState('');
  const [smartSource, setSmartSource] = React.useState<OrderSource>('facebook');
  const [smartDistrictId, setSmartDistrictId] = React.useState<number>(47);
  const [smartUpazilaId, setSmartUpazilaId] = React.useState<number>(365);
  const [smartStreet, setSmartStreet] = React.useState('');
  const [smartLandmark, setSmartLandmark] = React.useState('');
  const [smartVariantId, setSmartVariantId] = React.useState<string>(
    '00000000-0000-4000-8000-000000000201'
  );
  const [smartQuantity, setSmartQuantity] = React.useState<number>(1);
  const [smartDeliveryMethod, setSmartDeliveryMethod] = React.useState<
    'courier' | 'post_office'
  >('courier');
  const [smartPaymentMethod, setSmartPaymentMethod] = React.useState<
    'cod' | 'bkash_manual'
  >('cod');
  const [smartTrxId, setSmartTrxId] = React.useState('');
  const [smartStaffNote, setSmartStaffNote] = React.useState('');
  const [smartDupOverride, setSmartDupOverride] = React.useState('');
  const [smartCustomerHistory, setSmartCustomerHistory] = React.useState<{
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
  } | null>(null);
  const [smartSubmitting, setSmartSubmitting] = React.useState(false);

  // User & RBAC Creation State
  const [newUsername, setNewUsername] = React.useState('');
  const [newDisplayNameBn, setNewDisplayNameBn] = React.useState('');
  const [newRoleSlug, setNewRoleSlug] =
    React.useState<SystemRoleSlug>('marketing_manager');
  const [newMaxDiscountBp, setNewMaxDiscountBp] = React.useState<number>(1000);
  const [createdTempCredentials, setCreatedTempCredentials] = React.useState<{
    username: string;
    tempPassword: string;
    roleSlug: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = React.useState(false);

  // 4-Role Policy Update State
  const [customRoleSlug, setCustomRoleSlug] =
    React.useState<SystemRoleSlug>('marketing_manager');
  const [customRoleNameBn, setCustomRoleNameBn] = React.useState(
    'মার্কেটিং ম্যানেজার'
  );
  const [customRoleMaxDiscBp, setCustomRoleMaxDiscBp] =
    React.useState<number>(1000);

  const smartOrderSeqRef = React.useRef<number>(100);

  const fetchWorkspace = React.useCallback(async () => {
    try {
      const storedToken =
        typeof window !== 'undefined'
          ? window.sessionStorage.getItem('bg_admin_session_token')
          : null;
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['x-admin-session-token'] = storedToken;
      }
      const res = await fetch('/api/admin/workspace', {
        cache: 'no-store',
        headers,
      });
      const data = (await res.json()) as WorkspaceSnapshotResponse;
      if (res.ok && data.authorized) {
        setSnapshot(data);
        setGateUser(null);
        setWorkspaceLoadFailed(false);
      } else if (data.requiresFirstLoginGate && data.currentUser) {
        setGateUser(data.currentUser);
        setSnapshot(null);
        setWorkspaceLoadFailed(false);
      } else {
        setSnapshot(null);
        setWorkspaceLoadFailed(res.status !== 401);
      }
    } catch {
      setSnapshot(null);
      setWorkspaceLoadFailed(true);
    } finally {
      setIsCheckingSession(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    const storedToken =
      typeof window !== 'undefined'
        ? window.sessionStorage.getItem('bg_admin_session_token')
        : null;
    const headers: Record<string, string> = {};
    if (storedToken) {
      headers['x-admin-session-token'] = storedToken;
    }
    fetch('/api/admin/workspace', { cache: 'no-store', headers })
      .then((res) => res.json().then((data: WorkspaceSnapshotResponse) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (ok && data.authorized) {
          setSnapshot(data);
          setGateUser(null);
          setWorkspaceLoadFailed(false);
        } else if (data.requiresFirstLoginGate && data.currentUser) {
          setGateUser(data.currentUser);
          setSnapshot(null);
          setWorkspaceLoadFailed(false);
        } else {
          setSnapshot(null);
          setWorkspaceLoadFailed(!ok);
        }
        setIsCheckingSession(false);
      })
      .catch(() => {
        if (!active) return;
        setSnapshot(null);
        setWorkspaceLoadFailed(true);
        setIsCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const totpToUse = loginTotp.trim();

      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: loginUsername,
          password: loginPassword,
          totpCode: totpToUse,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        requiresFirstLoginGate?: boolean;
        totpSetupUri?: string;
        sessionToken?: string;
        csrfToken?: string;
        errorBn?: string;
        user?: SanitizedAdminUserDTO;
      };

      if (!res.ok || !data.success) {
        setLoginError(data.errorBn ?? 'লগইন ব্যর্থ হয়েছে।');
      } else if (data.requiresFirstLoginGate && data.user) {
        if (data.sessionToken && data.csrfToken) {
          window.sessionStorage.setItem('bg_admin_session_token', data.sessionToken);
          window.sessionStorage.setItem('bg_admin_csrf_token', data.csrfToken);
        }
        setGateUser(data.user);
        setGateCurrentPass(loginPassword);
        setGateTotpUri(data.totpSetupUri ?? null);
      } else {
        if (typeof window !== 'undefined' && data.sessionToken) {
          window.sessionStorage.setItem('bg_admin_session_token', data.sessionToken);
          if (data.csrfToken) {
            window.sessionStorage.setItem('bg_admin_csrf_token', data.csrfToken);
          }
        }
        await fetchWorkspace();
      }
    } catch {
      setLoginError('নেটওয়ার্ক ত্রুটি।');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCompleteFirstLoginGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateUser) return;
    setGateError(null);
    setGateSubmitting(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': window.sessionStorage.getItem('bg_admin_csrf_token') ?? '' },
        body: JSON.stringify({
          action: 'complete_first_login',
          userId: gateUser.userId,
          currentPassword: gateCurrentPass,
          newPassword: gateNewPass,
          totpCode: gateTotp,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        sessionToken?: string;
        csrfToken?: string;
        errorBn?: string;
      };
      if (!res.ok || !data.success) {
        setGateError(
          data.errorBn ?? 'প্রথম লগইন ভেরিফিকেশন সম্পন্ন করা যায়নি।'
        );
      } else {
        if (typeof window !== 'undefined' && data.sessionToken) {
          window.sessionStorage.setItem('bg_admin_session_token', data.sessionToken);
          if (data.csrfToken) {
            window.sessionStorage.setItem('bg_admin_csrf_token', data.csrfToken);
          }
        }
        setLoginUsername(gateUser.username);
        setLoginPassword(gateNewPass);
        setGateCurrentPass('');
        setGateNewPass('');
        setGateTotp('');
        setGateUser(null);
        await fetchWorkspace();
      }
    } catch {
      setGateError('নেটওয়ার্ক ত্রুটি।');
    } finally {
      setGateSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': window.sessionStorage.getItem('bg_admin_csrf_token') ?? '' },
      body: JSON.stringify({ action: 'logout' }),
    });
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('bg_admin_session_token');
      window.sessionStorage.removeItem('bg_admin_csrf_token');
    }
    setSnapshot(null);
    setGateUser(null);
  };

  // Shared "record courier handover" dialog — replaces the dead book_courier flow.
  const [trackingDialogOrder, setTrackingDialogOrder] = React.useState<
    (typeof orders)[number] | null
  >(null);
  const [trackingDialogCode, setTrackingDialogCode] = React.useState('');
  const [trackingDialogConsignment, setTrackingDialogConsignment] = React.useState('');
  const [isSavingTracking, setIsSavingTracking] = React.useState(false);

  const openTrackingDialog = (ord: (typeof orders)[number]) => {
    setTrackingDialogOrder(ord);
    setTrackingDialogCode(ord.trackingCode ?? '');
    setTrackingDialogConsignment(ord.consignmentId ?? '');
  };

  const handleSaveTrackingDialog = async () => {
    if (!trackingDialogOrder?.orderNo) return;
    const code = trackingDialogCode.trim().toUpperCase();
    if (code.length < 3) {
      setActionFeedback({
        type: 'error',
        text: 'কুরিয়ার ট্র্যাকিং কোড কমপক্ষে ৩ অক্ষরের হতে হবে।',
      });
      return;
    }
    setIsSavingTracking(true);
    try {
      await executeGridAction({
        orderNos: [trackingDialogOrder.orderNo],
        actionType: 'attach_tracking',
        trackingCode: code,
        consignmentId: trackingDialogConsignment.trim() || undefined,
        courierProvider: trackingDialogOrder.courierProvider ?? 'steadfast',
      });
      setTrackingDialogOrder(null);
      setTrackingDialogCode('');
      setTrackingDialogConsignment('');
    } finally {
      setIsSavingTracking(false);
    }
  };
  const executeGridAction = async (payload: {
    orderNos: string[];
    actionType:
      | 'update_status'
      | 'fix_address'
      | 'verify_bkash'
      | 'book_courier'
      | 'log_call_attempt'
      | 'log_call_status'
      | 'add_staff_note'
      | 'attach_tracking';
    newStatus?: OrderStatus;
    courierProvider?: CourierProvider;
    callStatus?:
      | 'pending'
      | 'confirmed_yes'
      | 'not_answered_busy'
      | 'cancelled_no'
      | 'call_back_requested';
    callStatusNote?: string;
    streetAddress?: string;
    landmark?: string;
    addressOverrideReason?: string;
    staffNote?: string;
    trackingCode?: string;
    consignmentId?: string;
    selfApprovalOverrideReasonBn?: string;
  }) => {
    setActionFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'order_grid_action',
          ...payload,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
        results?: Array<{ orderNo: string; ok: boolean; messageBn: string }>;
      };

      const summaryText =
        data.results?.map((r) => `${r.orderNo}: ${r.messageBn}`).join(' | ') ??
        data.errorBn ??
        'অ্যাকশন সম্পন্ন হয়েছে।';

      setActionFeedback({
        type: data.success ? 'success' : 'error',
        text: summaryText,
      });
      await fetchWorkspace();
    } catch {
      setActionFeedback({
        type: 'error',
        text: 'সার্ভারে যোগাযোগ করা যায়নি।',
      });
    }
  };

  const handleExportOrders = () => {
    const exportRows = filteredOrders;
    if (exportRows.length === 0) {
      setActionFeedback({ type: 'error', text: 'এক্সপোর্ট করার মতো কোনো অর্ডার নেই।' });
      return;
    }

    const keys = Array.from(new Set(exportRows.flatMap((order) => Object.keys(order))));
    const csvValue = (value: unknown) => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      const text = /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [
      keys.map(csvValue).join(','),
      ...exportRows.map((order) => keys.map((key) => csvValue((order as Record<string, unknown>)[key])).join(',')),
    ].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `panchabindu-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSyncCourierTracking = async () => {
    setIsSyncingTracking(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'sync_courier_tracking' }),
      });
      const data = (await res.json()) as {
        success: boolean;
        syncedCount?: number;
        updatedCount?: number;
        messageBn?: string;
        errorBn?: string;
      };

      if (data.success) {
        const timeStr = new Date().toLocaleTimeString(locale === 'bn' ? 'bn-BD' : 'en-US');
        setLastTrackingSyncAt(timeStr);
        setSyncFeedback(data.messageBn || 'কুরিয়ার ট্র্যাকিং সফলভাবে সিঙ্ক হয়েছে।');
        setActionFeedback({
          type: 'success',
          text: data.messageBn || 'কুরিয়ার ট্র্যাকিং সফলভাবে সিঙ্ক হয়েছে।',
        });
        setTrackingSyncAvailable(true);
        await fetchWorkspace();
      } else {
        // The workspace policy refuses this operation outright. Stop offering a
        // button that can only fail, and stop the silent interval from retrying
        // it forever.
        setTrackingSyncAvailable(false);
        setSyncFeedback(null);
        setActionFeedback({
          type: 'error',
          text:
            data.errorBn ||
            'কুরিয়ার ট্র্যাকিং সিঙ্ক এই মুহূর্তে চালু নেই। স্ট্যাটাস ম্যানুয়ালি বা কুরিয়ার ওয়েবহুক দিয়ে আপডেট হবে।',
        });
      }
    } catch {
      setActionFeedback({
        type: 'error',
        text: 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsSyncingTracking(false);
    }
  };

  const handleOpenEditOrder = (ord: EnrichedOrderRow) => {
    setActiveActionOrder(ord);
    setEditCustomerName(ord.customerName ?? '');
    setEditCustomerPhone(ord.customerPhone ?? '');
    setEditDistrictId(ord.districtId ?? 47);
    setEditUpazilaId(ord.upazilaId ?? 365);
    setEditAddressStreet(ord.streetAddress ?? '');
    setEditAddressLandmark(ord.landmark ?? '');

    const initialItems =
      ord.items && ord.items.length > 0
        ? ord.items.map((i) => ({ ...i }))
        : [
            {
              productId: '00000000-0000-4000-8000-000000000101',
              variantId: '00000000-0000-4000-8000-000000000201',
              productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
              variantTitleBn: 'মেরুন ও গোল্ডেন জরি',
              publicSku: 'BG-JAM-201',
              quantity: 1,
              unitSalePricePoisha: ord.subtotalPoisha ?? 245000,
              lineSubtotalPoisha: ord.subtotalPoisha ?? 245000,
            },
          ];
    setEditItems(initialItems);

    setEditDiscountTaka(Math.round((ord.discountPoisha ?? 0) / 100));
    setEditDeliveryChargeTaka(Math.round((ord.deliveryChargePoisha ?? 0) / 100));
    setEditAdvancePaidTaka(Math.round((ord.advancePaidPoisha ?? 0) / 100));
    setEditPaymentMethod(ord.paymentMethod ?? 'cod');
    setEditPaymentStatus(ord.paymentStatus ?? 'unpaid');
    setEditManualPaymentTrxId(ord.manualPaymentTrxId ?? '');
    setEditCourierProvider(ord.courierProvider ?? 'steadfast');
    setEditConsignmentId(ord.consignmentId ?? '');
    setEditTrackingCode(ord.trackingCode ?? '');
    setEditOrderStatus(ord.status ?? 'pending_confirmation');
    setEditOrderSource(ord.source ?? 'storefront');
    setEditCallStatus(ord.callStatus ?? 'pending');
    setEditCallStatusNote(ord.callStatusNote ?? '');
    setEditStaffNote(ord.internalStaffNote ?? '');
    setBookingOverrideReason('');
  };

  const handleItemQuantityChange = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setEditItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const lineSubtotalPoisha = newQty * item.unitSalePricePoisha;
        return { ...item, quantity: newQty, lineSubtotalPoisha };
      })
    );
  };

  const handleItemPriceChange = (index: number, newPriceTaka: number) => {
    const unitSalePricePoisha = Math.max(0, Math.round(newPriceTaka * 100));
    setEditItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const lineSubtotalPoisha = item.quantity * unitSalePricePoisha;
        return { ...item, unitSalePricePoisha, lineSubtotalPoisha };
      })
    );
  };

  const handleRemoveItem = (index: number) => {
    if (editItems.length <= 1) return;
    setEditItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddItem = (variantId: string) => {
    if (!snapshot?.products) return;
    for (const prod of snapshot.products) {
      const variant = prod.variants?.find((v) => v.variantId === variantId);
      if (variant) {
        const newItem = {
          productId: prod.productId ?? '',
          variantId: variant.variantId,
          productNameBn: prod.nameBn ?? 'পণ্য',
          variantTitleBn: variant.titleBn ?? 'ডিফল্ট',
          publicSku: variant.publicSku ?? 'SKU',
          quantity: 1,
          unitSalePricePoisha: variant.salePricePoisha ?? 10000,
          lineSubtotalPoisha: variant.salePricePoisha ?? 10000,
        };
        setEditItems((prev) => [...prev, newItem]);
        break;
      }
    }
  };

  const handleSaveFullOrder = async () => {
    if (!activeActionOrder?.orderNo) return;
    setIsSavingOrder(true);
    try {
      const payload = {
        operation: 'update_full_order' as const,
        orderNo: activeActionOrder.orderNo,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        districtId: editDistrictId,
        upazilaId: editUpazilaId,
        streetAddress: editAddressStreet,
        landmark: editAddressLandmark,
        items: editItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          unitSalePricePoisha: i.unitSalePricePoisha,
        })),
        discountPoisha: Math.max(0, editDiscountTaka * 100),
        deliveryChargePoisha: Math.max(0, editDeliveryChargeTaka * 100),
        advancePaidPoisha: Math.max(0, editAdvancePaidTaka * 100),
        paymentMethod: editPaymentMethod,
        paymentStatus: editPaymentStatus,
        manualPaymentTrxId: editManualPaymentTrxId.trim() || null,
        courierProvider: editCourierProvider,
        consignmentId: editConsignmentId.trim() || null,
        trackingCode: editTrackingCode.trim() || null,
        status: editOrderStatus,
        source: editOrderSource,
        callStatus: editCallStatus,
        callStatusNote: editCallStatusNote,
        internalStaffNote: editStaffNote,
        addressOverrideReason: bookingOverrideReason.trim() || undefined,
      };

      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionFeedback({
          type: 'error',
          text: data.errorBn ?? 'অর্ডার আপডেট ব্যর্থ হয়েছে।',
        });
      } else {
        setActionFeedback({
          type: 'success',
          text: `${activeActionOrder.orderNo}: সকল তথ্য, ডিসকাউন্ট ও কুরিয়ার ট্র্যাকিং সফলভাবে আপডেট হয়েছে।`,
        });
        setActiveActionOrder(null);
        await fetchWorkspace();
      }
    } catch {
      setActionFeedback({
        type: 'error',
        text: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।',
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const buildOrderMessageText = (
    ord: EnrichedOrderRow,
    type: 'tracking_link' | 'order_confirmed' | 'delivered' | 'advance_reminder'
  ) => {
    const custName = ord.customerName || 'সম্মানিত গ্রাহক';
    const ordNo = ord.orderNo || 'ORD-0000';
    const totalTaka = Math.round((ord.totalPayablePoisha ?? 0) / 100);
    const codTaka = Math.round(
      (ord.codCollectablePoisha ?? ord.totalPayablePoisha ?? 0) / 100
    );
    const advanceTaka = Math.round((ord.advancePaidPoisha ?? 0) / 100);
    const address = `${ord.streetAddress ?? ''}${
      ord.landmark ? ` (ল্যান্ডমার্ক: ${ord.landmark})` : ''
    }, ${ord.upazilaNameBn ?? ''}, ${ord.districtNameBn ?? ''}`.trim();

    const itemsList =
      ord.items && ord.items.length > 0
        ? ord.items
            .map((i) => `• ${i.productNameBn} (${i.variantTitleBn}) x ${i.quantity}টি`)
            .join('\n')
        : '• কনসাইনমেন্ট পণ্য x ১টি';

    const courierLabel =
      ord.courierProvider === 'steadfast'
        ? 'Steadfast Courier'
        : ord.courierProvider === 'pathao'
        ? 'Pathao Courier'
        : ord.courierProvider === 'redx'
        ? 'RedX Delivery'
        : ord.courierProvider === 'bd_post'
        ? 'বাংলাদেশ ডাক বিভাগ (BD Post)'
        : 'ম্যানুয়াল হোম ডেলিভারি';

    const trackingCode = ord.trackingCode || ord.consignmentId || 'আপডেট হচ্ছে';
    const trackingUrl = getLiveCourierTrackingUrl(
      ord.courierProvider ?? 'steadfast',
      ord.trackingCode,
      ord.consignmentId,
      ord.orderNo
    );
    const supportPhone = siteSettings.supportPhone || '01700000000';
    const brandName = siteSettings.brandNameBn || 'বঙ্ককনসাইন';

    if (type === 'delivered') {
      return `প্রিয় ${custName},
${brandName}-এ আপনার অর্ডারটি (${ordNo}) সফলভাবে ডেলিভারি সম্পন্ন হয়েছে! 🎉

📦 অর্ডারের বিবরণ:
${itemsList}

💰 পরিশোধিত মোট: ৳${totalTaka}
🚚 ডেলিভারি কুরিয়ার: ${courierLabel} (ট্র্যাকিং: ${trackingCode})

পণ্যটি আপনার পছন্দ হয়েছে আশা করি। যেকোনো প্রশ্ন বা মতামত জানাতে আমাদের হেল্পলাইনে যোগাযোগ করতে পারেন: ${supportPhone}

${brandName}-এর সাথে থাকার জন্য আন্তরিক ধন্যবাদ! ❤️`;
    }

    if (type === 'tracking_link') {
      return `প্রিয় ${custName},
আপনার অর্ডারটি (${ordNo}) কুরিয়ারে হস্তান্তর করা হয়েছে এবং আপনার ঠিকানার উদ্দেশ্যে পাঠানো হয়েছে! 🚚

📦 পণ্য বিবরণ:
${itemsList}

💰 কুরিয়ারকে প্রদেয় ক্যাশ অন ডেলিভারি (COD): ৳${codTaka}
📍 ডেলিভারি ঠিকানা: ${address}

🚚 কুরিয়ার পার্টনার: ${courierLabel}
🔖 পার্সেল ট্র্যাকিং আইডি: ${trackingCode}
🌐 লাইভ ট্র্যাকিং লিংক:
${trackingUrl}
(উপরের লিংকে ক্লিক করে সরাসরি আপনার পার্সেলের অবস্থান ও রাইডারের তথ্য দেখতে পারবেন)

ডেলিভারিম্যান পৌঁছানোর আগে আপনাকে ফোন করবেন। যেকোনো প্রয়োজনে: ${supportPhone}
ধন্যবাদ!`;
    }

    if (type === 'advance_reminder') {
      const bkashNum = siteSettings.bkashManualNumber || '01712345678';
      return `প্রিয় ${custName},
${brandName}-এ আপনার অর্ডারটি (${ordNo}) প্রসেস করা হচ্ছে।

📦 পণ্য:
${itemsList}
💰 মোট মূল্য: ৳${totalTaka}
ডেলিভারি কনফার্মেশনের জন্য অগ্রিম ডেলিভারি চার্জ (৳${Math.round(
        (ord.deliveryChargePoisha ?? 7000) / 100
      )}) নিচের বিকাশ নম্বরে সেন্ড মানি করুন:
📱 বিকাশ নম্বর: ${bkashNum} (Personal)
রেফারেন্সে লিখুন: ${ordNo}

টাকা পাঠিয়ে ট্রানজেকশন আইডি (TrxID) আমাদের ইনবক্সে জানান। ধন্যবাদ!`;
    }

    // Default: order_confirmed
    return `প্রিয় ${custName},
${brandName}-এ আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে! ✅

📦 অর্ডার আইডি: ${ordNo}
🛍️ পণ্য বিবরণ:
${itemsList}

💰 মোট প্রদেয় (ক্যাশ অন ডেলিভারি): ৳${codTaka}${
      advanceTaka > 0 ? ` (অগ্রিম পরিশোধিত: ৳${advanceTaka})` : ''
    }
📍 ডেলিভারির ঠিকানা: ${address}

🚚 কুরিয়ার: ${courierLabel}
খুব শীঘ্রই পার্সেলটি প্যাকিং শেষে কুরিয়ারে বুক করা হবে এবং ট্র্যাকিং লিংক এসএমএস/হোয়াটসঅ্যাপে জানিয়ে দেওয়া হবে।

যেকোনো সহায়তায় হেল্পলাইন: ${supportPhone} (সকাল ৯টা - রাত ১০টা)
ধন্যবাদ আমাদের সাথে কেনাকাটার জন্য!`;
  };

  const handleOpenMessageStudio = (
    ord: EnrichedOrderRow,
    defaultType?:
      | 'tracking_link'
      | 'order_confirmed'
      | 'delivered'
      | 'advance_reminder'
  ) => {
    setActiveMessageOrder(ord);

    let tType = defaultType;
    if (!tType) {
      if (ord.status === 'delivered') {
        tType = 'delivered';
      } else if (
        ord.trackingCode ||
        ord.status === 'shipped' ||
        ord.status === 'out_for_delivery'
      ) {
        tType = 'tracking_link';
      } else {
        tType = 'order_confirmed';
      }
    }
    setMessageTemplateType(tType);
    const text = buildOrderMessageText(ord, tType);
    setMessageCustomText(text);
    setMessageCopied(false);
  };

  const handleDispatchCustomerMessage = async (
    channel: 'wa_me' | 'sms_app' | 'copy_clipboard'
  ) => {
    if (!activeMessageOrder?.orderNo) return;
    setMessageSending(true);
    try {
      await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'record_dispatched_message',
          orderNo: activeMessageOrder.orderNo,
          eventKey: messageTemplateType,
          channel,
          recipientPhone: activeMessageOrder.customerPhone,
          messageText: messageCustomText,
        }),
      });

      const cleanPhone = (activeMessageOrder.customerPhone ?? '').replace(
        /\D/g,
        ''
      );
      const waPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;

      if (channel === 'wa_me') {
        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
          messageCustomText
        )}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } else if (channel === 'sms_app') {
        const smsUrl = `sms:${
          activeMessageOrder.customerPhone
        }?body=${encodeURIComponent(messageCustomText)}`;
        window.location.href = smsUrl;
      } else if (channel === 'copy_clipboard') {
        await navigator.clipboard.writeText(messageCustomText);
        setMessageCopied(true);
        setTimeout(() => setMessageCopied(false), 3000);
      }

      setActionFeedback({
        type: 'success',
        text: `${activeMessageOrder.orderNo}: মেসেজ সফলভাবে রেকর্ড ও পাঠানো হয়েছে।`,
      });
      await fetchWorkspace();
    } catch {
      setActionFeedback({
        type: 'error',
        text: 'মেসেজ লগ করতে সমস্যা হয়েছে।',
      });
    } finally {
      setMessageSending(false);
    }
  };

  const handleOpenMfsModal = (ord: EnrichedOrderRow) => {
    setMfsModalOrder(ord);
    const prov: 'bkash' | 'nagad' | 'rocket' =
      ord.paymentMethod === 'nagad_manual'
        ? 'nagad'
        : ord.paymentMethod === 'rocket_manual'
        ? 'rocket'
        : 'bkash';
    setMfsProvider(prov);
    setMfsSenderPhone(ord.customerPhone || '');
    setMfsTrxId(ord.manualPaymentTrxId || '');

    const advPoisha =
      Math.max(
        0,
        (ord.totalPayablePoisha ?? 0) - (ord.codCollectablePoisha ?? 0)
      ) || (ord.advancePaidPoisha ?? 0);
    const advTaka = advPoisha > 0 ? Math.round(advPoisha / 100) : 100;
    setMfsAmountTaka(String(advTaka));
    setMfsAutoVerify(true);
    setMfsNoteBn('');
    setMfsSelfApprovalBlocked(false);
    setMfsOverrideReason('');
  };

  const handleSaveMfsSubmission = async () => {
    if (!mfsModalOrder?.orderNo) return;
    const cleanTrx = mfsTrxId.trim().toUpperCase();
    if (!cleanTrx) {
      setActionFeedback({
        type: 'error',
        text: 'অনুগ্রহ করে সঠিক Transaction ID (TrxID) প্রদান করুন।',
      });
      return;
    }
    const amt = Number(mfsAmountTaka);
    if (!amt || amt <= 0) {
      setActionFeedback({
        type: 'error',
        text: 'অনুগ্রহ করে সঠিক পেমেন্ট পরিমাণ (টাকা) প্রদান করুন।',
      });
      return;
    }

    setIsSubmittingMfs(true);
    try {
      const overrideReason = mfsOverrideReason.trim();
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'input_manual_mfs',
          orderNo: mfsModalOrder.orderNo,
          provider: mfsProvider,
          senderPhone: mfsSenderPhone.trim() || mfsModalOrder.customerPhone,
          trxId: cleanTrx,
          amountTaka: amt,
          autoVerify: mfsAutoVerify,
          // The schema reads `reviewNoteBn`; `noteBn` was silently dropped.
          reviewNoteBn: mfsNoteBn.trim() || undefined,
          selfApprovalOverrideReasonBn:
            overrideReason.length >= 5 ? overrideReason : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data?.makerCheckerBlocked) {
          // Keep the modal open and offer the audited override instead of a
          // dead end — the submission itself was already recorded.
          setMfsSelfApprovalBlocked(true);
          setActionFeedback({
            type: 'error',
            text:
              'পেমেন্ট জমা হয়েছে কিন্তু মেকার-চেকার নীতির কারণে নিজে অনুমোদন করা যাবে না। নিচে কারণ লিখে ওভাররাইড করুন, অথবা অন্য অ্যাডমিনকে অনুমোদন করতে দিন।',
          });
          await fetchWorkspace();
          return;
        }
        setActionFeedback({
          type: 'error',
          text: data.submission
            ? `${data.errorBn || 'অনুমোদন ব্যর্থ হয়েছে।'} পেমেন্ট জমা হয়েছে; পুনরায় জমা না দিয়ে অর্ডার থেকে যাচাই করুন।`
            : data.errorBn || 'MFS পেমেন্ট সংরক্ষণ ব্যর্থ হয়েছে।',
        });
        return;
      }

      setActionFeedback({
        type: 'success',
        text: `${mfsModalOrder.orderNo}: ${mfsProvider.toUpperCase()} TrxID (${cleanTrx}) সফলভাবে ${
          mfsAutoVerify ? 'যাচাই ও কনফার্ম' : 'সংরক্ষিত'
        } করা হয়েছে।`,
      });
      setMfsModalOrder(null);
      await fetchWorkspace();
    } catch {
      setActionFeedback({
        type: 'error',
        text: 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।',
      });
    } finally {
      setIsSubmittingMfs(false);
    }
  };

  React.useEffect(() => {
    // Only poll while the operation is actually permitted; otherwise this
    // interval would hit a denied endpoint every five minutes forever.
    if (!trackingSyncAvailable) return;
    const timer = setInterval(() => {
      fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'sync_courier_tracking' }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && data?.updatedCount > 0) {
            setLastTrackingSyncAt(new Date().toLocaleTimeString(locale === 'bn' ? 'bn-BD' : 'en-US'));
            fetchWorkspace();
          } else if (data && data.success === false) {
            setTrackingSyncAvailable(false);
          }
        })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, trackingSyncAvailable]);

  const handlePhoneLookupInSmartEntry = async (phoneVal: string) => {
    setSmartPhone(phoneVal);
    const norm = normalizeBdPhone(phoneVal);
    if (!norm) {
      setSmartCustomerHistory(null);
      return;
    }
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'lookup_phone',
          phone: norm,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        history?: typeof smartCustomerHistory;
      };
      if (data.success && data.history) {
        setSmartCustomerHistory(data.history);
      }
    } catch {
      // Ignore lookup error
    }
  };

  const brandName =
    locale === 'bn' ? siteSettings.brandNameBn : siteSettings.brandNameEn;

  // ============================================================================
  // VIEW 1: LOADING STATE
  // ============================================================================
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
        <div className="max-w-sm w-full border border-border rounded-[var(--radius-lg)] p-6 bg-surface text-center space-y-2">
          <p className="text-sm font-bold text-ink">
            {locale === 'bn'
              ? 'অ্যাডমিন সিকিউরিটি সেশন যাচাই হচ্ছে...'
              : 'Verifying Admin Security Session...'}
          </p>
          <p className="text-xs text-muted"><LocalizedText source={"RBAC + TOTP 2FA Gate"} area="admin" /></p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: FIRST-LOGIN PASSWORD ROTATION & MANDATORY TOTP 2FA ENROLLMENT GATE
  // ============================================================================
  if (gateUser) {
    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-4">
        <Card surface="surface" padding="lg" className="max-w-lg w-full space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="space-y-1">
              <Badge status="warning">
                {locale === 'bn'
                  ? 'বাধ্যতামূলক প্রথম লগইন সিকিউরিটি গেট'
                  : 'Mandatory First-Login Security Gate'}
              </Badge>
              <h1 className="text-lg sm:text-xl font-bold text-ink">
                {locale === 'bn'
                  ? 'পাসওয়ার্ড পরিবর্তন ও TOTP 2FA এনরোলমেন্ট'
                  : 'Password Rotation & TOTP 2FA Enrollment'}
              </h1>
            </div>
            <KeyRound className="w-6 h-6 text-ink shrink-0" aria-hidden="true" />
          </div>

          <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg text-xs space-y-1.5">
            <p className="font-semibold text-ink">
              <LocalizedText source={"ইউজার:"} area="admin" />{" "}<span className="font-mono">@{gateUser.username}</span> (
              {gateUser.roleSlug})
            </p>
            <p className="text-muted">
              {gateUser.require2fa
                ? <LocalizedText source={"নিরাপত্তা নীতিমালা অনুযায়ী টেম্পোরারি পাসওয়ার্ড পরিবর্তন এবং Google Authenticator 2FA সক্রিয় না করা পর্যন্ত কোনো পেজ বা API অ্যাক্সেস করা যাবে না।"} area="admin" />
                : (locale === 'bn' ? 'প্রথম লগইনে টেম্পোরারি পাসওয়ার্ড পরিবর্তন করুন। 2FA আপাতত বন্ধ আছে।' : 'Change your temporary password at first login. 2FA is currently off.')}
            </p>
            {gateUser.require2fa && gateTotpUri && (
              <p className="font-mono text-ink pt-1 break-all">
                <LocalizedText source={"RFC 6238 Authenticator Setup URI:"} area="admin" />{' '}
                <strong>{gateTotpUri}</strong>
              </p>
            )}
          </div>

          <form onSubmit={handleCompleteFirstLoginGate} className="space-y-4">
            <Input
              label={
                locale === 'bn'
                  ? 'বর্তমান টেম্পোরারি পাসওয়ার্ড *'
                  : 'Current Temporary Password *'
              }
              type="password"
              value={gateCurrentPass}
              onChange={(e) => setGateCurrentPass(e.target.value)}
              required
            />
            <Input
              label={
                locale === 'bn'
                  ? 'নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর) *'
                  : 'New Password (Min 8 Characters) *'
              }
              type="password"
              value={gateNewPass}
              onChange={(e) => setGateNewPass(e.target.value)}
              placeholder="NewSecure#2026"
              required
            />
            {gateUser.require2fa && (
              <Input
                label={
                  locale === 'bn'
                    ? '৬ সংখ্যার Google Authenticator TOTP কোড *'
                    : '6-Digit TOTP Verification Code *'
                }
                value={gateTotp}
                onChange={(e) => setGateTotp(e.target.value)}
                placeholder="123456"
                required
              />
            )}

            {gateError && (
              <p className="text-xs font-medium text-danger">{gateError}</p>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setGateUser(null)}
              >
                {locale === 'bn' ? 'ফিরে যান' : 'Back to Login'}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={gateSubmitting}
              >
                {gateSubmitting
                  ? 'যাচাই হচ্ছে...'
                  : locale === 'bn'
                  ? 'পাসওয়ার্ড ও 2FA নিশ্চিত করুন'
                  : 'Complete Security Gate'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: STRICT ADMIN ERP LOGIN GATE (CONFIRMED DECISION 2)
  // ============================================================================
  if (!snapshot || !snapshot.authorized || !snapshot.currentUser) {
    return (
      <div className="min-h-screen bg-bg text-ink flex flex-col justify-center py-10 px-4">
        <div className="max-w-4xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {workspaceLoadFailed && (
            <div
              role="alert"
              className="lg:col-span-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-[var(--radius-md)] border border-warning bg-warning/10 p-4 text-sm text-ink"
            >
              <span>
                {locale === 'bn'
                  ? 'অ্যাডমিন সার্ভার এখন সাড়া দিচ্ছে না। লগইন করার আগে সংযোগ আবার চেষ্টা করুন।'
                  : 'The admin service is unavailable. Please retry the connection before signing in.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchWorkspace()}
              >
                {locale === 'bn' ? 'আবার চেষ্টা করুন' : 'Retry'}
              </Button>
            </div>
          )}
          {/* Left: Strict Username + Password + TOTP 2FA Login Card */}
          <Card
            surface="surface"
            padding="lg"
            className="lg:col-span-6 space-y-6"
          >
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-xs font-mono uppercase text-muted">
                  <LocalizedText source={"CONSIGNMENT ERP AUTH GATE"} area="admin" />{" "}</p>
                <h1 className="text-xl font-bold text-ink mt-0.5">
                  {brandName} — {locale === 'bn' ? 'অ্যাডমিন লগইন' : 'Admin Login'}
                </h1>
              </div>
              <Lock className="w-5 h-5 text-ink" aria-hidden="true" />
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <Input
                label={
                  locale === 'bn'
                    ? 'ইউজারনেম (Username) *'
                    : 'Username (Lowercase) *'
                }
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="admin"
                required
              />
              <Input
                label={locale === 'bn' ? 'পাসওয়ার্ড (Password) *' : 'Password *'}
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              {loginTotpEnabled && <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">
                    {locale === 'bn'
                    ? 'RFC 6238 TOTP কোড (শুধু 2FA চালু থাকলে)'
                    : 'Authenticator code (only when 2FA is enabled)'}
                  </span>
                </div>
                <Input
                  value={loginTotp}
                  onChange={(e) => setLoginTotp(e.target.value)}
                  placeholder={
                    locale === 'bn'
                      ? 'অথেনটিকেটর অ্যাপের ৬ সংখ্যার TOTP কোড'
                      : '6-Digit RFC 6238 TOTP'
                  }
                />
              </div>}

              {loginError && (
                <div
                  role="alert"
                  className="p-3 border border-danger rounded-[var(--radius-md)] bg-bg text-xs font-medium text-danger flex items-center gap-2"
                >
                  <AlertCircle
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{loginError}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={loginLoading}
                className="w-full"
                leftIcon={
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                }
              >
                {loginLoading
                  ? locale === 'bn'
                    ? 'লগইন যাচাই হচ্ছে...'
                    : 'Authenticating...'
                  : locale === 'bn'
                  ? 'লগইন করে ইআরপি-তে প্রবেশ করুন'
                  : 'Log in to Admin ERP'}
              </Button>
            </form>

            <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted">
              <span><LocalizedText source={"৫ বার ভুল চেষ্টায় ৩০ মিনিট অটো-লকআউট"} area="admin" /></span>
              <Link href="/" className="text-ink font-semibold hover:underline">
                {locale === 'bn' ? 'স্টোরফ্রন্টে ফিরুন' : 'Back to Storefront'}
              </Link>
            </div>
          </Card>

          {/* Same layout; no published credentials or TOTP previews. */}
          <Card surface="bg" padding="lg" className="lg:col-span-6 space-y-4">
            <div className="border-b border-border pb-3">
              <h2 className="text-base font-bold text-ink">
                {locale === 'bn'
                  ? 'নিরাপদ অ্যাকাউন্ট প্রবেশ'
                  : 'Secure Account Access'}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {locale === 'bn' ? 'আপনার অনুমোদিত ইউজারনেম ও পাসওয়ার্ড ব্যবহার করুন; 2FA চালু থাকলেই শুধু অথেনটিকেটর কোড দিন। এখানে কোনো ডেমো পাসওয়ার্ড বা 2FA প্রিভিউ দেওয়া হয় না।' : 'Use your authorized username and password; enter an authenticator code only when 2FA is enabled for the account. Demo passwords and 2FA previews are not published here.'}
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs text-muted">{locale === 'bn' ? 'প্রথম লগইনে পাসওয়ার্ড পরিবর্তন প্রয়োজন হতে পারে। Production identity সংযুক্ত না থাকলে প্রবেশ বন্ধ থাকবে।' : 'First login may require a password change. Production access stays disabled until an identity adapter is integrated.'}</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 4: AUTHENTICATED ADMIN ERP WORKSPACE (PHASE 4A)
  // ============================================================================
  const currentUser = snapshot.currentUser;
  const isSuperAdmin = currentUser.roleSlug === 'super_admin';
  const isVendor = currentUser.roleSlug === 'vendor';
  const orders = snapshot.orders ?? [];
  const products = snapshot.products ?? [];
  const today = snapshot.todayQueues ?? {
    callToConfirmCount: 0,
    fixAddressCount: 0,
    verifyBkashCount: 0,
    readyToPackCount: 0,
    readyToBookCourierCount: 0,
    awaitingCodRemittanceCount: 0,
    lowStockVariantsCount: 0,
  };

  // Filtered Orders for Module N (Orders Grid)
  const filteredOrders = orders.filter((ord) => {
    if (statusFilter !== 'ALL' && ord.status !== statusFilter) return false;
    if (nextActionFilter !== 'ALL' && ord.nextBestAction !== nextActionFilter) {
      return false;
    }
    const q = orderSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (ord.orderNo ?? '').toLowerCase().includes(q) ||
      (ord.customerName ?? '').toLowerCase().includes(q) ||
      (ord.customerPhone ?? '').toLowerCase().includes(q) ||
      (ord.districtNameBn ?? '').toLowerCase().includes(q) ||
      (ord.trackingCode ?? '').toLowerCase().includes(q)
    );
  });

  // Bulk ship can only touch packed orders that already carry a tracking code —
  // exactly what the state machine demands for packed -> shipped.
  const bulkShipEligible = React.useMemo(
    () =>
      orders
        .filter(
          (ord) =>
            selectedOrderNos.includes(ord.orderNo ?? '') &&
            ord.status === 'packed' &&
            Boolean(ord.trackingCode?.trim() || ord.consignmentId?.trim())
        )
        .map((ord) => ord.orderNo!)
        .filter(Boolean),
    [orders, selectedOrderNos]
  );

  // Smart Order Entry Live Profit & Delivery Calculation
  const allVariantsFlat = products.flatMap((p) =>
    (p.variants ?? []).map((v) => ({
      product: p,
      variant: v,
    }))
  );
  const selectedSmartPair =
    allVariantsFlat.find((x) => x.variant.variantId === smartVariantId) ??
    allVariantsFlat[0];

  const smartDistrict =
    getDistrictById(smartDistrictId) ?? getDistrictById(47)!;
  const smartUpazilas = getThanasByDistrict(smartDistrict.id);
  const smartRates = getDistrictDeliveryRates(
    smartDistrict.id,
    siteSettings.bdPostDefaultPerKgPoisha
  );

  const smartLineSubtotalPoisha =
    (selectedSmartPair?.variant.salePricePoisha ?? 0) * smartQuantity;
  const smartLineWeightGrams =
    (selectedSmartPair?.variant.weightGrams ?? 500) * smartQuantity;

  const smartDeliveryCalc = calculateDeliveryCharge({
    method: smartDeliveryMethod,
    totalWeightGrams: smartLineWeightGrams,
    orderSubtotalPoisha: smartLineSubtotalPoisha,
    freeDeliveryThresholdPoisha: siteSettings.freeDeliveryThresholdPoisha,
    isGlobalFreeDelivery: siteSettings.globalFreeDelivery,
    isAllItemsFreeDelivery: Boolean(selectedSmartPair?.product.isFreeDelivery),
    courierBaseRate1KgPoisha: smartRates.base1KgPoisha,
    courierExtraPerKgPoisha: smartRates.extraPerKgPoisha,
    bdPostPerKgPoisha: smartRates.bdPostPerKgPoisha,
  });

  const smartAddrQuality = evaluateAddressQuality({
    districtId: smartDistrict.id,
    upazilaId: smartUpazilaId,
    streetAddress: smartStreet,
    landmark: smartLandmark,
    customerPhone: smartPhone || '01700000000',
  });

  // Profit-at-Entry (Super Admin Only)
  const smartSupplierPayablePoisha =
    (selectedSmartPair?.variant.supplierPayablePoisha ?? 0) * smartQuantity;
  const smartDeliverySubsidyPoisha = Math.max(
    0,
    smartDeliveryCalc.actualCourierCostPoisha -
      smartDeliveryCalc.finalChargePoisha
  );
  const smartEstimatedProfitPoisha =
    smartLineSubtotalPoisha -
    smartSupplierPayablePoisha -
    smartDeliverySubsidyPoisha -
    (snapshot?.siteSettings?.defaultPackagingCostPoisha ?? 0);

  const NAV_SECTIONS: Array<{
    groupLabelBn: string;
    groupLabelEn: string;
    items: Array<{
      key: AdminTabKey;
      /** Short label for the sidebar; must stay readable when truncated. */
      labelBn: string;
      labelEn: string;
      /** Optional descriptive title used in the page header only. */
      fullLabelBn?: string;
      fullLabelEn?: string;
      icon: React.ReactNode;
      badge?: number | string;
      badgeStatus?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
      hidden?: boolean;
    }>;
  }> = [
    {
      groupLabelBn: '০১. ওভারভিউ',
      groupLabelEn: '01. Overview',
      items: [
        {
          key: 'today_screen',
          labelBn: 'আজকের কাজ',
          labelEn: 'Today',
          fullLabelBn: 'আজকের অপারেশনাল কমান্ড সেন্টার',
          fullLabelEn: 'Today Operational Command Center',
          icon: <Eye className="w-4 h-4 shrink-0" aria-hidden="true" />,
          badge:
            today.callToConfirmCount + today.readyToPackCount > 0
              ? today.callToConfirmCount + today.readyToPackCount
              : undefined,
          badgeStatus: 'warning',
        },
      ],
    },
    {
      groupLabelBn: '০২. অর্ডার',
      groupLabelEn: '02. Orders',
      items: [
        {
          key: 'orders_grid',
          labelBn: 'অর্ডার গ্রিড',
          labelEn: 'Orders Grid',
          fullLabelBn: 'অর্ডার গ্রিড ও ভেরিফিকেশন',
          fullLabelEn: 'Orders Grid & Verification',
          icon: <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />,
          badge: orders.length,
          badgeStatus: 'neutral',
        },
        {
          key: 'smart_order_entry',
          labelBn: 'নতুন অর্ডার',
          labelEn: 'New Order',
          fullLabelBn: 'নতুন স্মার্ট অর্ডার এন্ট্রি',
          fullLabelEn: 'Smart Order Entry',
          icon: <PlusCircle className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
        },
      ],
    },
    {
      groupLabelBn: '০৩. ক্যাটালগ',
      groupLabelEn: '03. Catalog',
      items: [
        {
          key: 'product_studio',
          labelBn: 'প্রোডাক্ট স্টুডিও',
          labelEn: 'Product Studio',
          fullLabelBn: 'প্রোডাক্ট ও ক্যাটাগরি স্টুডিও',
          fullLabelEn: 'Product & Category Studio',
          icon: <Package className="w-4 h-4 shrink-0" aria-hidden="true" />,
          badge: snapshot.products ? `${snapshot.products.length}` : undefined,
        },
      ],
    },
    {
      groupLabelBn: '০৪. ভেন্ডর ও এসক্রো',
      groupLabelEn: '04. Vendor & Escrow',
      items: [
        {
          key: 'vendor_escrow',
          labelBn: 'ভেন্ডর লেজার ও পেআউট',
          labelEn: 'Vendor Ledger & Payouts',
          fullLabelBn: 'ভেন্ডর ডাইরেক্টরি, এসক্রো লেজার ও পেআউট',
          fullLabelEn: 'Vendor Directory, Escrow Ledger & Payouts',
          icon: <Wallet className="w-4 h-4 shrink-0" aria-hidden="true" />,
        },
        {
          key: 'vendor_payouts',
          labelBn: 'পেআউট রেজিস্টার',
          labelEn: 'Payout Register',
          fullLabelBn: 'ভেন্ডর পেআউট রেজিস্টার ও নিষ্পত্তি',
          fullLabelEn: 'Vendor Payout Register & Settlement',
          icon: <Banknote className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin,
          badge:
            snapshot.vendorEscrow?.payoutRequests?.filter(
              (p) => p.status === 'requested' || p.status === 'approved'
            ).length || undefined,
          badgeStatus: 'warning',
        },
        {
          key: 'vendor_control',
          labelBn: 'ভেন্ডর অনুমতি',
          labelEn: 'Vendor Permissions',
          fullLabelBn: 'ভেন্ডর প্যানেল নিয়ন্ত্রণ ও অনুমতি',
          fullLabelEn: 'Vendor Panel Control & Permissions',
          icon: <Store className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin,
          badge: snapshot.vendors?.length || undefined,
        },
      ],
    },
    {
      groupLabelBn: '০৫. পোর্টাল ও অ্যাকাউন্টিং',
      groupLabelEn: '05. Portal & Accounting',
      items: [
        {
          key: 'phase7_portal',
          labelBn: 'ভেন্ডর পোর্টাল ও অ্যাকাউন্টিং',
          labelEn: 'Vendor Portal & Accounting',
          fullLabelBn: 'সেলফ-সার্ভিস ভেন্ডর পোর্টাল, প্রোমো ও একাউন্টিং',
          fullLabelEn: 'Vendor Portal, Promo & Executive Accounting',
          icon: <Store className="w-4 h-4 shrink-0" aria-hidden="true" />,
          badge: snapshot.phase7Overview
            ? `${snapshot.phase7Overview.consignmentLots.filter((l) => l.status === 'pending_qc').length}`
            : undefined,
        },
      ],
    },
    {
      groupLabelBn: '০৬. কুরিয়ার',
      groupLabelEn: '06. Courier',
      items: [
        {
          key: 'courier_360',
          labelBn: 'কুরিয়ার ও রেট',
          labelEn: 'Courier & Rates',
          fullLabelBn: 'কুরিয়ার ৩৬০, ম্যানিফেস্ট ও রেট',
          fullLabelEn: 'Courier 360, Manifest & Rates',
          icon: <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
        },
      ],
    },
    {
      groupLabelBn: '০৭. ফাইন্যান্স',
      groupLabelEn: '07. Finance',
      items: [
        {
          key: 'finance_product360',
          labelBn: 'ফাইন্যান্স ও মানি-ম্যাপ',
          labelEn: 'Finance & Money Map',
          fullLabelBn: 'ফাইন্যান্স, মানি-ম্যাপ, প্রোমো ও প্রোডাক্ট ৩৬০',
          fullLabelEn: 'Finance, Money Map, Promo & Product 360',
          icon: <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />,
        },
      ],
    },
    {
      groupLabelBn: '০৮. লাইভ অপারেশনস',
      groupLabelEn: '08. Live Operations',
      items: [
        {
          key: 'phase6_ops',
          labelBn: 'লাইভ অপস ও CRM',
          labelEn: 'Live Ops & CRM',
          fullLabelBn: 'লাইভ অপারেশনস, কার্ট রিকভারি CRM ও ব্যাকআপ',
          fullLabelEn: 'Live Operations, Cart Recovery CRM & Backup',
          icon: <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
          badge: snapshot.phase6Overview
            ? `${snapshot.phase6Overview.abandonedCarts.filter((c) => !c.isRecovered).length}`
            : undefined,
        },
      ],
    },
    {
      groupLabelBn: '০৯. মেসেজিং',
      groupLabelEn: '09. Messaging',
      items: [
        {
          key: 'contact_management',
          labelBn: 'যোগাযোগ',
          labelEn: 'Contacts',
          fullLabelBn: 'গ্রাহক যোগাযোগ ব্যবস্থাপনা',
          fullLabelEn: 'Customer Contact Management',
          icon: <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin,
          badge: snapshot.inquiries?.filter(inquiry => inquiry.status === 'unread').length ? String(snapshot.inquiries.filter(inquiry => inquiry.status === 'unread').length) : undefined,
        },
        {
          key: 'messaging_automation',
          labelBn: 'মেসেজিং ও সিঙ্ক',
          labelEn: 'Messaging & Sync',
          fullLabelBn: 'মেসেজিং টেমপ্লেট ও শিট সিঙ্ক',
          fullLabelEn: 'Messaging Templates & Sheet Sync',
          icon: <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
        },
      ],
    },
    {
      groupLabelBn: '১০. প্রিন্ট ও ইনভয়েস',
      groupLabelEn: '10. Print & Invoice',
      items: [
        {
          key: 'print_engine',
          labelBn: 'প্রিন্ট ও ইনভয়েস',
          labelEn: 'Print & Invoice',
          fullLabelBn: 'প্রিন্ট ইঞ্জিন ও ইনভয়েস স্টুডিও',
          fullLabelEn: 'Print Engine & Invoice Studio',
          icon: <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />,
        },
      ],
    },
    {
      groupLabelBn: '১১. অডিট ও সিকিউরিটি',
      groupLabelEn: '11. Audit & Security',
      items: [
        {
          key: 'phase5_readiness',
          labelBn: 'অডিট রিপোর্ট',
          labelEn: 'Audit Reports',
          fullLabelBn: 'প্রি-লঞ্চ অডিট ও সিকিউরিটি রিপোর্টস',
          fullLabelEn: 'Pre-Launch Audit & Security Reports',
          icon: <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin,
          badge: snapshot.phase5Audit
            ? `${snapshot.phase5Audit.passedChecks}/${snapshot.phase5Audit.totalChecks}`
            : '12/12',
        },
      ],
    },
    {
      groupLabelBn: '১২. টিম ও অ্যাক্সেস',
      groupLabelEn: '12. Team & Access',
      items: [
        {
          key: 'users_and_rbac',
          labelBn: 'ইউজার ও রোল',
          labelEn: 'Users & Roles',
          fullLabelBn: 'ইউজার ও RBAC সিকিউরিটি ম্যাট্রিক্স',
          fullLabelEn: 'Users & RBAC Security Matrix',
          icon: <Users className="w-4 h-4 shrink-0" aria-hidden="true" />,
        },
      ],
    },
    {
      groupLabelBn: '১৩. সিস্টেম',
      groupLabelEn: '13. System',
      items: [
        {
          key: 'control_center',
          labelBn: 'কন্ট্রোল সেন্টার',
          labelEn: 'Control Center',
          fullLabelBn: 'কন্ট্রোল সেন্টার ও সিকিউরিটি',
          fullLabelEn: 'Control Center & Security',
          icon: <Sliders className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin,
        },
      ],
    },
  ];

  const currentTabTitle =
    NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === activeTab);

  return (
    <div className="min-h-[100dvh] flex bg-bg text-ink pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Mobile Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label={uiText("Close Mobile Sidebar", locale)}
          onClick={() => setIsMobileSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setIsMobileSidebarOpen(false);
          }}
          className="fixed inset-0 z-50 bg-ink/40 lg:hidden"
        />
      )}

      {/* Modern Admin ERP Side Navigation Panel */}
      <aside
        aria-label={locale === 'bn' ? 'অ্যাডমিন নেভিগেশন' : 'Admin navigation'}
        className={`fixed lg:sticky top-0 left-0 z-50 h-[100dvh] w-[min(16rem,85vw)] shrink-0 border-r border-border bg-surface transition-all duration-200 flex flex-col justify-between pb-[env(safe-area-inset-bottom)] ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isSidebarCollapsed ? 'lg:w-18' : 'lg:w-64'}`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Sidebar Header Brand Zone */}
          <div className="h-14 border-b border-border px-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-[var(--radius-md)] border border-ink bg-ink text-bg flex items-center justify-center font-bold text-sm shrink-0">
                <LocalizedText source={"প"} area="admin" />{" "}</div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <p className="font-bold text-sm tracking-tight text-ink truncate leading-tight">
                    {brandName}
                  </p>
                  <p className="text-[11px] font-mono text-muted uppercase tracking-wider">
                    <LocalizedText source={"Panchabindu ERP"} area="admin" />{" "}</p>
                </div>
              )}
            </div>

            {/* Collapse / Close Buttons */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden lg:flex p-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink cursor-pointer"
                title={isSidebarCollapsed ? 'সাইডবার প্রসারিত করুন' : 'সাইডবার সংকুচিত করুন'}
                aria-label={isSidebarCollapsed ? (locale === 'bn' ? 'সাইডবার প্রসারিত করুন' : 'Expand sidebar') : (locale === 'bn' ? 'সাইডবার সংকুচিত করুন' : 'Collapse sidebar')}
              >
                {isSidebarCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="lg:hidden w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] border border-border bg-bg text-ink cursor-pointer"
                aria-label={locale === 'bn' ? 'মেনু বন্ধ করুন' : 'Close menu'}
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* User Profile Mini Badge in Sidebar */}
          <div className="p-3 border-b border-border bg-bg/50">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full border border-border bg-surface text-ink flex items-center justify-center text-xs font-bold shrink-0">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink truncate">
                    @{currentUser.username}
                  </p>
                  <p className="text-[10px] font-mono text-muted truncate">
                    {currentUser.roleSlug}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Categorized Nav Links */}
          <nav aria-label={uiText("Admin ERP Sidebar", locale)} className="p-2 space-y-4 text-xs font-medium">
            {NAV_SECTIONS.map((section) => {
              const visibleItems = section.items.filter((item) => !item.hidden);
              if (visibleItems.length === 0) return null;

              return (
                <div key={section.groupLabelEn} className="space-y-1">
                  {!isSidebarCollapsed && (
                    <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                      {locale === 'bn' ? section.groupLabelBn : section.groupLabelEn}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = activeTab === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.key);
                            setIsMobileSidebarOpen(false);
                          }}
                          title={locale === 'bn' ? item.labelBn : item.labelEn}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-full min-h-[40px] flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] transition-all cursor-pointer text-left ${
                            isActive
                              ? 'bg-ink text-bg font-bold shadow-xs'
                              : 'text-ink hover:bg-bg border border-transparent hover:border-border'
                          } ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between'}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.icon}
                            {!isSidebarCollapsed && (
                              <span className="truncate">
                                {locale === 'bn' ? item.labelBn : item.labelEn}
                              </span>
                            )}
                          </div>
                          {!isSidebarCollapsed && item.badge !== undefined && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full border ${
                                  isActive
                                    ? 'border-bg/40 bg-bg text-ink'
                                    : 'border-border bg-bg text-muted'
                                }`}
                              >
                                {item.badge}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Zone (Storefront Link & Locale Toggle) */}
        <div className="p-2.5 border-t border-border bg-bg/50 space-y-1.5 shrink-0">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-1.5">
              <Link href="/" className="flex-1 inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-xs font-medium text-ink hover:border-ink">
                <Store className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{locale === 'bn' ? 'স্টোরফ্রন্ট' : 'Store'}</span>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleLocale}
                className="px-2 font-mono"
              >
                {locale === 'bn' ? 'EN' : 'বাং'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Link href="/" title={uiText("স্টোরফ্রন্ট", locale)}>
                <div className="p-2 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:border-ink">
                  <Store className="w-4 h-4" aria-hidden="true" />
                </div>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Top Bar for Workspace Status, Title & Quick Actions */}
        <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-xs px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIsSidebarCollapsed(false);
                setIsMobileSidebarOpen(true);
              }}
              className="lg:hidden w-10 h-10 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface text-ink cursor-pointer"
              aria-label={uiText("Open Sidebar Menu", locale)}
              aria-expanded={isMobileSidebarOpen}
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-ink truncate">
                {locale === 'bn'
                  ? currentTabTitle?.fullLabelBn ?? currentTabTitle?.labelBn
                  : currentTabTitle?.fullLabelEn ?? currentTabTitle?.labelEn}
              </h1>
              <button
                type="button"
                onClick={() => setHelpModalTab(activeTab)}
                className="w-7 h-7 sm:w-5 sm:h-5 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors shrink-0 cursor-pointer"
                title={locale === 'bn' ? 'মডিউল কার্যপ্রণালী গাইড (!)' : 'Module Help Guide (!)'}
                aria-label={uiText("Module Help Guide", locale)}
              >
                !
              </button>
              <span className="hidden sm:inline text-xs font-mono text-muted">
                · {currentUser.roleSlug}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Bilingual Toggle Button (EN / বাং) */}
            <button
              type="button"
              onClick={toggleLocale}
              aria-label={uiText("Toggle admin language", locale)}
              className="flex items-center text-xs font-semibold border border-border rounded-full p-0.5 bg-surface h-8 transition-colors cursor-pointer"
              title={locale === 'bn' ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
            >
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                  locale === 'en'
                    ? 'bg-ink text-bg font-bold'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <LocalizedText source={"EN"} area="admin" />{" "}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                  locale === 'bn'
                    ? 'bg-ink text-bg font-bold'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <LocalizedText source={"বাং"} area="admin" />{" "}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsNotificationOpen(true)}
              className="relative p-2 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:bg-bg transition-colors cursor-pointer"
              aria-label={locale === 'bn' ? 'নোটিফিকেশন সেন্টার' : 'Notification Center'}
              title={locale === 'bn' ? 'নোটিফিকেশন সেন্টার' : 'Notification Center'}
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-2xs">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchWorkspace()}
              aria-label={locale === 'bn' ? 'রিফ্রেশ' : 'Refresh'}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">{locale === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              aria-label={locale === 'bn' ? 'লগআউট' : 'Logout'}
              leftIcon={<LogOut className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">{locale === 'bn' ? 'লগআউট' : 'Logout'}</span>
            </Button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
        {/* Action Feedback Toast Banner */}
        {actionFeedback && (
          <div
            role="status"
            className={`p-3 border rounded-[var(--radius-md)] bg-surface flex items-center justify-between gap-3 text-xs font-medium ${
              actionFeedback.type === 'success'
                ? 'border-success text-success'
                : 'border-danger text-danger'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>{actionFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="underline cursor-pointer text-ink"
            >
              <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
          </div>
        )}

        {/* Role Context Strip */}
        <div className="p-3 border border-border rounded-[var(--radius-md)] bg-surface flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink">
              {locale === 'bn' ? 'সক্রিয় রোল:' : 'Active Role:'}{' '}
              {localizedField(snapshot.activeRole, "nameBn", locale)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-muted">
              {isSuperAdmin
                ? 'সকল কস্ট, প্ল্যাটফর্ম মার্জিন ও নেট প্রফিট দৃশ্যমান (Full Access)'
                : isVendor
                ? 'শুধুমাত্র নিজস্ব কনসাইনমেন্ট পণ্য দৃশ্যমান; গ্রাহকের ফোন/ঠিকানা মাস্কড এবং প্ল্যাটফর্ম প্রফিট লুকানো'
                : 'কেনা দাম (Supplier Cost) এবং প্ল্যাটফর্ম নেট প্রফিট সার্ভার থেকে লুকানো (RLS Field-Hiding Active)'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchWorkspace()}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            {locale === 'bn' ? 'রিফ্রেশ' : 'Refresh'}
          </Button>
        </div>

        {/* ==================================================================
            TAB 1: TODAY OPERATIONAL COMMAND SCREEN (MODULE M)
           ================================================================== */}
        {activeTab === 'today_screen' && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h1 className="text-xl font-bold text-ink">
                  {locale === 'bn'
                    ? 'আজকের অপারেশনাল কমান্ড স্ক্রিন (Today Screen)'
                    : 'Today Operational Command Screen'}
                </h1>
                <p className="text-xs text-muted">
                  {locale === 'bn'
                    ? 'আজকে কাকে কল দিতে হবে, কোন ঠিকানা ঠিক করতে হবে এবং কোন পার্সেল প্যাক বা বুক করতে হবে—এক ট্যাপে সম্পন্ন করুন।'
                    : 'Review pending calls, fix address issues, verify transactions, and pack/book consignments with one tap.'}
                </p>
              </div>
            </div>

            {/* 6 Operational Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <button
                type="button"
                onClick={() => {
                  setNextActionFilter('CALL_TO_CONFIRM');
                  setActiveTab('orders_grid');
                }}
                className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
              >
                <p className="text-xs text-muted">{locale === 'bn' ? 'কনফার্মেশন কল বাকি' : 'Pending Calls'}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-warning">
                  {formatLocaleNumber(today.callToConfirmCount, locale)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNextActionFilter('FIX_ADDRESS');
                  setActiveTab('orders_grid');
                }}
                className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
              >
                <p className="text-xs text-muted">{locale === 'bn' ? 'ঠিকানা সংশোধন বাকি' : 'Address Issues'}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-danger">
                  {formatLocaleNumber(today.fixAddressCount, locale)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNextActionFilter('VERIFY_BKASH_TRX');
                  setActiveTab('orders_grid');
                }}
                className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
              >
                <p className="text-xs text-muted">{locale === 'bn' ? 'বিকাশ TrxID যাচাই' : 'Verify bKash Trx'}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-warning">
                  {formatLocaleNumber(today.verifyBkashCount, locale)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNextActionFilter('READY_TO_PACK');
                  setActiveTab('orders_grid');
                }}
                className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
              >
                <p className="text-xs text-muted">{locale === 'bn' ? 'প্যাকিংয়ের জন্য প্রস্তুত' : 'Ready to Pack'}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-info">
                  {formatLocaleNumber(today.readyToPackCount, locale)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNextActionFilter('READY_TO_BOOK_COURIER');
                  setActiveTab('orders_grid');
                }}
                className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
              >
                <p className="text-xs text-muted flex items-center justify-between gap-1">
                  <span>{locale === 'bn' ? 'কুরিয়ার বুকিং বাকি' : 'Book Courier'}</span>
                  <InfoTooltip termKey="cod_receivable" />
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-ink">
                  {formatLocaleNumber(today.readyToBookCourierCount, locale)}
                </p>
              </button>

              <div className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg space-y-1">
                <p className="text-xs text-muted flex items-center justify-between gap-1">
                  <span>{locale === 'bn' ? 'লো-স্টক ভ্যারিয়েন্ট' : 'Low Stock Alert'}</span>
                  <InfoTooltip termKey="available_stock" />
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-danger">
                  {formatLocaleNumber(today.lowStockVariantsCount, locale)}
                </p>
              </div>
            </div>

            {/* Financial & Technical Glossary Strip with ⓘ Tooltips (Section 7.4) */}
            <Card surface="surface" padding="sm" className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-ink">
                  {locale === 'bn'
                    ? 'কনসাইনমেন্ট ফিন্যান্সিয়াল ও অপারেশনাল টার্ম গাইড (ⓘ ক্লিক বা হোভার করুন):'
                    : 'Consignment Finance & Operational Glossary (Hover ⓘ):'}
                </p>
                <span className="text-[11px] font-mono text-muted">
                  <LocalizedText source={"Integer Poisha Engine · Double-Entry Balanced"} area="admin" />{" "}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'সাপ্লায়ার প্রদেয় (Supplier Payable)' : 'Supplier Payable'}</span>
                  <InfoTooltip termKey="supplier_payable" />
                </span>
                {!isVendor && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                    <span>{locale === 'bn' ? 'প্ল্যাটফর্ম মার্জিন (Platform Margin)' : 'Platform Margin'}</span>
                    <InfoTooltip termKey="platform_margin" />
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'এসক্রো হোল্ডিং (Escrow Holding)' : 'Escrow Holding'}</span>
                  <InfoTooltip termKey="escrow_holding" />
                </span>
                {!isVendor && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                    <span>{locale === 'bn' ? 'সিওডি প্রাপ্য (COD Receivable)' : 'COD Receivable'}</span>
                    <InfoTooltip termKey="cod_receivable" />
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'সমন্বয় (Reconciliation)' : 'Reconciliation'}</span>
                  <InfoTooltip termKey="reconciliation" />
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'সংরক্ষিত স্টক (Reservation)' : 'Stock Reservation'}</span>
                  <InfoTooltip termKey="stock_reservation" />
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'পেআউট অপেক্ষমাণ (Settlement)' : 'Settlement Pending'}</span>
                  <InfoTooltip termKey="settlement_pending" />
                </span>
                {!isVendor && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                    <span>{locale === 'bn' ? 'ফ্রড ঝুঁকি (Fraud Risk)' : 'Fraud Risk'}</span>
                    <InfoTooltip termKey="fraud_risk" />
                  </span>
                )}
              </div>
            </Card>

            {/* Immediate Action Queue Rows */}
            <Card surface="bg" padding="md" className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-base font-bold text-ink">
                  {locale === 'bn'
                    ? 'তাৎক্ষণিক অ্যাকশন কিউ (১-ক্লিক প্রসেসিং)'
                    : 'Immediate Action Queue (1-Click Processing)'}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('orders_grid')}
                >
                  {locale === 'bn' ? `সব অর্ডার দেখুন (${orders.length})` : `View All Orders (${orders.length})`}
                </Button>
              </div>

              <div className="divide-y divide-border border border-border rounded-[var(--radius-md)]">
                {orders.map((ord) => {
                  const badgeMeta =
                    NEXT_ACTION_LABELS[ord.nextBestAction ?? 'COMPLETED'];
                  const waConfirmText = encodeURIComponent(
                    `আসসালামু আলাইকুম ${ord.customerName}, ${siteSettings.brandNameBn} থেকে আপনার অর্ডার ${ord.orderNo} (মোট ${formatPoishaToBdt(
                      ord.totalPayablePoisha ?? 0,
                      locale
                    )}) কনফার্ম করতে YES লিখে রিপ্লাই দিন।`
                  );
                  const cleanDigits = (ord.customerPhone ?? '').replace(
                    /\D/g,
                    ''
                  );
                  const waPhone = cleanDigits.startsWith('88')
                    ? cleanDigits
                    : `88${cleanDigits}`;

                  return (
                    <div
                      key={ord.orderNo}
                      className="p-3.5 bg-bg flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-ink">
                            {ord.orderNo}
                          </span>
                          <Badge status={badgeMeta.status}>
                            {locale === 'bn' ? badgeMeta.bn : badgeMeta.en}
                          </Badge>
                          <span className="text-muted">·</span>
                          <span className="font-semibold text-ink">
                            {ord.customerName}
                          </span>
                          <span className="font-mono text-muted">
                            ({ord.customerPhone})
                          </span>
                        </div>
                        <p className="text-muted">
                          {localizedField(ord, "upazilaNameBn", locale)}, {localizedField(ord, "districtNameBn", locale)} —{' '}
                          {ord.streetAddress}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isVendor && (
                          <>
                            <a
                              href={`tel:${ord.customerPhone}`}
                              onClick={() =>
                                void executeGridAction({
                                  orderNos: [ord.orderNo!],
                                  actionType: 'log_call_attempt',
                                })
                              }
                              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink font-medium"
                            >
                              <PhoneCall
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                              <span>{locale === 'bn' ? `কল (${ord.callAttempts})` : `Call (${ord.callAttempts})`}</span>
                            </a>

                            <a
                              href={`https://wa.me/${waPhone}?text=${waConfirmText}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink font-medium"
                            >
                              <MessageSquare
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                              <span><LocalizedText source={"wa.me"} area="admin" /></span>
                            </a>
                          </>
                        )}

                        {ord.nextBestAction === 'VERIFY_BKASH_TRX' &&
                          !isVendor && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                void executeGridAction({
                                  orderNos: [ord.orderNo!],
                                  actionType: 'verify_bkash',
                                })
                              }
                            >
                              {locale === 'bn'
                                ? `বিকাশ ভেরিফাই (${ord.manualPaymentTrxId})`
                                : `Verify bKash (${ord.manualPaymentTrxId})`}
                            </Button>
                          )}

                        {ord.status === 'pending_confirmation' && !isVendor && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              void executeGridAction({
                                orderNos: [ord.orderNo!],
                                actionType: 'update_status',
                                newStatus: 'confirmed',
                              })
                            }
                          >
                            {locale === 'bn' ? 'কনফার্ম মার্ক করুন' : 'Mark Confirmed'}
                          </Button>
                        )}

                        {ord.status === 'confirmed' && !isVendor && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              void executeGridAction({
                                orderNos: [ord.orderNo!],
                                actionType: 'update_status',
                                newStatus: 'packed',
                              })
                            }
                          >
                            {locale === 'bn' ? 'প্যাকড মার্ক করুন' : 'Mark Packed'}
                          </Button>
                        )}

                        {ord.status === 'packed' &&
                          !ord.trackingCode &&
                          !isVendor && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openTrackingDialog(ord)}
                            >
                              {locale === 'bn' ? 'ট্র্যাকিং কোড দিন' : 'Add Tracking'}
                            </Button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Low-Stock Alert Strip */}
            <Card surface="bg" padding="md" className="space-y-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Package className="w-4 h-4" aria-hidden="true" />
                <span>
                  {locale === 'bn'
                    ? 'স্টক ও কনসাইনমেন্ট ইনভেন্টরি স্ট্যাটাস'
                    : 'Consignment Stock & Low-Stock Alerts'}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {products.map((prod) =>
                  (prod.variants ?? []).map((v) => {
                    const isLow =
                      v.stockAvailable <= (prod.lowStockThreshold ?? 5);
                    return (
                      <div
                        key={v.variantId}
                        className="p-3 border border-border rounded-[var(--radius-md)] bg-surface space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-muted">
                            {v.publicSku}
                          </span>
                          <Badge status={isLow ? 'warning' : 'success'}>
                            {locale === 'bn'
                              ? `স্টক: ${formatLocaleNumber(v.stockAvailable, locale)}`
                              : `Stock: ${formatLocaleNumber(v.stockAvailable, locale)}`}
                          </Badge>
                        </div>
                        <p className="font-bold text-ink truncate">
                          {locale === 'bn' ? prod.nameBn : prod.nameEn}
                        </p>
                        <p className="text-muted">{locale === 'bn' ? v.titleBn : v.titleEn}</p>
                        {typeof v.supplierCostPoisha === 'number' && (
                          <p className="font-mono text-ink pt-1">
                            {locale === 'bn' ? 'কেনা:' : 'Cost:'}{' '}
                            {formatPoishaToBdt(v.supplierCostPoisha, locale)} ·{' '}
                            {locale === 'bn' ? 'বিক্রয়:' : 'Price:'}{' '}
                            {formatPoishaToBdt(v.salePricePoisha, locale)}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </section>
        )}

        {/* ==================================================================
            TAB 2: ORDERS GRID — ONE-CLICK ACTION SYSTEM (MODULE N)
           ================================================================== */}
        {activeTab === 'orders_grid' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h1 className="text-xl font-bold text-ink">
                  {locale === 'bn'
                    ? 'অর্ডার মাস্টার গ্রিড — ১-ক্লিক অ্যাকশন সিস্টেম (Module N)'
                    : 'Orders Master Grid — One-Click Action System'}
                </h1>
                <p className="text-xs text-muted">
                  {locale === 'bn'
                    ? 'কোনো পেজ রিলোড ছাড়াই একই জায়গা থেকে কল, হোয়াটসঅ্যাপ, স্ট্যাটাস পরিবর্তন, ঠিকানা সংশোধন ও কুরিয়ার বুকিং সম্পন্ন করুন।'
                    : 'Process confirmation calls, WhatsApp updates, status changes, address fixes, and courier booking without reload.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {trackingSyncAvailable ? (
                  <button
                    type="button"
                    disabled={isSyncingTracking}
                    onClick={() => void handleSyncCourierTracking()}
                    className="min-h-[36px] px-3.5 py-1.5 border border-primary/50 bg-primary/10 hover:bg-primary/20 text-primary font-bold rounded-[var(--radius-md)] inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                    title={
                      locale === 'bn'
                        ? 'সার্ভারে সব কুরিয়ার ট্র্যাকিং লিঙ্ক চেক ও স্ট্যাটাস সিঙ্ক করুন'
                        : 'Check tracking links and sync status with couriers'
                    }
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isSyncingTracking ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {isSyncingTracking
                        ? locale === 'bn'
                          ? 'সিঙ্ক হচ্ছে...'
                          : 'Syncing...'
                        : locale === 'bn'
                        ? 'Sync Tracking Now (লাইভ কুরিয়ার সিঙ্ক)'
                        : 'Sync Tracking Now'}
                    </span>
                  </button>
                ) : (
                  // Auto-sync is disabled at policy level; offer the manual path
                  // that actually works rather than a dead button.
                  <button
                    type="button"
                    onClick={() => {
                      setActionFeedback({
                        type: 'success',
                        text:
                          locale === 'bn'
                            ? 'স্বয়ংক্রিয় কুরিয়ার সিঙ্ক বন্ধ আছে। অর্ডার রো-তে ট্র্যাকিং কোড থাকলে স্ট্যাটাস কুরিয়ার ওয়েবহুক বা ম্যানুয়াল স্ট্যাটাস পরিবর্তন দিয়ে আপডেট করুন।'
                            : 'Automatic courier sync is disabled. Update status from the courier webhook or change it manually from the order row.',
                      });
                    }}
                    className="min-h-[36px] px-3.5 py-1.5 border border-border bg-bg hover:bg-surface text-muted font-semibold rounded-[var(--radius-md)] inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
                    title={
                      locale === 'bn'
                        ? 'স্বয়ংক্রিয় সিঙ্ক নিষ্ক্রিয় — কীভাবে স্ট্যাটাস আপডেট করবেন দেখুন'
                        : 'Automatic sync disabled — see how to update status'
                    }
                  >
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {locale === 'bn' ? 'অটো-সিঙ্ক বন্ধ' : 'Auto-sync off'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportOrders}
                  className="min-h-[36px] px-3.5 py-1.5 border border-border bg-bg hover:bg-surface text-ink font-bold rounded-[var(--radius-md)] inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer"
                  title={locale === 'bn' ? 'ফিল্টার করা অর্ডার Excel-compatible CSV হিসেবে ডাউনলোড করুন' : 'Download filtered orders as an Excel-compatible CSV'}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{locale === 'bn' ? 'Excel Export' : 'Export Excel'}</span>
                </button>

                {!isVendor && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setActiveTab('smart_order_entry')}
                    leftIcon={
                      <PlusCircle className="w-4 h-4" aria-hidden="true" />
                    }
                  >
                    {locale === 'bn' ? 'নতুন অর্ডার এন্ট্রি' : 'New Order Entry'}
                  </Button>
                )}
              </div>
            </div>

            {/* Next Best Action Quick Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  ['ALL', locale === 'bn' ? 'সব অর্ডার' : 'All Orders'],
                  ['CALL_TO_CONFIRM', locale === 'bn' ? 'কল বাকি' : 'Pending Call'],
                  ['FIX_ADDRESS', locale === 'bn' ? 'ঠিকানা ত্রুটি' : 'Fix Address'],
                  ['COLLECT_MANDATORY_ADVANCE', locale === 'bn' ? 'অগ্রিম বাকি' : 'Collect Advance'],
                  ['VERIFY_BKASH_TRX', locale === 'bn' ? 'বিকাশ যাচাই' : 'Verify bKash'],
                  ['READY_TO_PACK', locale === 'bn' ? 'প্যাকিং বাকি' : 'Ready to Pack'],
                  ['READY_TO_BOOK_COURIER', locale === 'bn' ? 'কুরিয়ার বুকিং বাকি' : 'Book Courier'],
                  ['HANDOVER_TO_COURIER', locale === 'bn' ? 'কুরিয়ারে হস্তান্তর' : 'Handover'],
                  ['AWAITING_COD_REMITTANCE', locale === 'bn' ? 'সিওডি বাকি' : 'COD Remittance'],
                  ['PROCESS_PENDING_RETURN', locale === 'bn' ? 'রিটার্ন বাকি' : 'Return Pending'],
                  ['COMPLETED', locale === 'bn' ? 'সম্পন্ন' : 'Completed'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setNextActionFilter(code)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border whitespace-nowrap shrink-0 cursor-pointer ${
                    nextActionFilter === code
                      ? 'bg-ink text-bg border-ink'
                      : 'bg-bg text-ink border-border hover:border-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search & Status Filter Bar */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7 relative">
                  <Search
                    className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder={
                      locale === 'bn'
                        ? 'অর্ডার নম্বর, গ্রাহকের নাম, মোবাইল নম্বর বা ট্র্যাকিং কোড খুঁজুন...'
                        : 'Search order number, customer name, phone or tracking code...'
                    }
                    className="w-full min-h-[40px] pl-10 pr-4 py-1.5 text-xs sm:text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                  />
                </div>
                <div className="sm:col-span-5 flex items-center gap-2">
                  <select
                    aria-label="Filter by order status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                  >
                    <option value="ALL">{locale === 'bn' ? 'সব স্ট্যাটাস (All Statuses)' : 'All Statuses'}</option>
                    <option value="pending_confirmation">
                      {locale === 'bn' ? 'pending_confirmation (কল বাকি)' : 'Pending Confirmation'}
                    </option>
                    <option value="confirmed">{locale === 'bn' ? 'confirmed (কনফার্মড)' : 'Confirmed'}</option>
                    <option value="packed">{locale === 'bn' ? 'packed (প্যাকড)' : 'Packed'}</option>
                    <option value="shipped">{locale === 'bn' ? 'shipped (শিপড)' : 'Shipped'}</option>
                    <option value="out_for_delivery">
                      {locale === 'bn' ? 'out_for_delivery (ডেলিভারি চলছে)' : 'Out for Delivery'}
                    </option>
                    <option value="delivered">{locale === 'bn' ? 'delivered (ডেলিভার্ড)' : 'Delivered'}</option>
                    <option value="cancelled">{locale === 'bn' ? 'cancelled (বাতিল)' : 'Cancelled'}</option>
                    <option value="returned">{locale === 'bn' ? 'returned (রিটার্ন)' : 'Returned'}</option>
                  </select>
                </div>
              </div>

              {/* Courier Poller Sync Timestamp Indicator */}
              {lastTrackingSyncAt && (
                <div className="flex items-center gap-2 text-[11px] text-muted px-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>
                    {locale === 'bn' ? 'সর্বশেষ লাইভ ট্র্যাকিং সিঙ্ক:' : 'Last Live Tracking Sync:'}{' '}
                    <strong className="text-ink font-mono">
                      {lastTrackingSyncAt}
                    </strong>
                  </span>
                  {syncFeedback && <span className="text-primary truncate">· {syncFeedback}</span>}
                </div>
              )}
            </div>

            {/* Bulk Selection Toolbar */}
            {selectedOrderNos.length > 0 && !isVendor && (
              <div className="p-3 border border-ink rounded-[var(--radius-md)] bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-bold text-ink">
                  {locale === 'bn'
                    ? `${formatLocaleNumber(selectedOrderNos.length, locale)} টি অর্ডার নির্বাচিত`
                    : `${formatLocaleNumber(selectedOrderNos.length, locale)} orders selected`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void executeGridAction({
                        orderNos: selectedOrderNos,
                        actionType: 'update_status',
                        newStatus: 'confirmed',
                      })
                    }
                  >
                    {locale === 'bn' ? 'বাল্ক কনফার্ম' : 'Bulk Confirm'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void executeGridAction({
                        orderNos: selectedOrderNos,
                        actionType: 'update_status',
                        newStatus: 'packed',
                      })
                    }
                  >
                    {locale === 'bn' ? 'বাল্ক প্যাকড' : 'Bulk Packed'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkShipEligible.length === 0}
                    title={
                      locale === 'bn'
                        ? 'শুধু প্যাকড ও ট্র্যাকিং কোডযুক্ত অর্ডার শিপড করা যাবে'
                        : 'Only packed orders that already have a tracking code can be shipped'
                    }
                    onClick={() =>
                      void executeGridAction({
                        orderNos: bulkShipEligible,
                        actionType: 'update_status',
                        newStatus: 'shipped',
                      })
                    }
                  >
                    {locale === 'bn'
                      ? `বাল্ক শিপড (${formatLocaleNumber(bulkShipEligible.length, locale)})`
                      : `Bulk Ship (${bulkShipEligible.length})`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedOrderNos([])}
                  >
                    {locale === 'bn' ? 'নির্বাচন মুছুন' : 'Clear Selection'}
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredOrders.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="w-6 h-6" aria-hidden="true" />}
                title="কোনো অর্ডার পাওয়া যায়নি"
                description="ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।"
                actionLabel="সব ফিল্টার রিসেট করুন"
                onAction={() => {
                  setOrderSearch('');
                  setStatusFilter('ALL');
                  setNextActionFilter('ALL');
                }}
              />
            ) : (
              <div className="space-y-4">
                {/* ==========================================================
                    1. RESPONSIVE MOBILE & TABLET CARD VIEW (< 1024px)
                   ========================================================== */}
                <div className="block lg:hidden space-y-3">
                  {filteredOrders.map((ord) => {
                    const isChecked = selectedOrderNos.includes(
                      ord.orderNo ?? ''
                    );
                    const cleanPhone = (ord.customerPhone ?? '').replace(
                      /\D/g,
                      ''
                    );
                    const waNum = cleanPhone.startsWith('88')
                      ? cleanPhone
                      : `88${cleanPhone}`;
                    const waMsg = encodeURIComponent(
                      `প্রিয় ${ord.customerName}, আপনার অর্ডার ${ord.orderNo} এর বর্তমান স্ট্যাটাস: ${ord.status}। ট্র্যাকিং লিংক: ${window.location.origin}/order-tracking/${ord.orderNo}`
                    );

                    return (
                      <div
                        key={ord.orderNo}
                        className="p-3.5 bg-bg border border-border rounded-[var(--radius-lg)] space-y-3 shadow-xs"
                      >
                        {/* Card Top: Checkbox, Order No, Source & Amounts */}
                        <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-2.5">
                          <div className="flex items-start gap-2.5">
                            {!isVendor && (
                              <input
                                type="checkbox"
                                aria-label={`Select ${ord.orderNo}`}
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedOrderNos((prev) => [
                                      ...prev,
                                      ord.orderNo!,
                                    ]);
                                  } else {
                                    setSelectedOrderNos((prev) =>
                                      prev.filter((id) => id !== ord.orderNo)
                                    );
                                  }
                                }}
                                className="accent-ink mt-0.5"
                              />
                            )}
                            <div>
                              <div className="font-mono font-bold text-sm text-ink">
                                {ord.orderNo}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                                <span className="font-medium px-1.5 py-0.5 rounded bg-surface border border-border">
                                  {ord.source}
                                </span>
                                <span>·</span>
                                <span><LocalizedText source={"রিস্ক:"} area="admin" />{" "}{ord.riskScore}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums">
                            <div className="font-bold text-ink text-sm">
                              {formatPoishaToBdt(
                                ord.totalPayablePoisha ?? 0,
                                locale
                              )}
                            </div>
                            <div className="text-muted text-[11px]">
                              <LocalizedText source={"COD:"} area="admin" />{' '}
                              {formatPoishaToBdt(
                                ord.codCollectablePoisha ?? 0,
                                locale
                              )}
                            </div>
                            {/* Advance Courier Status & TrxID */}
                            {(((ord.totalPayablePoisha ?? 0) - (ord.codCollectablePoisha ?? 0) > 0) || Boolean(ord.manualPaymentTrxId)) && (
                              <div className="text-[10px] space-y-0.5 pt-0.5">
                                <div className="text-amber-700 dark:text-amber-400 font-sans font-semibold">
                                  <LocalizedText source={"অগ্রিম:"} area="admin" />{" "}{formatPoishaToBdt(Math.max(0, (ord.totalPayablePoisha ?? 0) - (ord.codCollectablePoisha ?? 0)) || (ord.advancePaidPoisha ?? 0), locale)}
                                  <span className="text-[9px] ml-1">
                                    ({ord.paymentStatus === 'paid_verified' || ord.paymentStatus === 'partial_verified' ? '✓ গৃহীত' : 'যাচাই বাকি'})
                                  </span>
                                </div>
                                {ord.manualPaymentTrxId && (
                                  <div className="text-[9px] text-muted font-mono truncate" title={ord.manualPaymentTrxId}>
                                    <LocalizedText source={"Trx:"} area="admin" />{" "}{ord.manualPaymentTrxId}
                                  </div>
                                )}
                              </div>
                            )}
                            {isSuperAdmin && (
                              <div
                                className={`text-[10px] font-bold ${
                                  (ord.estimatedNetProfitPoisha ?? 0) < 0
                                    ? 'text-danger'
                                    : 'text-success'
                                }`}
                              >
                                <LocalizedText source={"লাভ:"} area="admin" />{' '}
                                {formatPoishaToBdt(
                                  ord.estimatedNetProfitPoisha ?? 0,
                                  locale
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Information Block */}
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-ink">
                              {ord.customerName}
                            </span>
                            <span className="font-mono text-muted text-[11px]">
                              {ord.customerPhone}
                            </span>
                          </div>
                          <div className="text-muted text-[11px] line-clamp-2">
                            {localizedField(ord, "upazilaNameBn", locale)}, {localizedField(ord, "districtNameBn", locale)} —{' '}
                            {ord.streetAddress}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted pt-0.5">
                            <span>
                              <LocalizedText source={"ঠিকানা স্কোর:"} area="admin" />{' '}
                              <strong className="text-ink font-mono">
                                {ord.addressQualityScore}%
                              </strong>
                            </span>
                            {ord.internalStaffNote && (
                              <span className="truncate">
                                <LocalizedText source={"· নোট:"} area="admin" />{" "}{ord.internalStaffNote}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Courier Tracking Block */}
                        <div className="p-2.5 rounded-[var(--radius-md)] bg-surface border border-border">
                          <CourierInfoCard
                            ord={ord}
                            locale={locale}
                            onBookCourier={() => openTrackingDialog(ord)}
                          />
                        </div>

                        {/* Primary Action Button (Solid Semantic Fill) */}
                        <div>
                          <OrderStatusSolidButton
                            ord={ord}
                            locale={locale}
                            onAction={executeGridAction}
                            onOpenMfsModal={handleOpenMfsModal}
                            onRequestTracking={handleOpenEditOrder}
                          />
                        </div>

                        {/* Quick Tool Actions: Call, WhatsApp, Print, Edit */}
                        <div className="flex items-center justify-between border-t border-border/70 pt-2 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {!isVendor && (
                              <>
                                <a
                                  href={`tel:${ord.customerPhone}`}
                                  title="কল করুন"
                                  onClick={() =>
                                    void executeGridAction({
                                      orderNos: [ord.orderNo!],
                                      actionType: 'log_call_attempt',
                                    })
                                  }
                                  className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink inline-flex items-center gap-1"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                  <span className="text-[11px]"><LocalizedText source={"কল"} area="admin" /></span>
                                </a>

                                <button
                                  type="button"
                                  title="গ্রাহককে মেসেজ পাঠান (WhatsApp / SMS / ট্র্যাকিং)"
                                  onClick={() => handleOpenMessageStudio(ord)}
                                  className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span className="text-[11px]"><LocalizedText source={"মেসেজ"} area="admin" /></span>
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              title="ম্যানুয়াল MFS পেমেন্ট (বিকাশ / নগদ / রকেট)"
                              onClick={() => handleOpenMfsModal(ord)}
                              className={`p-1.5 border rounded-[var(--radius-sm)] inline-flex items-center gap-1 cursor-pointer transition-colors ${
                                ord.manualPaymentTrxId
                                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                                  : 'border-border bg-bg hover:bg-surface text-ink'
                              }`}
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span className="text-[11px]"><LocalizedText source={"MFS"} area="admin" /></span>
                            </button>

                            <button
                              type="button"
                              title="প্রিন্ট স্লিপ"
                              onClick={() => {
                                if (ord.orderNo) {
                                  setSelectedOrderNos([ord.orderNo]);
                                }
                                setActiveTab('print_engine');
                              }}
                              className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span className="text-[11px]">{locale === 'bn' ? 'প্রিন্ট' : 'Print'}</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleOpenEditOrder(ord)}
                            className="px-2.5 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-semibold hover:border-ink cursor-pointer text-xs"
                          >
                            {locale === 'bn' ? 'বিস্তারিত / এডিট' : 'Details / Edit'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ==========================================================
                    2. DESKTOP HIGH-DENSITY TABLE VIEW (>= 1024px)
                   ========================================================== */}
                <div className="hidden lg:block border border-border rounded-[var(--radius-lg)] overflow-x-auto bg-bg shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs min-w-[1100px]">
                    <thead>
                      <tr className="border-b border-border bg-surface text-muted font-semibold">
                        {!isVendor && (
                          <th className="p-3 w-8">
                            <input
                              type="checkbox"
                              aria-label={uiText("Select all orders", locale)}
                              checked={
                                filteredOrders.length > 0 &&
                                selectedOrderNos.length ===
                                  filteredOrders.length
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOrderNos(
                                    filteredOrders
                                      .map((o) => o.orderNo!)
                                      .filter(Boolean)
                                  );
                                } else {
                                  setSelectedOrderNos([]);
                                }
                              }}
                              className="accent-ink"
                            />
                          </th>
                        )}
                        <th className="p-3 min-w-[120px]">{locale === 'bn' ? 'অর্ডার ও সোর্স' : 'Order & Source'}</th>
                        <th className="p-3 min-w-[220px]">{locale === 'bn' ? 'গ্রাহক ও ঠিকানা' : 'Customer & Address'}</th>
                        <th className="p-3 min-w-[210px]">{locale === 'bn' ? 'কুরিয়ার ও লাইভ ট্র্যাকিং' : 'Courier & Tracking'}</th>
                        <th className="p-3 min-w-[200px]">{locale === 'bn' ? 'স্ট্যাটাস ও করণীয় অ্যাকশন' : 'Status & Action'}</th>
                        <th className="p-3 text-right min-w-[100px]">{locale === 'bn' ? 'মোট / সিওডি' : 'Total / COD'}</th>
                        {isSuperAdmin && (
                          <th className="p-3 text-right min-w-[110px]">
                            {locale === 'bn' ? 'নেট লাভ' : 'Net Profit'}
                          </th>
                        )}
                        <th className="p-3 text-right min-w-[170px]">
                          {locale === 'bn' ? '১-ক্লিক টুলস' : '1-Click Tools'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredOrders.map((ord) => {
                        const isChecked = selectedOrderNos.includes(
                          ord.orderNo ?? ''
                        );
                        const cleanPhone = (ord.customerPhone ?? '').replace(
                          /\D/g,
                          ''
                        );
                        const waNum = cleanPhone.startsWith('88')
                          ? cleanPhone
                          : `88${cleanPhone}`;
                        const waMsg = encodeURIComponent(
                          `প্রিয় ${ord.customerName}, আপনার অর্ডার ${ord.orderNo} এর বর্তমান স্ট্যাটাস: ${ord.status}। ট্র্যাকিং লিংক: ${window.location.origin}/order-tracking/${ord.orderNo}`
                        );

                        return (
                          <tr
                            key={ord.orderNo}
                            className="hover:bg-surface/60 transition-colors"
                          >
                            {!isVendor && (
                              <td className="p-3 align-top">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${ord.orderNo}`}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedOrderNos((prev) => [
                                        ...prev,
                                        ord.orderNo!,
                                      ]);
                                    } else {
                                      setSelectedOrderNos((prev) =>
                                        prev.filter((id) => id !== ord.orderNo)
                                      );
                                    }
                                  }}
                                  className="accent-ink"
                                />
                              </td>
                            )}
                            <td className="p-3 align-top space-y-1">
                              <div className="font-mono font-bold text-ink">
                                {ord.orderNo}
                              </div>
                              <div className="text-muted">
                                <span className="px-1.5 py-0.5 rounded bg-surface border border-border font-medium text-[10px]">
                                  {ord.source}
                                </span>{' '}
                                <LocalizedText source={"· রিস্ক:"} area="admin" />{' '}
                                <span className="font-mono tabular-nums font-semibold text-ink">
                                  {ord.riskScore}
                                </span>
                              </div>
                            </td>

                            <td className="p-3 align-top space-y-1 max-w-xs">
                              <div className="font-bold text-ink flex items-center justify-between">
                                <span>{ord.customerName}</span>
                                <span className="font-mono font-normal text-muted text-[11px]">
                                  {ord.customerPhone}
                                </span>
                              </div>
                              <div className="text-muted line-clamp-2 text-[11px]">
                                {localizedField(ord, "upazilaNameBn", locale)}, {localizedField(ord, "districtNameBn", locale)} —{' '}
                                {ord.streetAddress}
                              </div>
                              <div className="text-[11px] text-muted">
                                <LocalizedText source={"ঠিকানা স্কোর:"} area="admin" />{' '}
                                <span className="font-mono font-semibold text-ink">
                                  {ord.addressQualityScore}%
                                </span>
                                {ord.internalStaffNote
                                  ? ` · নোট: ${ord.internalStaffNote}`
                                  : ''}
                              </div>
                            </td>

                            {/* Courier Details & Live Tracking Pill */}
                            <td className="p-3 align-top">
                              <CourierInfoCard
                                ord={ord}
                                locale={locale}
                                onBookCourier={() => openTrackingDialog(ord)}
                              />
                            </td>

                            {/* Dynamic Solid Semantic Action Button + Status Select */}
                            <td className="p-3 align-top space-y-2">
                              <OrderStatusSolidButton
                                ord={ord}
                                locale={locale}
                                onAction={executeGridAction}
                                onOpenMfsModal={handleOpenMfsModal}
                                onRequestTracking={handleOpenEditOrder}
                              />

                              {!isVendor && (() => {
                                // Only expose edges the state machine accepts.
                                // Listing every status meant most selections
                                // returned a 400 and the row silently reverted.
                                const nextStates = allowedTransitionsFrom(ord.status);
                                if (nextStates.length === 0) {
                                  return (
                                    <p className="text-[11px] text-muted px-1">
                                      <LocalizedText source={"এই অর্ডার চূড়ান্ত অবস্থায় আছে — আর কোনো স্ট্যাটাস পরিবর্তন সম্ভব নয়।"} area="admin" />
                                    </p>
                                  );
                                }
                                return (
                                  <select
                                    aria-label={`Change status for ${ord.orderNo}`}
                                    value={ord.status}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      if (!next || next === ord.status) return;
                                      void executeGridAction({
                                        orderNos: [ord.orderNo!],
                                        actionType: 'update_status',
                                        newStatus: next as OrderStatus,
                                      });
                                    }}
                                    className="w-full px-2 py-1 text-[11px] border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-medium"
                                  >
                                    <option value={ord.status}>
                                      বর্তমান: {ORDER_STATUS_LABEL_BN[ord.status ?? ''] ?? ord.status}
                                    </option>
                                    {nextStates.map((st) => (
                                      <option key={st} value={st}>
                                        → {ORDER_STATUS_LABEL_BN[st] ?? st}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>

                            <td className="p-3 align-top text-right font-mono tabular-nums space-y-0.5">
                              <div className="font-bold text-ink">
                                {formatPoishaToBdt(
                                  ord.totalPayablePoisha ?? 0,
                                  locale
                                )}
                              </div>
                              <div className="text-muted text-[11px]">
                                <LocalizedText source={"COD:"} area="admin" />{' '}
                                {formatPoishaToBdt(
                                  ord.codCollectablePoisha ?? 0,
                                  locale
                                )}
                              </div>
                              {/* Advance Courier Charge & TrxID Status */}
                              {(((ord.totalPayablePoisha ?? 0) - (ord.codCollectablePoisha ?? 0) > 0) || Boolean(ord.manualPaymentTrxId)) && (
                                <div className="text-[10px] space-y-0.5 pt-0.5">
                                  <div className="text-amber-700 dark:text-amber-400 font-sans font-semibold">
                                    <LocalizedText source={"অগ্রিম:"} area="admin" />{" "}{formatPoishaToBdt(Math.max(0, (ord.totalPayablePoisha ?? 0) - (ord.codCollectablePoisha ?? 0)) || (ord.advancePaidPoisha ?? 0), locale)}
                                    <span className="text-[9px] ml-1">
                                      ({ord.paymentStatus === 'paid_verified' || ord.paymentStatus === 'partial_verified' ? '✓ গৃহীত' : 'যাচাই বাকি'})
                                    </span>
                                  </div>
                                  {ord.manualPaymentTrxId && (
                                    <div className="text-[10px] text-muted font-mono truncate select-all" title={ord.manualPaymentTrxId}>
                                      <LocalizedText source={"Trx:"} area="admin" />{" "}{ord.manualPaymentTrxId}
                                    </div>
                                  )}
                                </div>
                              )}
                              {ord.isAdvanceMandatory && (
                                <span className="inline-block text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-sans font-medium">
                                  <LocalizedText source={"অগ্রিম প্রযোজ্য"} area="admin" />{" "}</span>
                              )}
                            </td>

                            {isSuperAdmin && (
                              <td className="p-3 align-top text-right font-mono tabular-nums">
                                <span
                                  className={`font-bold ${
                                    (ord.estimatedNetProfitPoisha ?? 0) < 0
                                      ? 'text-danger'
                                      : 'text-success'
                                  }`}
                                >
                                  {formatPoishaToBdt(
                                    ord.estimatedNetProfitPoisha ?? 0,
                                    locale
                                  )}
                                </span>
                              </td>
                            )}

                            <td className="p-3 align-top text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {!isVendor && (
                                  <>
                                    <a
                                      href={`tel:${ord.customerPhone}`}
                                      title="কল করুন"
                                      onClick={() =>
                                        void executeGridAction({
                                          orderNos: [ord.orderNo!],
                                          actionType: 'log_call_attempt',
                                        })
                                      }
                                      className="p-2 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink"
                                    >
                                      <PhoneCall
                                        className="w-3.5 h-3.5"
                                        aria-hidden="true"
                                      />
                                    </a>

                                    <button
                                      type="button"
                                      title={uiText("গ্রাহককে মেসেজ পাঠান (WhatsApp / SMS / লাইভ ট্র্যাকিং লিংক)", locale)}
                                      onClick={() => handleOpenMessageStudio(ord)}
                                      className="p-2 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink cursor-pointer"
                                    >
                                      <MessageSquare
                                        className="w-3.5 h-3.5"
                                        aria-hidden="true"
                                      />
                                    </button>

                                    <button
                                      type="button"
                                      title={uiText("ম্যানুয়াল MFS পেমেন্ট ও TrxID (বিকাশ / নগদ / রকেট)", locale)}
                                      onClick={() => handleOpenMfsModal(ord)}
                                      className={`p-2 border rounded-[var(--radius-sm)] cursor-pointer transition-colors ${
                                        ord.manualPaymentTrxId
                                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold'
                                          : 'border-border bg-bg hover:bg-surface text-ink'
                                      }`}
                                    >
                                      <Wallet
                                        className="w-3.5 h-3.5"
                                        aria-hidden="true"
                                      />
                                    </button>

                                    {!ord.trackingCode && (
                                      <button
                                        type="button"
                                        title={uiText("কুরিয়ার ট্র্যাকিং কোড যোগ করুন", locale)}
                                        onClick={() => openTrackingDialog(ord)}
                                        className="p-2 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink cursor-pointer"
                                      >
                                        <Truck
                                          className="w-3.5 h-3.5"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    )}
                                  </>
                                )}

                                <button
                                  type="button"
                                  title={uiText("স্লিপ প্রিন্ট করুন (A4 3-Part / 4x6 Thermal)", locale)}
                                  onClick={() => {
                                    if (ord.orderNo) {
                                      setSelectedOrderNos([ord.orderNo]);
                                    }
                                    setActiveTab('print_engine');
                                  }}
                                  className="p-2 border border-border rounded-[var(--radius-sm)] bg-bg hover:bg-surface text-ink cursor-pointer"
                                >
                                  <Printer
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditOrder(ord)}
                                  className="px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-semibold hover:border-ink cursor-pointer text-xs"
                                >
                                  {locale === 'bn' ? 'বিস্তারিত / এডিট' : 'Details / Edit'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ==================================================================
            TAB 3: SMART ORDER ENTRY (MODULE A & MODULE M)
           ================================================================== */}
        {activeTab === 'smart_order_entry' && !isVendor && (
          <section className="space-y-6">
            <div className="border-b border-border pb-3">
              <h1 className="text-xl font-bold text-ink">
                {locale === 'bn'
                  ? 'স্মার্ট অর্ডার এন্ট্রি (Facebook / WhatsApp / Instagram)'
                  : 'Smart Order Entry (Manual & Social Channels)'}
              </h1>
              <p className="text-xs text-muted">
                <LocalizedText source={"মোবাইল নম্বর লিখলে স্বয়ংক্রিয়ভাবে গ্রাহকের আগের রিটার্ন হিস্ট্রি, ২৪ ঘণ্টার ডুপ্লিকেট গার্ড, জেলাভিত্তিক ডেলিভারি চার্জ ও আনুমানিক লাভ দেখাবে।"} area="admin" />{" "}</p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selectedSmartPair) return;
                setSmartSubmitting(true);
                setActionFeedback(null);
                smartOrderSeqRef.current += 1;
                const idemKey = `adm-ord-${smartPhone.replace(/\D/g, '')}-${smartOrderSeqRef.current}`;
                try {
                  const res = await fetch('/api/admin/workspace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      operation: 'create_smart_order',
                      duplicateOverrideReason:
                        smartDupOverride.trim() || undefined,
                      orderInput: {
                        idempotencyKey: idemKey,
                        customerName: smartName.trim(),
                        customerPhone: smartPhone.trim(),
                        districtId: smartDistrictId,
                        upazilaId: smartUpazilaId,
                        streetAddress: smartStreet.trim(),
                        landmark: smartLandmark.trim(),
                        source: smartSource,
                        deliveryMethod: smartDeliveryCalc.isFreeDeliveryApplied
                          ? 'free'
                          : smartDeliveryMethod,
                        paymentMethod: smartPaymentMethod,
                        manualPaymentTrxId:
                          smartPaymentMethod === 'bkash_manual'
                            ? smartTrxId.trim().toUpperCase()
                            : undefined,
                        advancePaidPoisha:
                          smartPaymentMethod === 'bkash_manual'
                            ? smartDeliveryCalc.finalChargePoisha
                            : 0,
                        customerNote: '',
                        internalStaffNote: smartStaffNote.trim(),
                        items: [
                          {
                            productId: selectedSmartPair.product.productId!,
                            variantId: selectedSmartPair.variant.variantId,
                            quantity: smartQuantity,
                          },
                        ],
                      },
                    }),
                  });
                  const data = (await res.json()) as {
                    success: boolean;
                    errorBn?: string;
                    orderNo?: string;
                  };
                  if (!res.ok || !data.success) {
                    setActionFeedback({
                      type: 'error',
                      text: data.errorBn ?? 'অর্ডার তৈরি ব্যর্থ হয়েছে।',
                    });
                  } else {
                    setActionFeedback({
                      type: 'success',
                      text: `স্মার্ট অর্ডার ${data.orderNo} সফলভাবে তৈরি হয়েছে!`,
                    });
                    setSmartName('');
                    setSmartStreet('');
                    setSmartLandmark('');
                    setSmartStaffNote('');
                    setSmartDupOverride('');
                    await fetchWorkspace();
                    setActiveTab('orders_grid');
                  }
                } catch {
                  setActionFeedback({
                    type: 'error',
                    text: 'নেটওয়ার্ক ত্রুটি।',
                  });
                } finally {
                  setSmartSubmitting(false);
                }
              }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            >
              {/* Left: Customer, Geo Cascade & Product Selection */}
              <Card
                surface="bg"
                padding="md"
                className="lg:col-span-7 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label={locale === 'bn' ? 'গ্রাহকের মোবাইল নম্বর (১১ ডিজিট) *' : 'Customer Phone (11 Digits) *'}
                    value={smartPhone}
                    onChange={(e) =>
                      void handlePhoneLookupInSmartEntry(e.target.value)
                    }
                    placeholder="01712345678"
                    required
                  />
                  <Input
                    label={locale === 'bn' ? 'গ্রাহকের নাম *' : 'Customer Name *'}
                    value={smartName}
                    onChange={(e) => setSmartName(e.target.value)}
                    placeholder={locale === 'bn' ? 'যেমন: তানভীর আহমেদ' : 'e.g. Tanvir Ahmed'}
                    required
                  />
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink">
                      {locale === 'bn' ? 'অর্ডার সোর্স (Source) *' : 'Order Source *'}
                    </label>
                    <select
                      aria-label={uiText("Order source", locale)}
                      value={smartSource}
                      onChange={(e) =>
                        setSmartSource(e.target.value as OrderSource)
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    >
                      <option value="facebook"><LocalizedText source={"Facebook Page"} area="admin" /></option>
                      <option value="whatsapp">WhatsApp Direct</option>
                      <option value="instagram"><LocalizedText source={"Instagram DM"} area="admin" /></option>
                      <option value="phone_call"><LocalizedText source={"Phone Call"} area="admin" /></option>
                      <option value="other"><LocalizedText source={"Other"} area="admin" /></option>
                    </select>
                  </div>
                </div>

                {/* Live Customer Fraud/Return History & 24h Duplicate Guard Box */}
                {smartCustomerHistory && smartCustomerHistory.validPhone && (
                  <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-ink">
                        {locale === 'bn'
                          ? `গ্রাহক হিস্ট্রি (${smartCustomerHistory.normalizedPhone}):`
                          : `Customer History (${smartCustomerHistory.normalizedPhone}):`}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span>
                          {locale === 'bn'
                            ? `মোট অর্ডার: ${smartCustomerHistory.totalOrders}`
                            : `Total Orders: ${smartCustomerHistory.totalOrders}`}
                        </span>
                        <span>·</span>
                        <span>
                          {locale === 'bn'
                            ? `ডেলিভারড: ${smartCustomerHistory.deliveredOrders}`
                            : `Delivered: ${smartCustomerHistory.deliveredOrders}`}
                        </span>
                        <span>·</span>
                        <span className="text-danger">
                          {locale === 'bn'
                            ? `রিটার্ন: ${smartCustomerHistory.returnedOrders}`
                            : `Returned: ${smartCustomerHistory.returnedOrders}`}
                        </span>
                      </div>
                    </div>

                    {smartCustomerHistory.isBlacklisted && (
                      <p className="font-bold text-danger">
                        {locale === 'bn'
                          ? `ব্ল্যাকলিস্ট সতর্কতা: ${smartCustomerHistory.blacklistReasonBn}`
                          : `Blacklist Alert: ${smartCustomerHistory.blacklistReasonBn}`}
                      </p>
                    )}

                    {smartCustomerHistory.hasDuplicateWithin24h && (
                      <div className="space-y-2 pt-1 border-t border-border">
                        <p className="font-semibold text-warning">
                          {locale === 'bn'
                            ? `ডুপ্লিকেট অর্ডার গার্ড: গত ২৪ ঘণ্টায় এই নম্বরে অর্ডার (${smartCustomerHistory.recentOrderNos.join(', ')}) রয়েছে!`
                            : `Duplicate Guard: Order exists within last 24h (${smartCustomerHistory.recentOrderNos.join(', ')})!`}
                        </p>
                        <Input
                          label={locale === 'bn' ? 'ডুপ্লিকেট ওভাররাইড কারণ (বাধ্যতামূলক) *' : 'Duplicate Override Reason (Required) *'}
                          value={smartDupOverride}
                          onChange={(e) => setSmartDupOverride(e.target.value)}
                          placeholder={locale === 'bn' ? 'যেমন: গ্রাহক ফোনে দ্বিতীয় পার্সেল কনফার্ম করেছেন' : 'e.g. Customer verbally confirmed 2nd parcel'}
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 64-District -> Upazila Cascade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink">
                      {locale === 'bn' ? 'জেলা (৬৪ জেলা) *' : 'District (64 Districts) *'}
                    </label>
                    <select
                      aria-label={uiText("District", locale)}
                      value={smartDistrictId}
                      onChange={(e) => {
                        const dId = Number(e.target.value);
                        setSmartDistrictId(dId);
                        const firstU = getThanasByDistrict(dId)[0];
                        if (firstU) setSmartUpazilaId(firstU.id);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    >
                      {BD_DISTRICTS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {locale === 'bn' ? `${d.name_bn} (${d.name_en})` : `${d.name_en} (${d.name_bn})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink">
                      {locale === 'bn' ? 'উপজেলা / থানা *' : 'Upazila / Thana *'}
                    </label>
                    <select
                      aria-label={uiText("Upazila", locale)}
                      value={smartUpazilaId}
                      onChange={(e) =>
                        setSmartUpazilaId(Number(e.target.value))
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    >
                      {smartUpazilas.map((u) => (
                        <option key={u.id} value={u.id}>
                          {locale === 'bn' ? `${u.name_bn} (${u.name_en})` : `${u.name_en} (${u.name_bn})`}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted">
                      {locale === 'bn'
                        ? `${smartUpazilas.length}টি উপজেলা/থানা — মেট্রো থানাও অন্তর্ভুক্ত`
                        : `${smartUpazilas.length} upazila/thana options, metropolitan thanas included`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={locale === 'bn' ? 'বাড়ি, রোড ও এলাকার ঠিকানা *' : 'Street Address & House *'}
                    value={smartStreet}
                    onChange={(e) => setSmartStreet(e.target.value)}
                    placeholder={locale === 'bn' ? 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি' : 'House 24, Road 7/A, Dhanmondi'}
                    required
                  />
                  <Input
                    label={locale === 'bn' ? 'পরিচিত ল্যান্ডমার্ক (Landmark)' : 'Landmark (Optional)'}
                    value={smartLandmark}
                    onChange={(e) => setSmartLandmark(e.target.value)}
                    placeholder={locale === 'bn' ? 'সাত মসজিদ রোড ওভারব্রিজের পাশে' : 'Near Sat Masjid Road Overbridge'}
                  />
                </div>

                {/* Product Variant & Quantity Selector with Stock Safety */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="block text-xs font-medium text-ink">
                      {locale === 'bn' ? 'কনসাইনমেন্ট পণ্য ও ভ্যারিয়েন্ট নির্বাচন *' : 'Select Product & Variant *'}
                    </label>
                    <select
                      aria-label={uiText("Select product variant", locale)}
                      value={smartVariantId}
                      onChange={(e) => setSmartVariantId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    >
                      {allVariantsFlat.map(({ product: p, variant: v }) => (
                        <option key={v.variantId} value={v.variantId}>
                          {locale === 'bn' ? p.nameBn : p.nameEn} — {locale === 'bn' ? v.titleBn : v.titleEn} {" "}<LocalizedText source={"(SKU:"} area="admin" />{" "}{v.publicSku} · {locale === 'bn' ? 'স্টক:' : 'Stock:'}{' '}
                          {v.stockAvailable} · {locale === 'bn' ? 'দাম:' : 'Price:'}{' '}
                          {formatPoishaToBdt(v.salePricePoisha, locale)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label={locale === 'bn' ? 'পরিমাণ (Quantity) *' : 'Quantity *'}
                    type="number"
                    min={1}
                    max={selectedSmartPair?.variant.stockAvailable ?? 10}
                    value={String(smartQuantity)}
                    onChange={(e) =>
                      setSmartQuantity(
                        Math.max(1, Number(e.target.value) || 1)
                      )
                    }
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink">
                      {locale === 'bn' ? 'ডেলিভারি মাধ্যম' : 'Delivery Method'}
                    </label>
                    <select
                      aria-label={uiText("Delivery method", locale)}
                      value={smartDeliveryMethod}
                      onChange={(e) =>
                        setSmartDeliveryMethod(
                          e.target.value as 'courier' | 'post_office'
                        )
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-xs bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    >
                      <option value="courier">{locale === 'bn' ? 'কুরিয়ার হোম ডেলিভারি' : 'Courier Home Delivery'}</option>
                      <option value="post_office">
                        {locale === 'bn' ? 'বাংলাদেশ ডাক বিভাগ (BD Post)' : 'Bangladesh Post Office (BD Post)'}
                      </option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-ink">
                      {locale === 'bn' ? 'পেমেন্ট মাধ্যম' : 'Payment Method'}
                    </label>
                    <select
                      aria-label={uiText("Payment method", locale)}
                      value={smartPaymentMethod}
                      onChange={(e) =>
                        setSmartPaymentMethod(
                          e.target.value as 'cod' | 'bkash_manual'
                        )
                      }
                      className="w-full min-h-[44px] px-3 py-2 text-xs bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    >
                      <option value="cod">{locale === 'bn' ? 'ক্যাশ অন ডেলিভারি (COD)' : 'Cash on Delivery (COD)'}</option>
                      <option value="bkash_manual">
                        {locale === 'bn' ? 'বিকাশ সেন্ড মানি (Manual TrxID)' : 'bKash Send Money (Manual TrxID)'}
                      </option>
                    </select>
                  </div>

                  {smartPaymentMethod === 'bkash_manual' ? (
                    <Input
                      label={locale === 'bn' ? 'বিকাশ TrxID *' : 'bKash TrxID *'}
                      value={smartTrxId}
                      onChange={(e) => setSmartTrxId(e.target.value)}
                      placeholder="BK98234XZA"
                      required
                    />
                  ) : (
                    <Input
                      label={locale === 'bn' ? 'ইন্টারনাল স্টাফ নোট' : 'Staff Note'}
                      value={smartStaffNote}
                      onChange={(e) => setSmartStaffNote(e.target.value)}
                      placeholder={locale === 'bn' ? 'দ্রুত প্যাকিং প্রয়োজন' : 'Urgent dispatch requested'}
                    />
                  )}
                </div>
              </Card>

              {/* Right: Live Profit-at-Entry, Address Quality & Confirm Box */}
              <Card
                surface="surface"
                padding="md"
                className="lg:col-span-5 space-y-4"
              >
                <h2 className="text-base font-bold text-ink border-b border-border pb-3">
                  {locale === 'bn'
                    ? 'স্মার্ট অর্ডার প্রিভিউ ও হিসাব (Poisha Exact)'
                    : 'Smart Order Preview & Breakdown (Exact Poisha)'}
                </h2>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{locale === 'bn' ? 'ঠিকানা কোয়ালিটি স্কোর:' : 'Address Quality Score:'}</span>
                    <Badge
                      status={
                        smartAddrQuality.score >= 70 ? 'success' : 'warning'
                      }
                    >
                      {smartAddrQuality.score}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{locale === 'bn' ? 'পণ্যের সাবটোটাল:' : 'Product Subtotal:'}</span>
                    <span className="font-mono font-bold text-ink">
                      {formatPoishaToBdt(smartLineSubtotalPoisha, locale)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {locale === 'bn'
                        ? `ডেলিভারি চার্জ (${smartDistrict.name_bn}):`
                        : `Delivery Charge (${smartDistrict.name_en}):`}
                    </span>
                    <span className="font-mono font-bold text-ink">
                      {smartDeliveryCalc.isFreeDeliveryApplied
                        ? (locale === 'bn' ? 'ফ্রি ডেলিভারি' : 'Free Delivery')
                        : formatPoishaToBdt(
                            smartDeliveryCalc.finalChargePoisha,
                            locale
                          )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-bold text-ink">
                    <span>{locale === 'bn' ? 'গ্রাহকের মোট প্রদেয়:' : 'Total Payable:'}</span>
                    <span className="font-mono">
                      {formatPoishaToBdt(
                        smartLineSubtotalPoisha +
                          smartDeliveryCalc.finalChargePoisha,
                        locale
                      )}
                    </span>
                  </div>
                </div>

                {/* Profit-at-Entry (Visible ONLY to Super Admin) */}
                {isSuperAdmin && (
                  <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg space-y-1.5 text-xs">
                    <p className="font-bold text-ink">
                      {locale === 'bn'
                        ? 'Profit-at-Entry (সুপার অ্যাডমিন প্রিভিউ):'
                        : 'Profit-at-Entry (Super Admin Only):'}
                    </p>
                    <div className="flex justify-between text-muted">
                      <span>{locale === 'bn' ? 'সাপ্লায়ার প্রদেয় (Payable):' : 'Supplier Payable:'}</span>
                      <span className="font-mono">
                        -{formatPoishaToBdt(smartSupplierPayablePoisha, locale)}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>{locale === 'bn' ? 'প্যাকেজিং ও ডেলিভারি ভর্তুকি:' : 'Packaging & Subsidy:'}</span>
                      <span className="font-mono">
                        -
                        {formatPoishaToBdt(
                          (snapshot?.siteSettings?.defaultPackagingCostPoisha ?? 0) +
                            smartDeliverySubsidyPoisha,
                          locale
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5 font-bold">
                      <span>{locale === 'bn' ? 'আনুমানিক নেট লাভ:' : 'Estimated Net Profit:'}</span>
                      <span
                        className={`font-mono ${
                          smartEstimatedProfitPoisha < 0
                            ? 'text-danger'
                            : 'text-success'
                        }`}
                      >
                        {formatPoishaToBdt(smartEstimatedProfitPoisha, locale)}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={smartSubmitting}
                  className="w-full"
                >
                  {smartSubmitting
                    ? (locale === 'bn' ? 'অর্ডার তৈরি হচ্ছে...' : 'Creating Order...')
                    : (locale === 'bn' ? 'স্মার্ট অর্ডার সাবমিট করুন' : 'Submit Smart Order')}
                </Button>
              </Card>
            </form>
          </section>
        )}

        {/* ==================================================================
            TAB 4: USERS, FORCED 2FA, CUSTOM ROLES & IMMUTABLE AUDIT LOG
           ================================================================== */}
        {activeTab === 'users_and_rbac' && (
          <section className="space-y-8">
            <div className="border-b border-border pb-3">
              <h1 className="text-xl font-bold text-ink">
                {locale === 'bn'
                  ? 'ইউজার সিকিউরিটি, বাধ্যতামূলক 2FA ও পারমিশন ম্যাট্রিক্স (Module P)'
                  : 'Users, Mandatory 2FA & Granular Permission Matrix'}
              </h1>
              <p className="text-xs text-muted">
                <LocalizedText source={"সুপার অ্যাডমিন থেকে নতুন ইউজার তৈরি (ওয়ান-টাইম টেম্পোরারি পাসওয়ার্ডসহ), 2FA রিসেট, কাস্টম রোল এবং অপরিবর্তনীয় অডিট লগ।"} area="admin" />{" "}</p>
            </div>

            {isSuperAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Create New User with One-Time Temp Password */}
                <Card
                  surface="bg"
                  padding="md"
                  className="lg:col-span-6 space-y-4"
                >
                  <h2 className="text-base font-bold text-ink border-b border-border pb-2">
                    {locale === 'bn' ? 'নতুন স্টাফ / ভেন্ডর ইউজার তৈরি করুন (No Public Signup)' : 'Create Staff / Vendor User (No Public Signup)'}
                  </h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setCreatedTempCredentials(null);
                      const res = await fetch('/api/admin/workspace', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          operation: 'create_user',
                          username: newUsername,
                          displayNameBn: newDisplayNameBn,
                          displayNameEn: newDisplayNameBn,
                          roleSlug: newRoleSlug,
                          maxDiscountBp: newMaxDiscountBp,
                        }),
                      });
                      const data = (await res.json()) as {
                        success: boolean;
                        errorBn?: string;
                        user?: SanitizedAdminUserDTO;
                        oneTimeTempPassword?: string;
                      };
                      if (!res.ok || !data.success || !data.oneTimeTempPassword) {
                        setActionFeedback({
                          type: 'error',
                          text: data.errorBn ?? (locale === 'bn' ? 'ইউজার তৈরি করা যায়নি।' : 'Failed to create user.'),
                        });
                      } else {
                        setCreatedTempCredentials({
                          username: data.user!.username,
                          tempPassword: data.oneTimeTempPassword,
                          roleSlug: data.user!.roleSlug,
                        });
                        setNewUsername('');
                        setNewDisplayNameBn('');
                        await fetchWorkspace();
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label={locale === 'bn' ? 'ইউজারনেম (ছোট হাতের ইংরেজি) *' : 'Username (lowercase) *'}
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="staff_rahim"
                        required
                      />
                      <Input
                        label={locale === 'bn' ? 'পূর্ণ নাম (Display Name) *' : 'Full Name (Display Name) *'}
                        value={newDisplayNameBn}
                        onChange={(e) => setNewDisplayNameBn(e.target.value)}
                        placeholder={locale === 'bn' ? 'রহিম উদ্দিন' : 'Rahim Uddin'}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-ink">
                          {locale === 'bn' ? 'রোল নির্বাচন করুন *' : 'Select Role *'}
                        </label>
                        <select
                          aria-label={uiText("Select Role", locale)}
                          value={newRoleSlug}
                          onChange={(e) =>
                            setNewRoleSlug(e.target.value as SystemRoleSlug)
                          }
                          className="w-full min-h-[42px] px-3 py-1.5 text-xs bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                        >
                          {(snapshot.roles ?? []).map((r) => (
                            <option key={r.roleSlug} value={r.roleSlug}>
                              {locale === 'bn' ? `${r.nameBn} (${r.roleSlug})` : `${r.nameEn} (${r.roleSlug})`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        label={locale === 'bn' ? 'সর্বোচ্চ ছাড় সীমা (Basis Points, 1000 = 10%)' : 'Max Discount Cap (Basis Points, 1000 = 10%)'}
                        type="number"
                        value={String(newMaxDiscountBp)}
                        onChange={(e) =>
                          setNewMaxDiscountBp(Number(e.target.value) || 0)
                        }
                      />
                    </div>
                    <Button type="submit" variant="primary" size="md">
                      {locale === 'bn' ? 'ইউজার তৈরি ও ওয়ান-টাইম পাসওয়ার্ড জেনারেট করুন' : 'Create User & Generate Temp Password'}
                    </Button>
                  </form>

                  {/* One-Time Temporary Password Display with Copy & WhatsApp Share */}
                  {createdTempCredentials && (
                    <div className="p-4 border border-ink rounded-[var(--radius-md)] bg-surface space-y-2.5 text-xs">
                      <Badge status="warning">
                        {locale === 'bn'
                          ? 'শুধুমাত্র একবার প্রদর্শিত — এখনই কপি বা শেয়ার করুন'
                          : 'Displayed once only — copy or share now'}
                      </Badge>
                      <p className="font-mono text-ink">
                        <LocalizedText source={"Username:"} area="admin" />{" "}<strong>{createdTempCredentials.username}</strong>{' '}
                        <LocalizedText source={"· Temp Password:"} area="admin" />{' '}
                        <strong>{createdTempCredentials.tempPassword}</strong>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void navigator.clipboard?.writeText(
                              `BongoConsign ERP Login\nUsername: ${createdTempCredentials.username}\nTemp Password: ${createdTempCredentials.tempPassword}`
                            );
                            setCopiedCredentials(true);
                            window.setTimeout(
                              () => setCopiedCredentials(false),
                              1500
                            );
                          }}
                          leftIcon={
                            copiedCredentials ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )
                          }
                        >
                          {copiedCredentials ? (locale === 'bn' ? 'কপি হয়েছে' : 'Copied') : (locale === 'bn' ? 'কপি করুন' : 'Copy Credentials')}
                        </Button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `BongoConsign ERP Login\nUsername: ${createdTempCredentials.username}\nTemp Password: ${createdTempCredentials.tempPassword}\nপ্রথম লগইনে পাসওয়ার্ড পরিবর্তন ও 2FA সেটআপ বাধ্যতামূলক।`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-semibold"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{locale === 'bn' ? 'WhatsApp-এ শেয়ার' : 'Share on WhatsApp'}</span>
                        </a>
                      </div>
                    </div>
                  )}
                </Card>

                {/* 4-Role Policy & Discount Cap Editor */}
                <Card
                  surface="bg"
                  padding="md"
                  className="lg:col-span-6 space-y-4"
                >
                  <h2 className="text-base font-bold text-ink border-b border-border pb-2">
                    {locale === 'bn' ? '৪টি অনুমোদিত সিস্টেম রোল ও ডিসকাউন্ট ক্যাপ কন্ট্রোল' : '4 Authorized System Roles & Discount Caps'}
                  </h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const res = await fetch('/api/admin/workspace', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          operation: 'upsert_role_matrix',
                          roleSlug: customRoleSlug,
                          nameBn: customRoleNameBn,
                          nameEn: customRoleNameBn,
                          maxDiscountBp: customRoleMaxDiscBp,
                          maskCustomerPiiForVendor: customRoleSlug === 'vendor',
                        }),
                      });
                      const data = (await res.json()) as {
                        success: boolean;
                        errorBn?: string;
                      };
                      if (data.success) {
                        setActionFeedback({
                          type: 'success',
                          text: locale === 'bn' ? 'সিস্টেম রোলের পলিসি ও ছাড় সীমা সংরক্ষিত হয়েছে।' : 'Role policy and discount cap saved.',
                        });
                        await fetchWorkspace();
                      } else {
                        setActionFeedback({
                          type: 'error',
                          text: data.errorBn ?? (locale === 'bn' ? 'রোল পলিসি আপডেট ব্যর্থ হয়েছে।' : 'Failed to update role policy.'),
                        });
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-ink">
                          {locale === 'bn' ? 'অনুমোদিত সিস্টেম রোল (4-Role Strict Lock) *' : 'Authorized Role (4-Role Lock) *'}
                        </label>
                        <select
                          value={customRoleSlug}
                          onChange={(e) =>
                            setCustomRoleSlug(e.target.value as SystemRoleSlug)
                          }
                          className="w-full h-10 px-3 bg-surface border border-border rounded-[var(--radius-sm)] text-sm text-ink"
                        >
                          <option value="marketing_manager">
                            <LocalizedText source={"marketing_manager ("} area="admin" />{locale === 'bn' ? 'মার্কেটিং ম্যানেজার' : 'Marketing Manager'})
                          </option>
                          <option value="packaging_manager">
                            <LocalizedText source={"packaging_manager ("} area="admin" />{locale === 'bn' ? 'প্যাকেজিং ম্যানেজার' : 'Packaging Manager'})
                          </option>
                          <option value="vendor">
                            <LocalizedText source={"vendor ("} area="admin" />{locale === 'bn' ? 'ভেন্ডর / সাপ্লায়ার' : 'Vendor / Supplier'})
                          </option>
                          <option value="super_admin">
                            <LocalizedText source={"super_admin ("} area="admin" />{locale === 'bn' ? 'সুপার অ্যাডমিন' : 'Super Admin'})
                          </option>
                        </select>
                      </div>
                      <Input
                        label={locale === 'bn' ? 'রোলের বাংলা নাম *' : 'Role Name (BN) *'}
                        value={customRoleNameBn}
                        onChange={(e) => setCustomRoleNameBn(e.target.value)}
                        placeholder={uiText("মার্কেটিং ম্যানেজার", locale)}
                        required
                      />
                    </div>
                    <Input
                      label={locale === 'bn' ? 'সর্বোচ্চ অনুমোদিত ডিসকাউন্ট (Basis Points)' : 'Max Authorized Discount (Basis Points)'}
                      type="number"
                      value={String(customRoleMaxDiscBp)}
                      onChange={(e) =>
                        setCustomRoleMaxDiscBp(Number(e.target.value) || 0)
                      }
                    />
                    <Button type="submit" variant="outline" size="md">
                      {locale === 'bn' ? 'রোল পলিসি আপডেট করুন' : 'Update Role Policy'}
                    </Button>
                  </form>
                </Card>
              </div>
            )}

            {/* Active Users Table */}
            <Card surface="bg" padding="md" className="space-y-3">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>{locale === 'bn' ? 'সিস্টেম ইউজার ও ২এফএ স্ট্যাটাস তালিকা' : 'System Users & 2FA Status Directory'}</span>
              </h2>
              <div className="border border-border rounded-[var(--radius-md)] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface text-muted">
                      <th className="p-3">{locale === 'bn' ? 'ইউজারনেম ও নাম' : 'Username & Name'}</th>
                      <th className="p-3">{locale === 'bn' ? 'রোল' : 'Role'}</th>
                      <th className="p-3"><LocalizedText source={"First-Login / 2FA Gate"} area="admin" /></th>
                      <th className="p-3">{locale === 'bn' ? 'সর্বোচ্চ ছাড় সীমা' : 'Max Discount Cap'}</th>
                      {isSuperAdmin && (
                        <th className="p-3 text-right">{locale === 'bn' ? 'সিকিউরিটি অ্যাকশন' : 'Security Actions'}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(snapshot.users ?? []).map((u) => (
                      <tr key={u.userId}>
                        <td className="p-3">
                          <div className="font-bold text-ink">
                            {locale === 'bn' ? u.displayNameBn : u.displayNameEn}
                          </div>
                          <div className="font-mono text-muted">
                            @{u.username} ({u.internalEmailAlias})
                          </div>
                        </td>
                        <td className="p-3 font-mono">{u.roleSlug}</td>
                        <td className="p-3">
                          {u.mustChangePassword ? (
                            <Badge status="warning">
                              <LocalizedText source={"First-Login Gate Pending"} area="admin" />{" "}</Badge>
                          ) : u.require2fa && u.totpEnrolled ? (
                            <Badge status="success"><LocalizedText source={"2FA Enrolled & Active"} area="admin" /></Badge>
                          ) : (
                            <Badge status="neutral">{locale === 'bn' ? '2FA বন্ধ' : '2FA Off'}</Badge>
                          )}
                        </td>
                        <td className="p-3 font-mono tabular-nums">
                          {(u.maxDiscountBp / 100).toFixed(1)}%
                        </td>
                        {isSuperAdmin && (
                          <td className="p-3 text-right space-x-2">
                            {u.require2fa && u.totpEnrolled && <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const adminTotpCode = window.prompt('অথেনটিকেটর অ্যাপের নতুন TOTP কোড দিন / Enter a fresh authenticator code')?.trim();
                                if (!adminTotpCode) return;
                                const res = await fetch('/api/admin/workspace', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    operation: 'reset_user_security',
                                    targetUserId: u.userId,
                                    action: 'reset_2fa',
                                    adminTotpCode,
                                  }),
                                });
                                if (res.ok) {
                                  setActionFeedback({
                                    type: 'success',
                                    text: `@${u.username}-এর 2FA রিসেট করা হয়েছে (পরবর্তী লগইনে পুনরায় সেটআপ বাধ্যতামূলক)।`,
                                  });
                                  await fetchWorkspace();
                                }
                              }}
                            >
                              <LocalizedText source={"2FA রিসেট"} area="admin" />{" "}</Button>
                            }
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Immutable Audit Log Viewer */}
            <Card surface="bg" padding="md" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  <span>{locale === 'bn' ? 'অপরিবর্তনীয় অডিট লগ (Immutable Append-Only Audit Log)' : 'Immutable Append-Only Audit Log'}</span>
                </h2>
                <Badge status="info"><LocalizedText source={"DELETE / UPDATE BLOCKED"} area="admin" /></Badge>
              </div>
              <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] max-h-72 overflow-y-auto text-xs">
                {(snapshot.auditLogs ?? []).map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-bg flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-ink">
                        [{log.actionCode}]
                      </span>{' '}
                      <span className="text-ink">{log.summaryBn}</span>
                    </div>
                    <div className="font-mono text-muted text-[11px] tabular-nums">
                      @{log.actorUsername} ({log.actorRole}) ·{' '}
                      {new Date(log.createdAt).toLocaleTimeString('bn-BD')}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* ==================================================================
            TAB 5: PHASE 4B — A4 3-PART & 4x6 THERMAL PRINT ENGINE (MODULE B & O)
           ================================================================== */}
        {activeTab === 'print_engine' && snapshot.printConfig && (
          <PrintEnginePanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            isVendor={isVendor}
            availableOrderNos={
              selectedOrderNos.length > 0
                ? selectedOrderNos
                : orders.map((o) => o.orderNo!).filter(Boolean)
            }
            initialPrintConfig={snapshot.printConfig}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB 6: PHASE 4B — COURIER 360, BATCH MANIFEST & 64-DISTRICT RATES
           ================================================================== */}
        {activeTab === 'courier_360' &&
          !isVendor &&
          snapshot.courier360 && (
            <Courier360AndRatesPanel
              locale={locale}
              isSuperAdmin={isSuperAdmin}
              isVendor={isVendor}
              brandNameBn={siteSettings.brandNameBn}
              courier360={snapshot.courier360}
              pickupBatches={snapshot.pickupBatches ?? []}
              remittanceLedger={snapshot.remittanceLedger ?? []}
              courierClaims={snapshot.courierClaims ?? []}
              districtRates={snapshot.districtRates ?? []}
              availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
              orders={orders}
              onRefreshWorkspace={fetchWorkspace}
            />
          )}

        {/* ==================================================================
            TAB 7: PHASE 4B — VENDOR ESCROW LEDGER, 4-WAY RETURN & PAYOUTS
           ================================================================== */}
        {activeTab === 'vendor_escrow' && snapshot.vendorEscrow && (
          <VendorEscrowAndReturnPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            isVendor={isVendor}
            brandNameBn={siteSettings.brandNameBn}
            minPayoutPoisha={snapshot.siteSettings?.minPayoutRequestPoisha ?? 0}
            vendors={snapshot.vendorEscrow.vendors}
            ledgerEntries={snapshot.vendorEscrow.ledgerEntries}
            payoutRequests={snapshot.vendorEscrow.payoutRequests}
            returnResolutions={snapshot.vendorEscrow.returnResolutions}
            availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
            products={snapshot.product360}
            orders={orders as unknown as OrderGridRowDTO[]}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB: VENDOR PANEL CONTROL & PERMISSION MATRIX (SUPER ADMIN)
           ================================================================== */}
        {activeTab === 'vendor_payouts' && isSuperAdmin && (
          <VendorPayoutRegisterPanel
            locale={locale}
            onNotify={(msg, tone) => setActionFeedback({ type: tone ?? 'success', text: msg })}
          />
        )}

        {activeTab === 'vendor_control' && isSuperAdmin && (
          <VendorControlPanel
            locale={locale}
            onNotify={(msg, tone) => setActionFeedback({ type: tone ?? 'success', text: msg })}
          />
        )}

        {/* ==================================================================
            TAB: PRODUCT & CATEGORY STUDIO (CRUD, 3-TIER PRICING & 8-WAY CONNECTIVITY)
           ================================================================== */}
        {activeTab === 'product_studio' && (
          <ProductManagementStudioPanel
            products={(snapshot.products || []) as InternalProductRecord[]}
            categories={snapshot.categories || []}
            vendors={
              snapshot.vendors ||
              snapshot.vendorEscrow?.vendors.map((v) => v.profile) ||
              []
            }
            orders={orders}
            districtRates={snapshot.districtRates}
            onRefresh={fetchWorkspace}
            currentUserId={currentUser.userId}
            userRole={currentUser.roleSlug}
            locale={locale}
          />
        )}

        {/* ==================================================================
            TAB 8: PHASE 4C — FINANCE, MONEY MAP, PROMO & PRODUCT 360 (MODULE F & G)
           ================================================================== */}
        {activeTab === 'finance_product360' && (
          <FinanceProduct360AndExpensesPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            isVendor={isVendor}
            roleSlug={currentUser.roleSlug}
            product360={snapshot.product360 ?? []}
            moneyMapPnl={snapshot.moneyMapPnl ?? null}
            expenses={snapshot.expenses ?? []}
            promoCodes={snapshot.promoCodes ?? []}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB 9: PHASE 4C — MESSAGING, BLACKLIST, AUTOMATION & SHEETS MIRROR
           ================================================================== */}
        {activeTab === 'messaging_automation' && !isVendor && (
          <MessagingAutomationAndSheetsPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
            blacklistedPhones={snapshot.blacklistedPhones ?? {}}
            messageTemplates={snapshot.messageTemplates ?? []}
            messageLogs={snapshot.messageLogs ?? []}
            automationKillSwitchActive={Boolean(
              snapshot.automationKillSwitchActive
            )}
            automationRules={snapshot.automationRules ?? []}
            automationLogs={snapshot.automationLogs ?? []}
            sheetsSyncHistory={snapshot.sheetsSyncHistory ?? []}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB 10: PHASE 4C — SUPER ADMIN CONTROL CENTER, CREDENTIALS & CRON
           ================================================================== */}
        {activeTab === 'contact_management' && isSuperAdmin && (
          <ContactManagementPanel locale={locale} inquiries={snapshot.inquiries ?? []} orders={orders} users={snapshot.users ?? []} onRefreshWorkspace={fetchWorkspace} />
        )}

        {activeTab === 'control_center' && isSuperAdmin && (
          <SuperAdminControlCenterPanel
            siteSettings={snapshot.siteSettings!}
            maskedCredentials={snapshot.maskedCredentials ?? []}
            scheduledJobs={snapshot.scheduledJobs ?? []}
            onRefreshWorkspace={fetchWorkspace}
            locale={locale}
          />
        )}

        {/* ==================================================================
            TAB 11: PHASE 5 — PRE-LAUNCH SECURITY AUDIT & GO-LIVE CENTER (MODULE Q)
           ================================================================== */}
        {activeTab === 'phase5_readiness' &&
          isSuperAdmin &&
          snapshot.phase5Audit &&
          snapshot.phase5RoleInspection &&
          snapshot.phase5LifecycleDryRun && (
            <Phase5ReadinessPanel
              locale={locale}
              initialAuditReport={snapshot.phase5Audit}
              initialRoleInspection={snapshot.phase5RoleInspection}
              initialLifecycleDryRun={snapshot.phase5LifecycleDryRun}
              onRefreshWorkspace={fetchWorkspace}
            />
          )}

        {/* ==================================================================
            TAB 12: PHASE 6 — LIVE OPS, CART RECOVERY CRM, WEBHOOKS & BACKUP (MODULE S)
           ================================================================== */}
        {activeTab === 'phase6_ops' &&
          !isVendor &&
          snapshot.phase6Overview && (
            <Phase6LiveOpsPanel
              locale={locale}
              overview={snapshot.phase6Overview}
              availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
              onRefreshWorkspace={fetchWorkspace}
            />
          )}

        {/* ==================================================================
            TAB 13: PHASE 7 — SELF-SERVICE VENDOR PORTAL, FLASH CAMPAIGNS & ACCOUNTING (MODULE T)
           ================================================================== */}
        {activeTab === 'phase7_portal' && snapshot.phase7Overview && (
          <Phase7PortalPanel
            overview={snapshot.phase7Overview}
            productVariants={(snapshot.product360 ?? []).map((p) => ({
              productId: p.productId,
              productNameBn: p.productNameBn,
              variantId: p.variantId,
              variantTitleBn: p.variantTitleBn,
              publicSku: p.publicSku,
              salePricePoisha: p.salePricePoisha,
              supplierCostPoisha: p.supplierCostPoisha,
              platformMarginPoisha: p.platformMarginPoisha,
              stockAvailable: p.stockAvailable,
            }))}
            roleSlug={currentUser.roleSlug}
            onRefreshWorkspace={fetchWorkspace}
            onNotify={(msg, tone) =>
              setActionFeedback({ type: tone ?? 'success', text: msg })
            }
            locale={locale}
          />
        )}
      </main>
      </div>

      {/* Mobile Bottom Tab Bar (<= 768px) */}
      <nav
        aria-label={uiText("Admin Mobile Bottom Navigation", locale)}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg safe-bottom"
      >
        <div className="grid grid-cols-5 h-14 text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab('today_screen')}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'today_screen'
                ? 'text-ink font-bold'
                : 'text-muted'
            }`}
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'আজকের' : 'Today'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders_grid')}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'orders_grid' ? 'text-ink font-bold' : 'text-muted'
            }`}
          >
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'অর্ডারসমূহ' : 'Orders'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('print_engine')}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'print_engine'
                ? 'text-ink font-bold'
                : 'text-muted'
            }`}
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'প্রিন্ট' : 'Print'}</span>
          </button>
          {!isVendor && (
            <button
              type="button"
              onClick={() => setActiveTab('courier_360')}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'courier_360'
                  ? 'text-ink font-bold'
                  : 'text-muted'
              }`}
            >
              <Truck className="w-4 h-4" aria-hidden="true" />
              <span>{locale === 'bn' ? 'কুরিয়ার' : 'Courier'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('vendor_escrow')}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'vendor_escrow'
                ? 'text-ink font-bold'
                : 'text-muted'
            }`}
          >
            <Wallet className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'এসক্রো' : 'Escrow'}</span>
          </button>
        </div>
      </nav>

      {/* =====================================================================
          1. FULL ORDER MASTER & FINANCIAL STUDIO RESPONSIVE SHEET
         ===================================================================== */}
      <ResponsiveSheet
        open={Boolean(activeActionOrder)}
        onOpenChange={(open) => {
          if (!open) setActiveActionOrder(null);
        }}
        title={
          activeActionOrder
            ? (locale === 'bn'
                ? `অর্ডার মাস্টার এডিটর: ${activeActionOrder.orderNo}`
                : `Order Master Editor: ${activeActionOrder.orderNo}`)
            : (locale === 'bn' ? 'অর্ডার এডিটর' : 'Order Editor')
        }
      >
        {activeActionOrder && (
          <div className="space-y-6 text-xs pb-16">
            {/* Header Status & Financial Snapshot */}
            <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-sm text-ink">
                    {activeActionOrder.orderNo}
                  </span>
                  <span className="ml-2 font-mono text-[11px] px-2 py-0.5 rounded bg-bg border border-border text-muted">
                    {editOrderSource}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    {editOrderStatus}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-bg border border-border text-muted">
                    <LocalizedText source={"রিস্ক:"} area="admin" />{" "}{activeActionOrder.riskScore ?? 0}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center border-t border-border/60">
                <div className="p-1.5 rounded bg-bg">
                  <div className="text-[10px] text-muted"><LocalizedText source={"সাবটোটাল"} area="admin" /></div>
                  <div className="font-bold text-ink text-xs">
                    {formatPoishaToBdt(
                      editItems.reduce(
                        (sum, item) =>
                          sum + item.quantity * item.unitSalePricePoisha,
                        0
                      ),
                      locale
                    )}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-bg">
                  <div className="text-[10px] text-muted"><LocalizedText source={"বিশেষ ছাড়"} area="admin" /></div>
                  <div className="font-bold text-rose-600 text-xs">
                    <LocalizedText source={"-৳"} area="admin" />{editDiscountTaka}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-bg">
                  <div className="text-[10px] text-muted"><LocalizedText source={"মোট প্রদেয়"} area="admin" /></div>
                  <div className="font-bold text-ink text-xs">
                    {formatPoishaToBdt(
                      Math.max(
                        0,
                        editItems.reduce(
                          (sum, item) =>
                            sum + item.quantity * item.unitSalePricePoisha,
                          0
                        ) -
                          Math.max(0, (editDiscountTaka || 0) * 100) +
                          Math.max(0, (editDeliveryChargeTaka || 0) * 100)
                      ),
                      locale
                    )}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold">
                    <LocalizedText source={"ক্যাশ অন ডেলিভারি"} area="admin" />{" "}</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                    {formatPoishaToBdt(
                      Math.max(
                        0,
                        Math.max(
                          0,
                          editItems.reduce(
                            (sum, item) =>
                              sum + item.quantity * item.unitSalePricePoisha,
                            0
                          ) -
                            Math.max(0, (editDiscountTaka || 0) * 100) +
                            Math.max(0, (editDeliveryChargeTaka || 0) * 100)
                        ) -
                          Math.max(
                            0,
                            Math.min(
                              Math.max(
                                0,
                                editItems.reduce(
                                  (sum, item) =>
                                    sum + item.quantity * item.unitSalePricePoisha,
                                  0
                                ) -
                                  Math.max(0, (editDiscountTaka || 0) * 100) +
                                  Math.max(0, (editDeliveryChargeTaka || 0) * 100)
                              ),
                              (editAdvancePaidTaka || 0) * 100
                            )
                          )
                      ),
                      locale
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 1: কাস্টমার ও ডেলিভারি ঠিকানা */}
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
              <h3 className="font-bold text-ink flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-ink" aria-hidden="true" />
                  <span><LocalizedText source={"১. গ্রাহক ও ডেলিভারি ঠিকানা (Customer & Address)"} area="admin" /></span>
                </span>
                <span className="font-mono text-[11px] text-muted">
                  <LocalizedText source={"স্কোর:"} area="admin" />{" "}{evaluateAddressQuality({
                    districtId: editDistrictId,
                    upazilaId: editUpazilaId,
                    streetAddress: editAddressStreet,
                    landmark: editAddressLandmark,
                    customerPhone: editCustomerPhone,
                  }).score}%
                </span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="গ্রাহকের নাম"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  placeholder={uiText("পূর্ণ নাম লিখুন", locale)}
                />
                <div>
                  <Input
                    label="মোবাইল নম্বর (১১ ডিজিট)"
                    value={editCustomerPhone}
                    onChange={(e) => setEditCustomerPhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                  />
                  {(() => {
                    const norm = normalizeBdPhone(editCustomerPhone);
                    if (!norm) return null;
                    const pfx = norm.slice(0, 3);
                    const carrier =
                      pfx === '017' || pfx === '013'
                        ? 'গ্রামীণফোন (GP)'
                        : pfx === '018'
                        ? 'রবি (Robi)'
                        : pfx === '019' || pfx === '014'
                        ? 'বাংলালিংক (BL)'
                        : pfx === '015'
                        ? 'টেলিটক (Teletalk)'
                        : pfx === '016'
                        ? 'এয়ারটেল (Airtel)'
                        : 'বাংলাদেশ মোবাইল';
                    return (
                      <p className="text-[10px] text-muted pt-0.5">
                        <LocalizedText source={"অপারেটর:"} area="admin" />{" "}{carrier}
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"জেলা (District)"} area="admin" />{" "}</label>
                  <select
                    value={editDistrictId}
                    onChange={(e) => {
                      const newDistId = Number(e.target.value);
                      setEditDistrictId(newDistId);
                      const upzList = getThanasByDistrict(newDistId);
                      if (upzList.length > 0) {
                        setEditUpazilaId(upzList[0].id);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                  >
                    {BD_DISTRICTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name_bn} ({d.name_en})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"উপজেলা / থানা (Upazila)"} area="admin" />{" "}</label>
                  <select
                    value={editUpazilaId}
                    onChange={(e) => setEditUpazilaId(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                  >
                    {getThanasByDistrict(editDistrictId).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name_bn} ({u.name_en})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Input
                  label="বিস্তারিত ঠিকানা (বাড়ি, রোড, এলাকা)"
                  value={editAddressStreet}
                  onChange={(e) => setEditAddressStreet(e.target.value)}
                  placeholder={uiText("যেমন: বাড়ি ১২, রোড ৪, সেক্টর ৭, উত্তরা", locale)}
                />
                <Input
                  label="পরিচিত ল্যান্ডমার্ক (স্কুল, মসজিদ, মোড় বা বাজার)"
                  value={editAddressLandmark}
                  onChange={(e) => setEditAddressLandmark(e.target.value)}
                  placeholder={uiText("যেমন: উত্তরা হাই স্কুলের পাশে", locale)}
                />
              </div>

              {/* Address Quality Indicator */}
              <div className="p-2.5 rounded bg-surface border border-border flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-ink" />
                  <span>
                    <LocalizedText source={"ঠিকানা নির্ভুলতা রেটিং:"} area="admin" />{' '}
                    <strong className="font-mono text-ink">
                      {evaluateAddressQuality({
                        districtId: editDistrictId,
                        upazilaId: editUpazilaId,
                        streetAddress: editAddressStreet,
                        landmark: editAddressLandmark,
                        customerPhone: editCustomerPhone,
                      }).score}%
                    </strong>
                  </span>
                </div>
                {evaluateAddressQuality({
                  districtId: editDistrictId,
                  upazilaId: editUpazilaId,
                  streetAddress: editAddressStreet,
                  landmark: editAddressLandmark,
                  customerPhone: editCustomerPhone,
                }).score < 70 && (
                  <span className="text-amber-700 dark:text-amber-400 font-semibold text-[10px]">
                    <LocalizedText source={"⚠ কুরিয়ার বুকিংয়ে ল্যান্ডমার্ক জরুরি"} area="admin" />{" "}</span>
                )}
              </div>
            </div>

            {/* Section 2: অর্ডারের পণ্য ও পরিমাণ */}
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
              <h3 className="font-bold text-ink flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-ink" aria-hidden="true" />
                  <span><LocalizedText source={"২. অর্ডারের পণ্য ও পরিমাণ (Products & Quantity)"} area="admin" /></span>
                </span>
                <span className="font-mono text-muted text-[11px]">
                  <LocalizedText source={"মোট আইটেম:"} area="admin" />{" "}{editItems.reduce((s, i) => s + i.quantity, 0)}<LocalizedText source={"টি"} area="admin" />{" "}</span>
              </h3>

              <div className="space-y-2.5">
                {editItems.map((item, idx) => (
                  <div
                    key={`${item.variantId}-${idx}`}
                    className="p-3 border border-border rounded-[var(--radius-sm)] bg-surface space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-bold text-ink">{localizedField(item, "productNameBn", locale)}</p>
                        <p className="text-muted text-[11px]">
                          {localizedField(item, "variantTitleBn", locale)} {" "}<LocalizedText source={"· SKU:"} area="admin" />{" "}{item.publicSku}
                        </p>
                      </div>
                      {editItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-danger hover:bg-danger/10 rounded cursor-pointer"
                          title={uiText("পণ্য বাতিল করুন", locale)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-center pt-1 border-t border-border/50 text-[11px]">
                      {/* Quantity Stepper */}
                      <div>
                        <span className="text-muted block text-[10px] mb-1">
                          <LocalizedText source={"পরিমাণ"} area="admin" />{" "}</span>
                        <div className="flex items-center border border-border rounded-[var(--radius-sm)] bg-bg">
                          <button
                            type="button"
                            onClick={() =>
                              handleItemQuantityChange(idx, item.quantity - 1)
                            }
                            disabled={item.quantity <= 1}
                            className="px-2 py-1 hover:bg-surface disabled:opacity-30 cursor-pointer font-bold"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemQuantityChange(
                                idx,
                                parseInt(e.target.value) || 1
                              )
                            }
                            className="w-10 text-center font-bold text-xs bg-transparent border-0 py-1"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleItemQuantityChange(idx, item.quantity + 1)
                            }
                            className="px-2 py-1 hover:bg-surface cursor-pointer font-bold"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Unit Price (৳) */}
                      <div>
                        <span className="text-muted block text-[10px] mb-1">
                          <LocalizedText source={"একক মূল্য (৳)"} area="admin" />{" "}</span>
                        <input
                          type="number"
                          min="0"
                          value={Math.round(item.unitSalePricePoisha / 100)}
                          onChange={(e) =>
                            handleItemPriceChange(
                              idx,
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-full px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-bg font-mono font-bold text-xs"
                        />
                      </div>

                      {/* Line Subtotal */}
                      <div className="text-right">
                        <span className="text-muted block text-[10px] mb-1">
                          <LocalizedText source={"সাবটোটাল"} area="admin" />{" "}</span>
                        <span className="font-mono font-bold text-ink text-xs">
                          <LocalizedText source={"৳"} area="admin" />{Math.round(item.lineSubtotalPoisha / 100)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Product Selector */}
              {snapshot?.products &&
                snapshot.products.length > 0 && (
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <select
                      id="add-item-variant-select"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="flex-1 px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                    >
                      <option value=""><LocalizedText source={"+ অর্ডারে নতুন পণ্য যোগ করুন..."} area="admin" /></option>
                      {snapshot.products.map((prod) =>
                        prod.variants?.map((v) => (
                          <option key={v.variantId} value={v.variantId}>
                            {localizedField(prod, "nameBn", locale)} - {localizedField(v, "titleBn", locale)} {" "}<LocalizedText source={"(৳"} area="admin" />{" "}{Math.round((v.salePricePoisha ?? 0) / 100)})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
            </div>

            {/* Section 3: মূল্যছাড় ও আর্থিক হিসাব (Exact Integer Poisha) */}
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
              <h3 className="font-bold text-ink flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-ink" aria-hidden="true" />
                  <span><LocalizedText source={"৩. মূল্যছাড় ও আর্থিক হিসাব (Pricing & Discounts)"} area="admin" /></span>
                </span>
                <span className="font-mono text-emerald-600 font-bold text-[11px]">
                  <LocalizedText source={"পূর্ণসংখ্যা পয়সা হিসাব (Rule A1)"} area="admin" />{" "}</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"বিশেষ ডিসকাউন্ট / মূল্যছাড় (৳)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min="0"
                    value={editDiscountTaka}
                    onChange={(e) =>
                      setEditDiscountTaka(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-bold text-xs"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-muted pt-0.5">
                    <LocalizedText source={"এডমিন কর্তৃক প্রদত্ত মোট ছাড়"} area="admin" />{" "}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"ডেলিভারি চার্জ (৳)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min="0"
                    value={editDeliveryChargeTaka}
                    onChange={(e) =>
                      setEditDeliveryChargeTaka(
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-bold text-xs"
                  />
                  <div className="flex items-center gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditDeliveryChargeTaka(0)}
                      className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] hover:bg-bg cursor-pointer"
                    >
                      <LocalizedText source={"ফ্রি (৳০)"} area="admin" />{" "}</button>
                    <button
                      type="button"
                      onClick={() => setEditDeliveryChargeTaka(70)}
                      className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] hover:bg-bg cursor-pointer"
                    >
                      <LocalizedText source={"ঢাকা (৳৭০)"} area="admin" />{" "}</button>
                    <button
                      type="button"
                      onClick={() => setEditDeliveryChargeTaka(120)}
                      className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] hover:bg-bg cursor-pointer"
                    >
                      <LocalizedText source={"বাইরে (৳১২০)"} area="admin" />{" "}</button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"অগ্রিম আদায় (৳)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min="0"
                    disabled value={editAdvancePaidTaka}
                    onChange={(e) =>
                      setEditAdvancePaidTaka(
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-bold text-xs"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-muted pt-0.5">
                    <LocalizedText source={"বিকাশ/নগদ অগ্রিম প্রাপ্ত টাকা"} area="admin" />{" "}</p>
                </div>
              </div>

              {/* Payment Methods & Verification */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"পেমেন্ট মেথড"} area="admin" />{" "}</label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) =>
                      setEditPaymentMethod(e.target.value as PaymentMethod)
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                  >
                    <option value="cod"><LocalizedText source={"ক্যাশ অন ডেলিভারি (COD)"} area="admin" /></option>
                    <option value="bkash_manual"><LocalizedText source={"বিকাশ ম্যানুয়াল (bKash)"} area="admin" /></option>


                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"পেমেন্ট স্ট্যাটাস"} area="admin" />{" "}</label>
                  <select
                    disabled value={editPaymentStatus}
                    onChange={(e) =>
                      setEditPaymentStatus(e.target.value as PaymentStatus)
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                  >
                    <option value="unpaid"><LocalizedText source={"unpaid (অনপরিশোধিত / সিওডি)"} area="admin" /></option>
                    <option value="partial_verified"><LocalizedText source={"partial_verified (আংশিক পরিশোধ)"} area="admin" /></option>
                    <option value="paid_verified"><LocalizedText source={"paid_verified (সম্পূর্ণ পরিশোধ)"} area="admin" /></option>
                    <option value="remitted"><LocalizedText source={"remitted (কুরিয়ার সেটেলমেন্ট)"} area="admin" /></option>
                    <option value="refunded"><LocalizedText source={"refunded (রিফান্ড)"} area="admin" /></option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"বিকাশ / নগদ TrxID"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    disabled value={editManualPaymentTrxId}
                    onChange={(e) => setEditManualPaymentTrxId(e.target.value)}
                    placeholder="BLXXXXXXXX"
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: কুরিয়ার ও ট্র্যাকিং তথ্য */}
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
              <h3 className="font-bold text-ink flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-ink" aria-hidden="true" />
                  <span><LocalizedText source={"৪. কুরিয়ার ও ট্র্যাকিং তথ্য (Courier & Live Tracking)"} area="admin" /></span>
                </span>
                <span className="font-mono text-muted text-[11px]">
                  <LocalizedText source={"ম্যানুয়াল এন্ট্রি ও অটোমেটিক সিঙ্ক"} area="admin" />{" "}</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"কুরিয়ার প্রভাইডার"} area="admin" />{" "}</label>
                  <select
                    value={editCourierProvider}
                    onChange={(e) =>
                      setEditCourierProvider(e.target.value as CourierProvider)
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs font-semibold"
                  >
                    <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                    <option value="pathao"><LocalizedText source={"Pathao Courier"} area="admin" /></option>

                    <option value="bd_post"><LocalizedText source={"বাংলাদেশ ডাক বিভাগ (BD Post)"} area="admin" /></option>
                    <option value="manual"><LocalizedText source={"ম্যানুয়াল কুরিয়ার"} area="admin" /></option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"কুরিয়ার ট্র্যাকিং আইডি (Tracking ID)"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    disabled value={editTrackingCode}
                    onChange={(e) => setEditTrackingCode(e.target.value)}
                    placeholder={uiText("যেমন: SF-12345678 বা PT-9876", locale)}
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"কন্সায়নমেন্ট আইডি (Consignment ID)"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    disabled value={editConsignmentId}
                    onChange={(e) => setEditConsignmentId(e.target.value)}
                    placeholder={uiText("যেমন: CNS-ORD-XXXXXX", locale)}
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                  />
                </div>
              </div>

              {/* Live Tracking Link Preview */}
              <div className="p-3 rounded bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted">
                    <LocalizedText source={"লাইভ পার্সেল ট্র্যাকিং ওয়েব লিংক:"} area="admin" />{" "}</p>
                  <p className="font-mono text-xs text-ink truncate max-w-md">
                    {getLiveCourierTrackingUrl(
                      editCourierProvider,
                      editTrackingCode,
                      editConsignmentId,
                      activeActionOrder.orderNo
                    )}
                  </p>
                </div>
                <a
                  href={getLiveCourierTrackingUrl(
                    editCourierProvider,
                    editTrackingCode,
                    editConsignmentId,
                    activeActionOrder.orderNo
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded bg-bg border border-border text-ink hover:bg-surface font-semibold text-xs inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span><LocalizedText source={"লিংক টেস্ট করুন"} area="admin" /></span>
                </a>
              </div>
            </div>

            {/* Section 5: কল কনফার্মেশন ও অর্ডার স্ট্যাটাস */}
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
              <h3 className="font-bold text-ink flex items-center justify-between text-xs border-b border-border pb-2">
                <span className="flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-ink" aria-hidden="true" />
                  <span><LocalizedText source={"৫. কল কনফার্মেশন ও স্ট্যাটাস (Call & Workflow)"} area="admin" /></span>
                </span>
                <span className="font-mono text-muted text-[11px]">
                  <LocalizedText source={"মোট কল চেষ্টা:"} area="admin" />{" "}{activeActionOrder.callAttempts ?? 0}
                </span>
              </h3>

              {/* Direct Call Outcome Selector Buttons */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-ink">
                  <LocalizedText source={"কল করার পর ফলাফল নির্ধারণ করুন (Call Outcome Selection):"} area="admin" />{" "}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditCallStatus('confirmed_yes');
                      setEditOrderStatus('confirmed');
                    }}
                    className={`px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      editCallStatus === 'confirmed_yes'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-surface text-ink border-border hover:bg-emerald-500/10'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span><LocalizedText source={"হ্যাঁ (নিশ্চিত)"} area="admin" /></span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditCallStatus('not_answered_busy');
                    }}
                    className={`px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      editCallStatus === 'not_answered_busy'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-surface text-ink border-border hover:bg-amber-500/10'
                    }`}
                  >
                    <PhoneMissed className="w-4 h-4" />
                    <span><LocalizedText source={"ব্যস্ত / ধরেননি"} area="admin" /></span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditCallStatus('cancelled_no');
                      setEditOrderStatus('cancelled');
                    }}
                    className={`px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      editCallStatus === 'cancelled_no'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-surface text-ink border-border hover:bg-rose-500/10'
                    }`}
                  >
                    <XSquare className="w-4 h-4" />
                    <span><LocalizedText source={"না (বাতিল)"} area="admin" /></span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditCallStatus('call_back_requested');
                    }}
                    className={`px-3 py-2 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      editCallStatus === 'call_back_requested'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-surface text-ink border-border hover:bg-indigo-500/10'
                    }`}
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span><LocalizedText source={"পরে কল করুন"} area="admin" /></span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"অর্ডার স্ট্যাটাস (Order Status)"} area="admin" />{" "}</label>
                  <select
                    disabled value={editOrderStatus}
                    onChange={(e) =>
                      setEditOrderStatus(e.target.value as OrderStatus)
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs font-semibold"
                  >
                    <option value="pending_confirmation">
                      <LocalizedText source={"pending_confirmation (পেন্ডিং কনফার্মেশন)"} area="admin" />{" "}</option>
                    <option value="confirmed"><LocalizedText source={"confirmed (নিশ্চিত)"} area="admin" /></option>
                    <option value="packed"><LocalizedText source={"packed (প্যাকিং সম্পন্ন)"} area="admin" /></option>
                    <option value="shipped"><LocalizedText source={"shipped (কুরিয়ারে হস্তান্তর)"} area="admin" /></option>
                    <option value="out_for_delivery">
                      <LocalizedText source={"out_for_delivery (ডেলিভারির পথে)"} area="admin" />{" "}</option>
                    <option value="delivered"><LocalizedText source={"delivered (ডেলিভারি সম্পন্ন)"} area="admin" /></option>
                    <option value="return_initiated">
                      <LocalizedText source={"return_initiated (রিটার্ন প্রক্রিয়া)"} area="admin" />{" "}</option>
                    <option value="returned"><LocalizedText source={"returned (রিটার্ন গৃহীত)"} area="admin" /></option>
                    <option value="cancelled"><LocalizedText source={"cancelled (বাতিল)"} area="admin" /></option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    <LocalizedText source={"অর্ডার সোর্স (Order Source)"} area="admin" />{" "}</label>
                  <select
                    value={editOrderSource}
                    onChange={(e) =>
                      setEditOrderSource(e.target.value as OrderSource)
                    }
                    className="w-full px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                  >
                    <option value="storefront"><LocalizedText source={"storefront (অনলাইন ওয়েবসাইট)"} area="admin" /></option>
                    <option value="whatsapp"><LocalizedText source={"whatsapp (হোয়াটসঅ্যাপ চ্যাট)"} area="admin" /></option>
                    <option value="phone_call"><LocalizedText source={"phone_call (সরাসরি ফোন কল)"} area="admin" /></option>
                    <option value="facebook"><LocalizedText source={"facebook (ফেসবুক পেজ / ইনবক্স)"} area="admin" /></option>
                    <option value="instagram"><LocalizedText source={"instagram (ইনস্টাগ্রাম)"} area="admin" /></option>
                    <option value="other"><LocalizedText source={"other (অন্যান্য ম্যানুয়াল এন্ট্রি)"} area="admin" /></option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Input
                  label="অভ্যন্তরীণ স্টাফ নোট (Internal Staff Note)"
                  value={editStaffNote}
                  onChange={(e) => setEditStaffNote(e.target.value)}
                  placeholder={uiText("যেমন: গ্রাহক কাল সকালে ডেলিভারি দিতে বলেছেন", locale)}
                />

                <Input
                  label="কুরিয়ার ওভাররাইড কারণ (ঠিকানা স্কোর ৭০% এর কম হলে প্রযোজ্য)"
                  value={bookingOverrideReason}
                  onChange={(e) => setBookingOverrideReason(e.target.value)}
                  placeholder={uiText("যেমন: গ্রাহকের সাথে ফোনে কথা বলে ঠিকানা কনফার্ম করা হয়েছে", locale)}
                />
              </div>
            </div>

            {/* Sticky Bottom Save Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-3 bg-surface/95 backdrop-blur border-t border-border flex flex-wrap items-center justify-between gap-2 z-50 shadow-lg safe-bottom">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-ink">
                  <LocalizedText source={"মোট:"} area="admin" />{' '}
                  {formatPoishaToBdt(
                    Math.max(
                      0,
                      editItems.reduce(
                        (sum, item) =>
                          sum + item.quantity * item.unitSalePricePoisha,
                        0
                      ) -
                        Math.max(0, (editDiscountTaka || 0) * 100) +
                        Math.max(0, (editDeliveryChargeTaka || 0) * 100)
                    ),
                    locale
                  )}
                </span>
                <span className="text-muted">·</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  <LocalizedText source={"COD:"} area="admin" />{' '}
                  {formatPoishaToBdt(
                    Math.max(
                      0,
                      Math.max(
                        0,
                        editItems.reduce(
                          (sum, item) =>
                            sum + item.quantity * item.unitSalePricePoisha,
                          0
                        ) -
                          Math.max(0, (editDiscountTaka || 0) * 100) +
                          Math.max(0, (editDeliveryChargeTaka || 0) * 100)
                      ) -
                        Math.max(
                          0,
                          Math.min(
                            Math.max(
                              0,
                              editItems.reduce(
                                (sum, item) =>
                                  sum + item.quantity * item.unitSalePricePoisha,
                                0
                              ) -
                                Math.max(0, (editDiscountTaka || 0) * 100) +
                                Math.max(0, (editDeliveryChargeTaka || 0) * 100)
                            ),
                            (editAdvancePaidTaka || 0) * 100
                          )
                        )
                    ),
                    locale
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveActionOrder(null)}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:bg-surface font-semibold text-xs cursor-pointer"
                >
                  <LocalizedText source={"বাতিল"} area="admin" />{" "}</button>
                <button
                  type="button"
                  disabled={isSavingOrder}
                  onClick={handleSaveFullOrder}
                  className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-ink text-surface hover:opacity-90 font-bold text-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {isSavingOrder ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span><LocalizedText source={"সংরক্ষণ হচ্ছে..."} area="admin" /></span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span><LocalizedText source={"সংরক্ষণ করুন (Save Changes)"} area="admin" /></span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {/* =====================================================================
          2. CUSTOMER MESSAGE STUDIO RESPONSIVE SHEET (WHATSAPP, SMS, LIVE TRACKING)
         ===================================================================== */}
      <ResponsiveSheet
        open={Boolean(activeMessageOrder)}
        onOpenChange={(open) => {
          if (!open) setActiveMessageOrder(null);
        }}
        title={
          activeMessageOrder
            ? `গ্রাহক মেসেজ প্যানেল: ${activeMessageOrder.orderNo}`
            : 'মেসেজ প্যানেল'
        }
      >
        {activeMessageOrder && (
          <div className="space-y-4 text-xs">
            {/* Customer & Order Header Strip */}
            <div className="p-3 border border-border rounded-[var(--radius-md)] bg-surface flex items-center justify-between">
              <div>
                <p className="font-bold text-ink">
                  {activeMessageOrder.customerName}
                </p>
                <p className="font-mono text-muted text-[11px]">
                  {activeMessageOrder.customerPhone} · {localizedField(activeMessageOrder, "districtNameBn", locale)}
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-ink font-bold">
                  {activeMessageOrder.orderNo}
                </span>
                <p className="text-[10px] text-muted">
                  <LocalizedText source={"স্ট্যাটাস:"} area="admin" />{" "}{activeMessageOrder.status}
                </p>
              </div>
            </div>

            {/* Template Selector Chips */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-ink">
                <LocalizedText source={"মেসেজ টেমপ্লেট নির্বাচন করুন (Quick Templates):"} area="admin" />{" "}</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMessageTemplateType('tracking_link');
                    setMessageCustomText(
                      buildOrderMessageText(activeMessageOrder, 'tracking_link')
                    );
                  }}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] border text-xs font-semibold cursor-pointer transition-colors ${
                    messageTemplateType === 'tracking_link'
                      ? 'bg-ink text-surface border-ink'
                      : 'bg-surface text-ink border-border hover:bg-bg'
                  }`}
                >
                  <LocalizedText source={"🚚 কুরিয়ার ট্র্যাকিং লিংক"} area="admin" />{" "}</button>

                <button
                  type="button"
                  onClick={() => {
                    setMessageTemplateType('delivered');
                    setMessageCustomText(
                      buildOrderMessageText(activeMessageOrder, 'delivered')
                    );
                  }}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] border text-xs font-semibold cursor-pointer transition-colors ${
                    messageTemplateType === 'delivered'
                      ? 'bg-ink text-surface border-ink'
                      : 'bg-surface text-ink border-border hover:bg-bg'
                  }`}
                >
                  <LocalizedText source={"🎉 ডেলিভারি সম্পন্ন ও ফিডব্যাক"} area="admin" />{" "}</button>

                <button
                  type="button"
                  onClick={() => {
                    setMessageTemplateType('order_confirmed');
                    setMessageCustomText(
                      buildOrderMessageText(
                        activeMessageOrder,
                        'order_confirmed'
                      )
                    );
                  }}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] border text-xs font-semibold cursor-pointer transition-colors ${
                    messageTemplateType === 'order_confirmed'
                      ? 'bg-ink text-surface border-ink'
                      : 'bg-surface text-ink border-border hover:bg-bg'
                  }`}
                >
                  <LocalizedText source={"✅ অর্ডার নিশ্চিতকরণ"} area="admin" />{" "}</button>

                <button
                  type="button"
                  onClick={() => {
                    setMessageTemplateType('advance_reminder');
                    setMessageCustomText(
                      buildOrderMessageText(
                        activeMessageOrder,
                        'advance_reminder'
                      )
                    );
                  }}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] border text-xs font-semibold cursor-pointer transition-colors ${
                    messageTemplateType === 'advance_reminder'
                      ? 'bg-ink text-surface border-ink'
                      : 'bg-surface text-ink border-border hover:bg-bg'
                  }`}
                >
                  <LocalizedText source={"📱 বিকাশ অগ্রিম রিমাইন্ডার"} area="admin" />{" "}</button>
              </div>
            </div>

            {/* Editable Message Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-ink">
                  <LocalizedText source={"মেসেজের বিষয়বস্তু (প্রয়োজনমতো পরিবর্তন বা সাজিয়ে নিতে পারেন):"} area="admin" />{" "}</label>
                <span className="font-mono text-muted text-[10px]">
                  {messageCustomText.length} {" "}<LocalizedText source={"অক্ষর"} area="admin" />{" "}</span>
              </div>
              <textarea
                rows={11}
                value={messageCustomText}
                onChange={(e) => setMessageCustomText(e.target.value)}
                className="w-full p-3 border border-border rounded-[var(--radius-md)] bg-surface text-ink font-sans text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ink"
                placeholder={uiText("মেসেজের টেক্সট লিখুন...", locale)}
              />
            </div>

            {/* Quick Actions Bar */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={messageSending}
                  onClick={() => handleDispatchCustomerMessage('wa_me')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-[var(--radius-sm)] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span><LocalizedText source={"WhatsApp-এ পাঠান"} area="admin" /></span>
                </button>

                <button
                  type="button"
                  disabled={messageSending}
                  onClick={() => handleDispatchCustomerMessage('sms_app')}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-[var(--radius-sm)] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span><LocalizedText source={"SMS অ্যাপে পাঠান"} area="admin" /></span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDispatchCustomerMessage('copy_clipboard')
                  }
                  className="px-3 py-2 bg-surface hover:bg-bg text-ink border border-border font-bold rounded-[var(--radius-sm)] flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  {messageCopied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-600"><LocalizedText source={"কপি হয়েছে!"} area="admin" /></span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span><LocalizedText source={"মেসেজ কপি করুন"} area="admin" /></span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-muted text-center pt-1">
                <LocalizedText source={"মেসেজ পাঠানোর সাথে সাথে সিস্টেম অডিট লগ এবং মেসেজ হিস্টরিতে সময় ও প্রেরকের নাম সংরক্ষিত হবে।"} area="admin" />{" "}</p>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {/* =====================================================================
          3. MANUAL MFS PAYMENT CONFIRMATION SHEET (BKASH / NAGAD / ROCKET)
         ===================================================================== */}
      <ResponsiveSheet
        open={Boolean(trackingDialogOrder)}
        onOpenChange={(open) => {
          if (!open) setTrackingDialogOrder(null);
        }}
        title={uiText(
          "কুরিয়ার হ্যান্ডওভার — ট্র্যাকিং ও কনসাইনমেন্ট রেকর্ড",
          locale
        )}
      >
        {trackingDialogOrder && (
          <div className="space-y-4 text-xs">
            <div className="p-3 border border-border rounded-[var(--radius-md)] bg-surface space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-ink text-sm">
                  {trackingDialogOrder.orderNo}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-ink/10 text-ink">
                  {ORDER_STATUS_LABEL_BN[trackingDialogOrder.status ?? ''] ??
                    trackingDialogOrder.status}
                </span>
              </div>
              <p className="text-muted">
                {trackingDialogOrder.customerName} ·{' '}
                <span className="font-mono">{trackingDialogOrder.customerPhone}</span>
              </p>
              <p className="text-[11px] text-muted">
                <LocalizedText
                  source={
                    "স্বয়ংক্রিয় কুরিয়ার API সংযুক্ত না থাকায় বুকিং স্বয়ংক্রিয়ভাবে হবে না। কুরিয়ার অফিস/পোর্টাল থেকে প্রাপ্ত ট্র্যাকিং কোড এখানে লিখুন — এটিই 'শিপড' করার পূর্বশর্ত।"
                  }
                  area="admin"
                />
              </p>
            </div>

            <Input
              label="কুরিয়ার *"
              value={
                trackingDialogOrder.courierProvider
                  ? String(trackingDialogOrder.courierProvider)
                  : 'steadfast'
              }
              onChange={() => {}}
              disabled
            />

            <Input
              label="ট্র্যাকিং কোড *"
              value={trackingDialogCode}
              onChange={(e) => setTrackingDialogCode(e.target.value.toUpperCase())}
              placeholder={uiText("যেমন: SF-1234-5678", locale)}
              required
            />

            <Input
              label="কনসাইনমেন্ট আইডি (ঐচ্ছিক)"
              value={trackingDialogConsignment}
              onChange={(e) => setTrackingDialogConsignment(e.target.value)}
              placeholder={uiText("কুরিয়ার প্রদত্ত কনসাইনমেন্ট নম্বর", locale)}
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setTrackingDialogOrder(null)}
                className="px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:bg-bg font-semibold text-xs cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={isSavingTracking || trackingDialogCode.trim().length < 3}
                onClick={() => void handleSaveTrackingDialog()}
                className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-ink text-surface hover:opacity-90 font-bold text-xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
              >
                {isSavingTracking ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>ট্র্যাকিং সংরক্ষণ করুন</span>
              </button>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      <ResponsiveSheet
        open={Boolean(mfsModalOrder)}
        onOpenChange={(open) => {
          if (!open) setMfsModalOrder(null);
        }}
        title={uiText("ম্যানুয়াল MFS পেমেন্ট কনফার্মেশন — বিকাশ, নগদ ও রকেট", locale)}
      >
        {mfsModalOrder && (
          <div className="space-y-4 text-xs">
            {/* Order & Customer Summary Strip */}
            <div className="p-3 border border-border rounded-[var(--radius-md)] bg-surface flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ink font-bold text-sm">
                    {mfsModalOrder.orderNo}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-ink/10 text-ink">
                    {mfsModalOrder.status}
                  </span>
                </div>
                <p className="font-mono text-muted text-[11px] mt-0.5">
                  <LocalizedText source={"গ্রাহক:"} area="admin" />{" "}{mfsModalOrder.customerName} ({mfsModalOrder.customerPhone})
                </p>
              </div>

              {/* Amount Breakdown */}
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-[10px] text-muted"><LocalizedText source={"মোট প্রদেয়"} area="admin" /></p>
                  <p className="font-mono font-bold text-ink">
                    {formatPoishaToBdt(mfsModalOrder.totalPayablePoisha ?? 0, locale)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted"><LocalizedText source={"COD সংগৃহীতব্য"} area="admin" /></p>
                  <p className="font-mono font-bold text-ink">
                    {formatPoishaToBdt(mfsModalOrder.codCollectablePoisha ?? 0, locale)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted"><LocalizedText source={"অগ্রিম আবশ্যক/পরিশোধিত"} area="admin" /></p>
                  <p className="font-mono font-bold text-amber-700 dark:text-amber-400">
                    {formatPoishaToBdt(
                      Math.max(0, (mfsModalOrder.totalPayablePoisha ?? 0) - (mfsModalOrder.codCollectablePoisha ?? 0)) ||
                        (mfsModalOrder.advancePaidPoisha ?? 0),
                      locale
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Existing TrxID status if present */}
            {mfsModalOrder.manualPaymentTrxId && (
              <div className="p-3 border border-amber-500/30 rounded-[var(--radius-md)] bg-amber-500/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                    <span className="font-bold text-ink"><LocalizedText source={"বর্তমান TrxID রেকর্ড:"} area="admin" /></span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      mfsModalOrder.paymentStatus === 'paid_verified' || mfsModalOrder.paymentStatus === 'partial_verified'
                        ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-600/20 text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {mfsModalOrder.paymentStatus === 'paid_verified' || mfsModalOrder.paymentStatus === 'partial_verified'
                      ? '✓ ভেরিফাইড'
                      : 'যাচাই বাকি (Pending)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] bg-surface p-2 rounded border border-border">
                  <div>
                    <span className="text-muted block"><LocalizedText source={"মাধ্যম:"} area="admin" /></span>
                    <span className="font-bold uppercase">
                      {mfsModalOrder.paymentMethod === 'nagad_manual'
                        ? 'নগদ (Nagad)'
                        : mfsModalOrder.paymentMethod === 'rocket_manual'
                        ? 'রকেট (Rocket)'
                        : 'বিকাশ (bKash)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Transaction ID:</span>
                    <span className="font-mono font-bold select-all text-ink">
                      {mfsModalOrder.manualPaymentTrxId}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block"><LocalizedText source={"পেমেন্ট মেথড:"} area="admin" /></span>
                    <span className="font-mono text-muted">{mfsModalOrder.paymentMethod}</span>
                  </div>
                </div>

                {mfsModalOrder.paymentStatus !== 'paid_verified' && mfsModalOrder.paymentStatus !== 'partial_verified' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSubmittingMfs}
                      onClick={async () => {
                        setIsSubmittingMfs(true);
                        try {
                          await executeGridAction({
                            orderNos: [mfsModalOrder.orderNo!],
                            actionType: 'verify_bkash',
                          });
                          await executeGridAction({
                            orderNos: [mfsModalOrder.orderNo!],
                            actionType: 'log_call_status',
                            callStatus: 'confirmed_yes',
                          });
                          setMfsModalOrder(null);
                        } finally {
                          setIsSubmittingMfs(false);
                        }
                      }}
                      className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span><LocalizedText source={"বিদ্যমান TrxID ভেরিফাই ও অর্ডার কনফার্ম করুন"} area="admin" /></span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MFS Input Form Card */}
            <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-3.5">
              <h4 className="font-bold text-ink flex items-center gap-1.5 text-xs">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span><LocalizedText source={"MFS লেনদেন তথ্য ইনপুট ও আপডেট"} area="admin" /></span>
              </h4>

              {/* Provider Selection (bKash / Nagad / Rocket) */}
              <div>
                <label className="block text-[11px] font-semibold text-muted mb-1.5">
                  <LocalizedText source={"পেমেন্ট মাধ্যম নির্বাচন করুন *"} area="admin" />{" "}</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setMfsProvider('bkash')}
                    className={`py-2 px-3 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      mfsProvider === 'bkash'
                        ? 'border-pink-600 bg-pink-600/10 text-pink-700 dark:text-pink-400 font-extrabold ring-1 ring-pink-600'
                        : 'border-border bg-surface text-ink hover:bg-surface/80'
                    }`}
                  >
                    <span><LocalizedText source={"বিকাশ (bKash)"} area="admin" /></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMfsProvider('nagad')}
                    className={`py-2 px-3 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      mfsProvider === 'nagad'
                        ? 'border-amber-600 bg-amber-600/10 text-amber-700 dark:text-amber-400 font-extrabold ring-1 ring-amber-600'
                        : 'border-border bg-surface text-ink hover:bg-surface/80'
                    }`}
                  >
                    <span><LocalizedText source={"নগদ (Nagad)"} area="admin" /></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMfsProvider('rocket')}
                    className={`py-2 px-3 rounded-[var(--radius-sm)] border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      mfsProvider === 'rocket'
                        ? 'border-purple-600 bg-purple-600/10 text-purple-700 dark:text-purple-400 font-extrabold ring-1 ring-purple-600'
                        : 'border-border bg-surface text-ink hover:bg-surface/80'
                    }`}
                  >
                    <span><LocalizedText source={"রকেট (Rocket)"} area="admin" /></span>
                  </button>
                </div>
              </div>

              {/* Sender Phone & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="প্রেরকের মোবাইল নম্বর (Sender Phone) *"
                  value={mfsSenderPhone}
                  onChange={(e) => setMfsSenderPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  required
                />
                <div>
                  <Input
                    label="পরিশোধিত পরিমাণ (টাকা / BDT) *"
                    type="number"
                    value={mfsAmountTaka}
                    onChange={(e) => setMfsAmountTaka(e.target.value)}
                    placeholder={uiText("যেমন: 100 বা 170", locale)}
                    required
                  />
                  {/* Preset Amount Badges */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted"><LocalizedText source={"কুইক অ্যামাউন্ট:"} area="admin" /></span>
                    <button
                      type="button"
                      onClick={() => setMfsAmountTaka('100')}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border hover:bg-bg cursor-pointer"
                    >
                      <LocalizedText source={"৳১০০ (ঢাকা ডেলিভারি)"} area="admin" />{" "}</button>
                    <button
                      type="button"
                      onClick={() => setMfsAmountTaka('170')}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border hover:bg-bg cursor-pointer"
                    >
                      <LocalizedText source={"৳১৭০ (ঢাকার বাইরে)"} area="admin" />{" "}</button>
                    {mfsModalOrder && (
                      <button
                        type="button"
                        onClick={() =>
                          setMfsAmountTaka(
                            String(
                              Math.round(
                                (mfsModalOrder.totalPayablePoisha ?? 0) / 100
                              )
                            )
                          )
                        }
                        className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border hover:bg-bg cursor-pointer"
                      >
                        <LocalizedText source={"৳"} area="admin" />{Math.round((mfsModalOrder.totalPayablePoisha ?? 0) / 100)} {" "}<LocalizedText source={"(সম্পূর্ণ বিল)"} area="admin" />{" "}</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Transaction ID */}
              <div>
                <Input
                  label="Transaction ID (TrxID) *"
                  value={mfsTrxId}
                  onChange={(e) => setMfsTrxId(e.target.value.toUpperCase())}
                  placeholder={uiText("যেমন: BLG9X8Y7Z1", locale)}
                  required
                />
                <p className="text-[10px] text-muted mt-1">
                  <LocalizedText source={"গ্রাহকের পাঠানো বিকাশ, নগদ বা রকেট এসএমএস-এর ট্রানজেকশন আইডি প্রবেশ করান।"} area="admin" />{" "}</p>
              </div>

              {/* Staff Note */}
              <Input
                label="অ্যাডমিন নোট (ঐচ্ছিক)"
                value={mfsNoteBn}
                onChange={(e) => setMfsNoteBn(e.target.value)}
                placeholder={uiText("যেমন: গ্রাহক হোয়াটসঅ্যাপে স্ক্রিনশট পাঠিয়েছেন", locale)}
              />

              {/* Auto Verify Checkbox Toggle */}
              <label className="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] border border-border bg-surface cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mfsAutoVerify}
                  onChange={(e) => setMfsAutoVerify(e.target.checked)}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-ink">
                    <LocalizedText source={"ইনপুট করার সাথে সাথে সরাসরি ভেরিফাই ও অনুমোদন করুন"} area="admin" />{" "}</span>
                  <p className="text-[10px] text-muted">
                    <LocalizedText source={"টিক চিহ্ন থাকলে TrxID-টি 'paid_verified' স্ট্যাটাস পাবে এবং জেনারেল লেজারে পোস্টিং হবে। টিক না দিলে শুধু পেন্ডিং হিসেবে সংরক্ষিত থাকবে।"} area="admin" />{" "}</p>
                </div>
              </label>

              {mfsSelfApprovalBlocked && (
                <div className="p-2.5 rounded-[var(--radius-sm)] border border-amber-500/50 bg-amber-500/10 space-y-1.5">
                  <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    মেকার-চেকার ওভাররাইড (সুপার অ্যাডমিন)
                  </p>
                  <Input
                    label="ওভাররাইডের কারণ * (কমপক্ষে ৫ অক্ষর, অডিট লগে যাবে)"
                    value={mfsOverrideReason}
                    onChange={(e) => setMfsOverrideReason(e.target.value)}
                    placeholder={uiText("যেমন: একক অ্যাডমিন শিফটে নিজেই যাচাই করছি, ব্যাংক স্টেটমেন্ট মিলেছে", locale)}
                  />
                  <button
                    type="button"
                    disabled={
                      isSubmittingMfs || mfsOverrideReason.trim().length < 5
                    }
                    onClick={handleSaveMfsSubmission}
                    className="w-full px-3 py-1.5 rounded-[var(--radius-sm)] bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                  >
                    কারণ লিখে অনুমোদন করুন
                  </button>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setMfsModalOrder(null)}
                  className="px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:bg-bg font-semibold text-xs cursor-pointer"
                >
                  <LocalizedText source={"বাতিল"} area="admin" />{" "}</button>
                <button
                  type="button"
                  disabled={isSubmittingMfs}
                  onClick={handleSaveMfsSubmission}
                  className="px-4 py-1.5 rounded-[var(--radius-sm)] bg-ink text-surface hover:opacity-90 font-bold text-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmittingMfs ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span><LocalizedText source={"সংরক্ষণ হচ্ছে..."} area="admin" /></span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{mfsAutoVerify ? 'সংরক্ষণ ও ভেরিফাই' : 'পেন্ডিং হিসেবে সংরক্ষণ'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {/* Admin Notification Drawer */}
      <ResponsiveSheet
        open={isNotificationOpen}
        onOpenChange={setIsNotificationOpen}
        title={locale === 'bn' ? 'অ্যাডমিন নোটিফিকেশন সেন্টার' : 'Admin Notification Center'}
      >
        <div className="space-y-4">
          {/* Header Controls: Filter Dropdown & Mark All Read */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-bg border border-border rounded-[var(--radius-md)] text-xs">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted shrink-0" />
              <select
                value={notificationFilter}
                onChange={(e) =>
                  setNotificationFilter(
                    e.target.value as 'all' | 'vendor_approval' | 'stock_alert' | 'order_alert'
                  )
                }
                className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs focus:outline-none focus:ring-1 focus:ring-ink cursor-pointer"
              >
                <option value="all">
                  {locale === 'bn' ? 'সব নোটিফিকেশন' : 'All Notifications'} ({allNotifications.length})
                </option>
                <option value="vendor_approval">
                  {locale === 'bn' ? 'ভেন্ডর অনুমোদন' : 'Pending Vendor Approvals'}
                </option>
                <option value="stock_alert">
                  {locale === 'bn' ? 'স্টক অ্যালার্ট' : 'Low Stock Alerts'}
                </option>
                <option value="order_alert">
                  {locale === 'bn' ? 'অর্ডার ও এড্রেস অ্যালার্ট' : 'Order & Address Alerts'}
                </option>
              </select>
            </div>

            {unreadNotificationCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllNotificationsAsRead}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-surface hover:bg-bg border border-border text-ink text-xs font-semibold cursor-pointer transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{locale === 'bn' ? 'সব পড়া চিহ্নিত করুন' : 'Mark All Read'}</span>
              </button>
            )}
          </div>

          {/* Notifications List */}
          {filteredNotifications.length === 0 ? (
            <div className="py-12 text-center text-muted text-xs border border-dashed border-border rounded-[var(--radius-md)]">
              <Bell className="w-8 h-8 mx-auto mb-2 text-muted/50" />
              <p>{locale === 'bn' ? 'কোনো নোটিফিকেশন পাওয়া যায়নি' : 'No notifications found'}</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {filteredNotifications.map((n) => {
                const isRead = readNotificationIds.includes(n.id);
                return (
                  <div
                    key={n.id}
                    className={`p-3 rounded-[var(--radius-md)] border transition-all ${
                      isRead
                        ? 'border-border bg-surface/50 opacity-75'
                        : 'border-border bg-surface shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                              n.severity === 'danger'
                                ? 'bg-danger/10 text-danger border border-danger/20'
                                : n.severity === 'warning'
                                ? 'bg-warning/10 text-warning border border-warning/20'
                                : 'bg-info/10 text-info border border-info/20'
                            }`}
                          >
                            {locale === 'bn' ? n.timestamp : n.timestamp}
                          </span>
                          <h4
                            className={`text-xs font-bold ${
                              isRead ? 'text-muted' : 'text-ink'
                            }`}
                          >
                            {locale === 'bn' ? n.titleBn : n.titleEn}
                          </h4>
                        </div>
                        <p className="text-[11px] text-muted leading-relaxed">
                          {locale === 'bn' ? n.descBn : n.descEn}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleReadNotification(n.id)}
                          className="p-1 rounded-[var(--radius-sm)] text-muted hover:text-ink cursor-pointer"
                          title={
                            isRead
                              ? locale === 'bn'
                                ? 'অপঠিত হিসেবে চিহ্নিত করুন'
                                : 'Mark as Unread'
                              : locale === 'bn'
                              ? 'পঠিত হিসেবে চিহ্নিত করুন'
                              : 'Mark as Read'
                          }
                        >
                          <CheckCheck
                            className={`w-4 h-4 ${
                              isRead ? 'text-emerald-600' : 'text-muted/40'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab(n.targetTab);
                            setIsNotificationOpen(false);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] bg-ink text-surface text-[11px] font-semibold hover:opacity-90 cursor-pointer transition-opacity"
                        >
                          <span>{locale === 'bn' ? 'মডিউলে যান' : 'Go to Tab'}</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ResponsiveSheet>

      <OperationalHelpModal
        tabKey={helpModalTab}
        locale={locale}
        onClose={() => setHelpModalTab(null)}
      />
    </div>
  );
}
