'use client';
import { AccountSecurity } from '@/components/security/account-security';
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
  LayoutDashboard,
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
  ChevronDown,
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
  Activity,
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
import type {
  Courier360ProviderSummary,
  CourierClaimRecord,
  CourierRemittanceLedgerRecord,
  DistrictRateOverrideRecord,
  ImmutableVendorLedgerRecord,
  ManualCourierAccountsSummary,
  ManualCourierParcelRecord,
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
import { CrmContactsPanel } from './crm-contacts-panel';
import { MessagingHubPanel, type MessagingHubSubTab } from './messaging-hub-panel';
import { SyncHealthPanel } from './sync-health-panel';
import { Courier360AndRatesPanel } from './courier-and-escrow-panel';
import { VendorsHubPanel, type VendorsHubSubTab } from './vendors-hub-panel';
import {
  VendorPayoutsLedgerPanel,
  type PayoutsLedgerSubTab,
} from './vendor-payouts-ledger-panel';
import type { AdminPayoutStatus } from '@/lib/vendor/vendor-types';
import {
  FinanceProduct360AndExpensesPanel,
  SuperAdminControlCenterPanel,
} from './phase4c-panels';
import { Phase5ReadinessPanel } from './phase5-readiness-panel';
import type {
  ConsignmentLifecycleDryRunDTO,
  Phase5AuditReportDTO,
  RoleSanitizationInspectionDTO,
} from '@/lib/admin/phase5-service';
import type { Phase6WorkspaceOverviewDTO } from '@/lib/admin/phase6-service';
import type { Phase7WorkspaceOverviewDTO } from '@/lib/admin/phase7-service';
import { ProductManagementStudioPanel } from './product-studio-panel';
import { OperationalHelpModal } from './operational-help-modal';
import { AdminNotificationCenter } from './admin-notification-center';
import { DASHBOARD_STATUSES, summarizeDashboardOrders } from './dashboard-summary';
// The dashboard pulls in the chart/animation layer, which the storefront never needs, so it is
// split into its own chunk and requested only when an admin actually lands on it.
const AdminCommandDashboard = React.lazy(() =>
  import('./admin-command-dashboard').then((module) => ({ default: module.AdminCommandDashboard })),
);
import { CourierBulkCsvPanel } from './courier-bulk-csv-panel';
import {
  OrderDispatchSheet,
  type DispatchSheetMode,
  type DispatchSubmitPayload,
} from './order-dispatch-sheet';
import { OrdersGridMinimal } from './orders-grid-minimal';
import { OrderDetailsSheet } from './order-details-sheet';
import { OrderPrintPreviewSheet } from './order-print-preview-sheet';
import {
  filterOrdersMinimal,
  mapStatusToStage,
  type OrderQueueFilter,
  type OrderStageTab,
  type PendingMfsSubmissionLike,
} from '@/lib/admin/order-management';
import { resolveCourierGeoForAddress } from '@/lib/geo/bd-courier-geo';

export interface AdminErpClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
}

export type AdminTabKey =
  | 'dashboard'
  | 'today_screen'
  | 'orders_grid'
  | 'smart_order_entry'
  | 'print_engine'
  | 'courier_360'
  | 'vendors_hub'
  | 'vendor_payouts'
  | 'product_studio'
  | 'finance_product360'
  | 'crm_contacts'
  | 'messaging_hub'
  | 'sync_health'
  | 'control_center'
  | 'users_and_rbac'
  | 'phase5_readiness';

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
  manualPaymentSubmissions?: PendingMfsSubmissionLike[];
  csrfToken?: string;
  emergencyStopActive?: boolean;
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
    missingCourierInfoCount?: number;
  };
  printConfig?: PrintTemplateConfig;
  districtRates?: DistrictRateOverrideRecord[];
  courier360?: Courier360ProviderSummary[];
  manualCourierParcels?: ManualCourierParcelRecord[];
  courierAccountsSummary?: ManualCourierAccountsSummary | null;
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
  vendorSupportTickets?: Array<{
    ticketId: string;
    vendorId: string;
    vendorCode: string;
    vendorNameBn: string;
    subject: string;
    status: 'open' | 'closed';
    lastSender: 'vendor' | 'admin';
    messageCount: number;
    updatedAt: string;
  }>;
  pendingVendorRequests?: Array<{
    requestId: string;
    vendorId: string;
    vendorCode: string;
    vendorNameBn: string;
    kind: string;
    summaryBn?: string;
    createdAt: string;
  }>;
  pendingVendorKycDocs?: Array<{
    documentId: string;
    vendorId: string;
    vendorCode: string;
    vendorNameBn: string;
    category: string;
    createdAt: string;
  }>;
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

/** Customer-facing order status uses a secret, expiring token, not a sequential order number. */
function getOrderStatusUrl(order: Partial<OrderGridRowDTO>): string {
  const token = order.secureTrackingToken?.trim();
  if (!token || !/^trk_[a-zA-Z0-9]+$/.test(token) || typeof window === 'undefined' ||
      (order.trackingTokenExpiresAt && Date.parse(order.trackingTokenExpiresAt) <= Date.now())) return '';
  return `${window.location.origin}/order-tracking/${encodeURIComponent(token)}`;
}

// Each existing page has exactly one home in the navigation; role filtering still
// happens on the original items, not on these presentation groups.
const ADMIN_NAV_GROUPS: Array<{ id: string; bn: string; en: string; keys: AdminTabKey[] }> = [
  { id: 'overview', bn: 'ওভারভিউ', en: 'Overview', keys: ['dashboard', 'today_screen'] },
  { id: 'orders', bn: 'অর্ডার ও ডেলিভারি', en: 'Orders & Delivery', keys: ['orders_grid', 'smart_order_entry', 'courier_360', 'print_engine'] },
  { id: 'catalog', bn: 'পণ্য ও ক্যাটালগ', en: 'Products & Catalog', keys: ['product_studio'] },
  { id: 'vendors', bn: 'ভেন্ডর ও পেআউট', en: 'Vendors & Payouts', keys: ['vendors_hub', 'vendor_payouts'] },
  { id: 'finance', bn: 'ফাইন্যান্স', en: 'Finance', keys: ['finance_product360'] },
  { id: 'operations', bn: 'সিআরএম, মেসেজিং ও সিঙ্ক', en: 'CRM, Messaging & Sync', keys: ['crm_contacts', 'messaging_hub', 'sync_health'] },
  { id: 'settings', bn: 'সিস্টেম ও নিরাপত্তা', en: 'System & Security', keys: ['phase5_readiness', 'users_and_rbac', 'control_center'] },
];

export function AdminErpClient({ siteSettings: publicSettings }: AdminErpClientProps) {
  const locale = useLocaleStore((s) => s.adminLocale);
  const toggleLocale = useLocaleStore((s) => s.toggleAdminLocale);
  React.useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  // Strict Authentication & First-Login Gate State
  const [isCheckingSession, setIsCheckingSession] = React.useState(true);
  const [workspaceLoadFailed, setWorkspaceLoadFailed] = React.useState(false);
  const [snapshot, setSnapshot] =
    React.useState<WorkspaceSnapshotResponse | null>(null);
  const [snapshotLoadedAt, setSnapshotLoadedAt] = React.useState<Date | null>(null);
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
  const [activeTab, setActiveTab] = React.useState<AdminTabKey>('dashboard');
  const [vendorsHubSubTab, setVendorsHubSubTab] = React.useState<VendorsHubSubTab>('directory');
  const [focusedVendorId, setFocusedVendorId] = React.useState<string | null>(null);
  const [vendorsStatusFilter, setVendorsStatusFilter] = React.useState<
    'all' | 'active' | 'pending_onboarding' | 'suspended'
  >('all');
  const [payoutsSubTab, setPayoutsSubTab] = React.useState<PayoutsLedgerSubTab>('register');
  const [payoutsVendorFilter, setPayoutsVendorFilter] = React.useState<string | null>(null);
  const [payoutsStatusFilter, setPayoutsStatusFilter] = React.useState<'all' | AdminPayoutStatus>('all');
  const [payoutsOpenCreateMode, setPayoutsOpenCreateMode] = React.useState<'request' | 'direct' | null>(null);
  const [messagingSubTab, setMessagingSubTab] = React.useState<MessagingHubSubTab>('customer');
  const [focusedInquiryId, setFocusedInquiryId] = React.useState<string | null>(null);
  const [openNavGroups, setOpenNavGroups] = React.useState<string[]>(['overview']);
  React.useEffect(() => {
    const group = ADMIN_NAV_GROUPS.find((entry) => entry.keys.includes(activeTab));
    if (group) setOpenNavGroups((open) => open.includes(group.id) ? open : [...open, group.id]);
  }, [activeTab]);
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

  // Track top sticky preview banner height so sticky sidebar and top bar never clip below the viewport
  const [previewBannerHeight, setPreviewBannerHeight] = React.useState(0);
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const measureBanner = () => {
      const banner = document.querySelector('body > [role="status"]') as HTMLElement | null;
      const height = banner ? Math.ceil(banner.getBoundingClientRect().height) : 0;
      setPreviewBannerHeight(height);
      document.documentElement.style.setProperty('--preview-banner-h', `${height}px`);
    };
    measureBanner();
    window.addEventListener('resize', measureBanner);
    return () => {
      window.removeEventListener('resize', measureBanner);
      document.documentElement.style.removeProperty('--preview-banner-h');
    };
  }, []);

  // Track in-flight order actions to prevent duplicate double-click submissions
  const [pendingActionOrderNos, setPendingActionOrderNos] = React.useState<string[]>([]);

  // Admin Notification System State
  const [isNotificationOpen, setIsNotificationOpen] = React.useState(false);
  const [notificationFilter, setNotificationFilter] = React.useState<
    'all' | 'vendor_approval' | 'stock_alert' | 'order_alert'
  >('all');
  const [readNotificationIds, setReadNotificationIds] = React.useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.sessionStorage.getItem('bg_admin_read_notifications');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        'bg_admin_read_notifications',
        JSON.stringify(readNotificationIds)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [readNotificationIds]);

  const allNotifications = React.useMemo(() => {
    if (!snapshot) return [];
    const list: Array<{
      id: string;
      type: 'vendor_approval' | 'stock_alert' | 'order_alert' | 'address_alert';
      titleBn: string;
      titleEn: string;
      descBn: string;
      descEn: string;
      timestampBn: string;
      timestampEn: string;
      targetTab: AdminTabKey;
      targetQueue?: string;
      severity: 'info' | 'warning' | 'danger';
    }> = [];

    // 1. Vendor Approvals, Payouts, Stock Lots, Proposals, KYC, Reversals & Support
    if (snapshot.vendorEscrow?.vendors) {
      for (const v of snapshot.vendorEscrow.vendors) {
        if (v.profile.status === 'pending_onboarding') {
          list.push({
            id: `vendor-appr-${v.profile.vendorId}`,
            type: 'vendor_approval',
            titleBn: `ভেন্ডর অনবোর্ডিং অনুমোদন: ${v.profile.businessNameBn}`,
            titleEn: `Vendor Onboarding Approval: ${v.profile.businessNameEn}`,
            descBn: `মালিক: ${v.profile.ownerNameBn} (${v.profile.vendorCode}) — অ্যাক্টিভেশনের অপেক্ষায়`,
            descEn: `Owner: ${v.profile.ownerNameBn} (${v.profile.vendorCode}) — awaiting activation`,
            timestampBn: 'অনবোর্ডিং',
            timestampEn: 'Onboarding',
            targetTab: 'vendors_hub',
            targetQueue: `VENDORS_ONBOARDING:${v.profile.vendorId}`,
            severity: 'warning',
          });
        }
      }
    }

    if (snapshot.vendorEscrow?.payoutRequests) {
      for (const pr of snapshot.vendorEscrow.payoutRequests) {
        if (pr.status === 'requested') {
          list.push({
            id: `vendor-payout-req-${pr.payoutId}`,
            type: 'vendor_approval',
            titleBn: `পেআউট অনুরোধ: ${pr.vendorNameBn} (${formatPoishaToBdt(pr.requestedAmountPoisha, 'bn')})`,
            titleEn: `Payout Request: ${pr.vendorNameBn} (${formatPoishaToBdt(pr.requestedAmountPoisha, 'en')})`,
            descBn: `${pr.payoutMethodBn} · অ্যাকাউন্ট: ${pr.payoutAccountNo} — অনুমোদনের অপেক্ষায়`,
            descEn: `${pr.payoutMethodBn} · Account: ${pr.payoutAccountNo} — awaiting approval`,
            timestampBn: 'পেআউট অনুরোধ',
            timestampEn: 'Payout Request',
            targetTab: 'vendor_payouts',
            targetQueue: `PAYOUTS_REQUESTED:${pr.vendorId}`,
            severity: 'warning',
          });
        } else if (pr.status === 'approved') {
          list.push({
            id: `vendor-payout-appr-${pr.payoutId}`,
            type: 'vendor_approval',
            titleBn: `পেআউট পরিশোধ বাকি: ${pr.vendorNameBn} (${formatPoishaToBdt(pr.requestedAmountPoisha, 'bn')})`,
            titleEn: `Approved Payout Awaiting Transfer: ${pr.vendorNameBn} (${formatPoishaToBdt(pr.requestedAmountPoisha, 'en')})`,
            descBn: `${pr.payoutMethodBn} · ${pr.payoutAccountNo} — টাকা পাঠিয়ে TrxID দিন`,
            descEn: `${pr.payoutMethodBn} · ${pr.payoutAccountNo} — send transfer & record TrxID`,
            timestampBn: 'পরিশোধ বাকি',
            timestampEn: 'Ready to Pay',
            targetTab: 'vendor_payouts',
            targetQueue: `PAYOUTS_APPROVED:${pr.vendorId}`,
            severity: 'info',
          });
        }
      }
    }

    if (snapshot.pendingVendorRequests) {
      for (const req of snapshot.pendingVendorRequests) {
        const kindBn =
          req.kind === 'onboarding_update'
            ? 'অনবোর্ডিং তথ্য পরিবর্তনের অনুরোধ'
            : 'প্রোফাইল বা পেআউট তথ্য পরিবর্তনের অনুরোধ';
        const kindEn =
          req.kind === 'onboarding_update'
            ? 'Onboarding information update request'
            : 'Profile or payout details update request';
        list.push({
          id: `vendor-req-${req.requestId}`,
          type: 'vendor_approval',
          titleBn: `ভেন্ডর প্রোফাইল অনুরোধ: ${req.vendorNameBn} (${req.vendorCode})`,
          titleEn: `Vendor Profile Request: ${req.vendorNameBn} (${req.vendorCode})`,
          descBn: req.summaryBn ?? kindBn,
          descEn: req.summaryBn ?? kindEn,
          timestampBn: 'প্রোফাইল অনুরোধ',
          timestampEn: 'Profile Request',
          targetTab: 'vendors_hub',
          targetQueue: 'VENDORS_APPROVALS',
          severity: 'warning',
        });
      }
    }

    if (snapshot.pendingVendorKycDocs) {
      for (const doc of snapshot.pendingVendorKycDocs) {
        list.push({
          id: `vendor-kyc-${doc.documentId}`,
          type: 'vendor_approval',
          titleBn: `ভেন্ডর KYC যাচাই: ${doc.vendorNameBn} (${doc.vendorCode})`,
          titleEn: `Vendor KYC Verification: ${doc.vendorNameBn} (${doc.vendorCode})`,
          descBn: `ডকুমেন্ট (${doc.category}) রিভিউয়ের অপেক্ষায় রয়েছে।`,
          descEn: `Document (${doc.category}) awaiting admin verification.`,
          timestampBn: 'KYC পেন্ডিং',
          timestampEn: 'KYC Pending',
          targetTab: 'vendors_hub',
          targetQueue: 'VENDORS_APPROVALS',
          severity: 'warning',
        });
      }
    }

    if (snapshot.phase7Overview?.consignmentLots) {
      for (const lot of snapshot.phase7Overview.consignmentLots) {
        if (lot.status === 'pending_qc') {
          list.push({
            id: `vendor-lot-${lot.lotId}`,
            type: 'vendor_approval',
            titleBn: `স্টক চালান QC বাকি: ${lot.vendorNameBn} (${lot.challanRef})`,
            titleEn: `Stock Lot QC Pending: ${lot.vendorNameBn} (${lot.challanRef})`,
            descBn: `${lot.productNameBn} — ${lot.dispatchedQty} পিস গুদামে যাচাইয়ের অপেক্ষায়`,
            descEn: `${lot.productNameBn} — ${lot.dispatchedQty} pcs awaiting warehouse QC`,
            timestampBn: 'চালান QC',
            timestampEn: 'Lot QC',
            targetTab: 'vendors_hub',
            targetQueue: 'VENDORS_APPROVALS',
            severity: 'warning',
          });
        }
      }
    }

    if (snapshot.phase7Overview?.priceProposals) {
      for (const prop of snapshot.phase7Overview.priceProposals) {
        if (prop.status === 'pending_review') {
          list.push({
            id: `vendor-price-${prop.proposalId}`,
            type: 'vendor_approval',
            titleBn: `মূল্য পরিবর্তন প্রস্তাব: ${prop.vendorNameBn} (${prop.publicSku})`,
            titleEn: `Price Change Proposal: ${prop.vendorNameBn} (${prop.publicSku})`,
            descBn: `${prop.productNameBn} — প্রস্তাবিত বিক্রয়মূল্য ${formatPoishaToBdt(prop.proposedSalePricePoisha, 'bn')}`,
            descEn: `${prop.productNameBn} — proposed sale price ${formatPoishaToBdt(prop.proposedSalePricePoisha, 'en')}`,
            timestampBn: 'মূল্য প্রস্তাব',
            timestampEn: 'Price Proposal',
            targetTab: 'vendors_hub',
            targetQueue: 'VENDORS_APPROVALS',
            severity: 'warning',
          });
        }
      }
    }

    if (snapshot.phase7Overview?.ledgerReversals) {
      for (const rev of snapshot.phase7Overview.ledgerReversals) {
        if (rev.status === 'pending_checker_approval') {
          list.push({
            id: `vendor-rev-${rev.reversalId}`,
            type: 'vendor_approval',
            titleBn: `লেজার রিভার্সাল চেকার অনুমোদন: ${rev.reversalCode}`,
            titleEn: `Ledger Reversal Approval: ${rev.reversalCode}`,
            descBn: `${rev.reasonBn} — মেকার @${rev.createdByUsername}`,
            descEn: `${rev.reasonBn} — maker @${rev.createdByUsername}`,
            timestampBn: 'রিভার্সাল',
            timestampEn: 'Reversal',
            targetTab: 'vendor_payouts',
            targetQueue: 'PAYOUTS_LEDGER',
            severity: 'danger',
          });
        }
      }
    }

    if (snapshot.vendorSupportTickets) {
      for (const st of snapshot.vendorSupportTickets) {
        if (st.status === 'open') {
          list.push({
            id: `vendor-support-${st.ticketId}-${st.messageCount}`,
            type: 'vendor_approval',
            titleBn: `ভেন্ডর সাপোর্ট টিকিট: ${st.vendorNameBn} (${st.vendorCode})`,
            titleEn: `Vendor Support Ticket: ${st.vendorNameBn} (${st.vendorCode})`,
            descBn: `${st.subject} · (${st.lastSender === 'vendor' ? 'ভেন্ডরের নতুন বার্তা' : 'খোলা টিকিট'})`,
            descEn: `${st.subject} · (${st.lastSender === 'vendor' ? 'New vendor message' : 'Open ticket'})`,
            timestampBn: st.lastSender === 'vendor' ? 'উত্তর দিন' : 'খোলা',
            timestampEn: st.lastSender === 'vendor' ? 'Reply Needed' : 'Open',
            targetTab: 'messaging_hub',
            targetQueue: 'VENDOR_SUPPORT_INBOX',
            severity: st.lastSender === 'vendor' ? 'warning' : 'info',
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
                timestampBn: 'জরুরি',
                timestampEn: 'Urgent',
                targetTab: 'product_studio',
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
        timestampBn: 'লাইভ কিউ',
        timestampEn: 'Live Queue',
        targetTab: 'orders_grid',
        targetQueue: 'CALL_TO_CONFIRM',
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
        timestampBn: 'লাইভ কিউ',
        timestampEn: 'Live Queue',
        targetTab: 'orders_grid',
        targetQueue: 'FIX_ADDRESS',
        severity: 'warning',
      });
    }

    // 5. Manual bKash TrxID Verification Queue
    if (snapshot.todayQueues?.verifyBkashCount && snapshot.todayQueues.verifyBkashCount > 0) {
      list.push({
        id: 'ord-verify-bkash-queue',
        type: 'order_alert',
        titleBn: `বিকাশ TrxID যাচাই বাকি: ${snapshot.todayQueues.verifyBkashCount} টি অর্ডার`,
        titleEn: `bKash TrxID Verification Pending: ${snapshot.todayQueues.verifyBkashCount} orders`,
        descBn: `ম্যানুয়াল বিকাশ পেমেন্ট দাবির TrxID যাচাই করুন।`,
        descEn: `Verify manual bKash payment claims against merchant statements.`,
        timestampBn: 'লাইভ কিউ',
        timestampEn: 'Live Queue',
        targetTab: 'orders_grid',
        targetQueue: 'VERIFY_BKASH_TRX',
        severity: 'warning',
      });
    }

    // 6. Unread Customer Inquiries Alert
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
          timestampBn: 'নতুন বার্তা',
          timestampEn: 'New Inquiry',
          targetTab: 'messaging_hub',
          targetQueue: `CUSTOMER_INQUIRY:${inq.id}`,
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
  const [stageFilter, setStageFilter] = React.useState<OrderStageTab>('all');
  const [queueFilter, setQueueFilter] = React.useState<OrderQueueFilter>('ALL');
  const [showBulkCsvModal, setShowBulkCsvModal] = React.useState(false);
  const [selectedOrderNos, setSelectedOrderNos] = React.useState<string[]>([]);
  const [detailsSheetState, setDetailsSheetState] = React.useState<{
    orderNo: string;
    initialFocus?: 'top' | 'payment' | 'courier';
  } | null>(null);
  const [printPreviewOrderNo, setPrintPreviewOrderNo] = React.useState<string | null>(null);

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

  // Smart Order Entry State
  const [smartPhone, setSmartPhone] = React.useState('');
  const [smartName, setSmartName] = React.useState('');
  const [smartSource, setSmartSource] = React.useState<OrderSource>('facebook');
  const [smartDistrictId, setSmartDistrictId] = React.useState<number>(47);
  const [smartUpazilaId, setSmartUpazilaId] = React.useState<number>(365);
  const [smartPostCode, setSmartPostCode] = React.useState<string>('1209');
  const [smartRecipientCity, setSmartRecipientCity] = React.useState<string>('Dhaka');
  const [smartRecipientZone, setSmartRecipientZone] = React.useState<string>('Dhanmondi');
  const [smartRecipientArea, setSmartRecipientArea] = React.useState<string>('');
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
    savedProfile?: {
      customerName?: string;
      districtId: number;
      upazilaId: number;
      postCode: string;
      recipientCity: string;
      recipientZone: string;
      recipientArea?: string;
      streetAddress: string;
      landmark?: string;
    } | null;
  } | null>(null);
  const [smartSubmitting, setSmartSubmitting] = React.useState(false);

  // User & RBAC Creation State
  const [newUsername, setNewUsername] = React.useState('');
  const [newDisplayNameBn, setNewDisplayNameBn] = React.useState('');
  const [newRoleSlug, setNewRoleSlug] =
    React.useState<SystemRoleSlug>('marketing_manager');
  const [newVendorId, setNewVendorId] = React.useState('');
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
        if (data.csrfToken) window.sessionStorage.setItem('bg_admin_csrf_token', data.csrfToken);
        setSnapshot(data);
        setSnapshotLoadedAt(new Date());
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
          if (data.csrfToken) window.sessionStorage.setItem('bg_admin_csrf_token', data.csrfToken);
          setSnapshot(data);
          setSnapshotLoadedAt(new Date());
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

  // Unified Courier Dispatch & Tracking Sheet (used for Ship, Out for Delivery review, and Edit)
  const [dispatchDialogState, setDispatchDialogState] = React.useState<{
    order: (typeof orders)[number];
    mode: DispatchSheetMode;
  } | null>(null);
  const [isSavingTracking, setIsSavingTracking] = React.useState(false);

  const openDispatchSheet = (
    ord: (typeof orders)[number],
    mode: DispatchSheetMode = 'edit'
  ) => {
    setDispatchDialogState({ order: ord, mode });
  };

  const handleSubmitDispatch = async (
    payload: DispatchSubmitPayload
  ): Promise<boolean> => {
    setIsSavingTracking(true);
    try {
      return await executeGridAction({
        orderNos: [payload.orderNo],
        actionType: 'attach_tracking',
        courierProvider: payload.courierProvider,
        customCourierName: payload.customCourierName,
        trackingCode: payload.trackingCode,
        consignmentId: payload.consignmentId ?? '',
        customTrackingUrl: payload.customTrackingUrl,
        advanceToStatus: payload.advanceToStatus,
      });
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
    customCourierName?: string | null;
    customTrackingUrl?: string | null;
    advanceToStatus?: 'shipped' | 'out_for_delivery';
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
  }): Promise<boolean> => {
    setActionFeedback(null);
    setPendingActionOrderNos((prev) =>
      Array.from(new Set([...prev, ...payload.orderNos]))
    );
    try {
      // The workspace POST enforces the signed session's CSRF token; without it
      // every grid action (confirm, verify bKash, status bulk update) is refused
      // with a 403 before it ever reaches the domain service.
      const csrfToken = window.sessionStorage.getItem('bg_admin_csrf_token');
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
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

      const allRowResultsOk =
        !data.results || data.results.every((r) => r.ok !== false);
      const isSuccess = Boolean(res.ok && data.success && allRowResultsOk);

      const summaryText =
        data.results?.map((r) => `${r.orderNo}: ${r.messageBn}`).join(' | ') ??
        data.errorBn ??
        'অ্যাকশন সম্পন্ন হয়েছে।';

      setActionFeedback({
        type: isSuccess ? 'success' : 'error',
        text: summaryText,
      });
      await fetchWorkspace();
      return isSuccess;
    } catch {
      setActionFeedback({
        type: 'error',
        text: locale === 'bn' ? 'সার্ভারে যোগাযোগ করা যায়নি।' : 'Unable to reach server.',
      });
      return false;
    } finally {
      setPendingActionOrderNos((prev) =>
        prev.filter((no) => !payload.orderNos.includes(no))
      );
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
      const raw = (typeof value === 'string' ? value : JSON.stringify(value ?? '')).replace(
        /\r\n|\r|\n/g,
        ' '
      );
      let idx = 0;
      while (idx < raw.length && (raw.charCodeAt(idx) <= 0x20 || raw.charCodeAt(idx) === 0x7f)) {
        idx += 1;
      }
      const lead = raw.charAt(idx);
      const text =
        lead === '=' || lead === '+' || lead === '-' || lead === '@' || lead === '|'
          ? `'${raw}`
          : raw;
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
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const openOrderDetailsSheet = (
    ord: EnrichedOrderRow,
    initialFocus: 'top' | 'payment' | 'courier' = 'top'
  ) => {
    if (!ord.orderNo) return;
    setDetailsSheetState({ orderNo: ord.orderNo, initialFocus });
  };

  const buildOrderMessageText = (
    ord: EnrichedOrderRow,
    type: 'tracking_link' | 'order_confirmed' | 'delivered' | 'advance_reminder'
  ) => {
    const bn = locale === 'bn';
    const name = ord.customerName || (bn ? 'সম্মানিত গ্রাহক' : 'Valued customer');
    const brand = (bn ? siteSettings.brandNameBn : siteSettings.brandNameEn) || 'Panchabindu';
    const number = ord.orderNo || '—';
    const total = typeof ord.totalPayablePoisha === 'number' ? formatPoishaToBdt(ord.totalPayablePoisha, locale) : '—';
    const due = typeof ord.codCollectablePoisha === 'number' ? formatPoishaToBdt(ord.codCollectablePoisha, locale) : '—';
    const statusUrl = getOrderStatusUrl(ord);
    const items = ord.items?.map(i => `• ${i.productNameBn} (${i.variantTitleBn}) × ${i.quantity}`).join('\n');
    const greeting = bn ? `প্রিয় ${name},` : `Dear ${name},`;
    let subject: string;
    if (type === 'tracking_link') subject = bn ? 'আপনার অর্ডারের বর্তমান অবস্থা দেখুন।' : 'Please check the current status of your order.';
    else if (type === 'delivered') subject = bn ? 'আপনার অর্ডার সম্পর্কে আমাদের সঙ্গে যোগাযোগ করার জন্য ধন্যবাদ।' : 'Thank you for your order.';
    else if (type === 'advance_reminder') subject = bn ? 'আপনার অর্ডারের পেমেন্ট বিষয়ে আমাদের সঙ্গে যোগাযোগ করুন।' : 'Please contact us regarding payment for your order.';
    else subject = bn ? 'আপনার অর্ডারের তথ্য নিচে দেওয়া হলো।' : 'Your order details are below.';
    const lines = [greeting, '', subject, `${bn ? 'অর্ডার নম্বর' : 'Order number'}: ${number}`];
    if (items) lines.push(`${bn ? 'পণ্য' : 'Items'}:\n${items}`);
    lines.push(`${bn ? 'মোট' : 'Total'}: ${total}`, `${bn ? 'বকেয়া' : 'Outstanding'}: ${due}`);
    if (statusUrl) lines.push(`${bn ? 'অর্ডার স্ট্যাটাস' : 'Order status'}: ${statusUrl}`);
    else if (type === 'tracking_link') lines.push(bn ? 'নিরাপদ স্ট্যাটাস লিংক বর্তমানে পাওয়া যাচ্ছে না।' : 'A secure status link is currently unavailable.');
    if (siteSettings.supportPhone) lines.push(`${bn ? 'সহায়তা' : 'Support'}: ${siteSettings.supportPhone}`);
    lines.push('', bn ? 'ধন্যবাদান্তে,' : 'Kind regards,', brand);
    return lines.join('\n');
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

  const handleDispatchCustomerMessage = async (channel: 'wa_me' | 'sms_app' | 'copy_clipboard') => {
    const text = messageCustomText.trim();
    if (!text) { setActionFeedback({ type: 'error', text: locale === 'bn' ? 'প্রথমে মেসেজ লিখুন।' : 'Enter a message first.' }); return; }
    if (channel === 'copy_clipboard') {
      try {
        await navigator.clipboard.writeText(text);
        setMessageCopied(true);
        setTimeout(() => setMessageCopied(false), 3000);
        setActionFeedback({ type: 'success', text: locale === 'bn' ? 'মেসেজ কপি হয়েছে; পাঠানো হয়নি।' : 'Message copied; it has not been sent.' });
      } catch { setActionFeedback({ type: 'error', text: locale === 'bn' ? 'কপি করা যায়নি; লেখা নির্বাচন করে কপি করুন।' : 'Copy failed; select and copy the text manually.' }); }
      return;
    }
    const phone = normalizeBdPhone(activeMessageOrder?.customerPhone ?? '');
    if (!phone) { setActionFeedback({ type: 'error', text: locale === 'bn' ? 'সঠিক গ্রাহক মোবাইল নম্বর প্রয়োজন।' : 'A valid customer mobile number is required.' }); return; }
    if (channel === 'wa_me') {
      // Open synchronously in the click gesture: awaiting an API request here is blocked as a popup.
      window.open(`https://wa.me/88${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = `sms:${phone}?body=${encodeURIComponent(text)}`;
    }
    setActionFeedback({ type: 'success', text: locale === 'bn' ? 'মেসেজ অ্যাপ খোলার অনুরোধ করা হয়েছে। সেখানে পাঠানো নিশ্চিত করুন।' : 'Requested the messaging app. Confirm sending there.' });
  };

  const handleOpenMfsModal = (ord: EnrichedOrderRow) => {
    openOrderDetailsSheet(ord, 'payment');
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
        const prof = data.history.savedProfile;
        if (prof) {
          if (prof.customerName && !smartName.trim()) {
            setSmartName(prof.customerName);
          }
          if (prof.districtId) setSmartDistrictId(prof.districtId);
          if (prof.upazilaId) setSmartUpazilaId(prof.upazilaId);
          if (prof.postCode) setSmartPostCode(prof.postCode);
          if (prof.recipientCity) setSmartRecipientCity(prof.recipientCity);
          if (prof.recipientZone) setSmartRecipientZone(prof.recipientZone);
          if (prof.recipientArea) setSmartRecipientArea(prof.recipientArea);
          if (prof.streetAddress && !smartStreet.trim()) {
            setSmartStreet(prof.streetAddress);
          }
          if (prof.landmark && !smartLandmark.trim()) {
            setSmartLandmark(prof.landmark);
          }
        }
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
  const activeDetailsOrder = detailsSheetState
    ? orders.find((o) => o.orderNo === detailsSheetState.orderNo) ?? null
    : null;
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

  const dashboard = summarizeDashboardOrders(orders);
  const lowStock = products.flatMap(prod => (prod.variants ?? [])
    .filter(v => v.stockAvailable <= (prod.lowStockThreshold ?? 5))
    .map(variant => ({ prod, variant })))
    .sort((a, b) => a.variant.stockAvailable - b.variant.stockAvailable);
  const openOrderStatus = (status: string) => {
    setOrderSearch('');
    setQueueFilter('ALL');
    setStageFilter(status === 'ALL' ? 'all' : mapStatusToStage(status));
    setSelectedOrderNos([]);
    setActiveTab('orders_grid');
  };
  const openOrderQueue = (action: string) => {
    setOrderSearch('');
    setStageFilter('all');
    setQueueFilter((action as OrderQueueFilter) || 'ALL');
    setSelectedOrderNos([]);
    setActiveTab('orders_grid');
  };

  // Filtered Orders for Minimalist Orders Management
  const filteredOrders = filterOrdersMinimal(orders, {
    stage: stageFilter,
    queueFilter,
    search: orderSearch,
  });

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
  const smartBaseRates = getDistrictDeliveryRates(
    smartDistrict.id,
    siteSettings.bdPostDefaultPerKgPoisha
  );
  const smartOverride =
    snapshot?.districtRates?.find((r) => r.districtId === smartDistrict.id) ??
    siteSettings.districtRateOverrides?.[smartDistrict.id];
  const smartRates = {
    base1KgPoisha: smartOverride?.base1KgPoisha ?? smartBaseRates.base1KgPoisha,
    extraPerKgPoisha:
      smartOverride?.extraPerKgPoisha ?? smartBaseRates.extraPerKgPoisha,
    bdPostPerKgPoisha:
      smartOverride?.bdPostPerKgPoisha ?? smartBaseRates.bdPostPerKgPoisha,
    isFreeDeliveryDistrict: Boolean(smartOverride?.isFreeDeliveryDistrict),
  };

  const smartLineSubtotalPoisha =
    (selectedSmartPair?.variant.salePricePoisha ?? 0) * smartQuantity;
  const smartLineWeightGrams =
    (selectedSmartPair?.variant.weightGrams ?? 500) * smartQuantity;

  const smartDeliveryCalc = calculateDeliveryCharge({
    method: smartDeliveryMethod,
    totalWeightGrams: smartLineWeightGrams,
    orderSubtotalPoisha: smartLineSubtotalPoisha,
    freeDeliveryThresholdPoisha: siteSettings.freeDeliveryThresholdPoisha,
    isGlobalFreeDelivery:
      siteSettings.globalFreeDelivery || smartRates.isFreeDeliveryDistrict,
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
          // The dashboard is the money view; work queues stay on the Today screen below so the two
          // pages never show the same tiles twice.
          key: 'dashboard',
          labelBn: 'টাকার হিসাব',
          labelEn: 'Money',
          fullLabelBn: 'কোম্পানির আর্থিক ড্যাশবোর্ড',
          fullLabelEn: 'Company Money Dashboard',
          icon: <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />,
        },
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
      groupLabelBn: '০৪. ভেন্ডর ও পেআউট',
      groupLabelEn: '04. Vendors & Payouts',
      items: [
        {
          key: 'vendors_hub',
          labelBn: 'ভেন্ডরসমূহ',
          labelEn: 'Vendors',
          fullLabelBn: 'ভেন্ডর ডাইরেক্টরি, প্রোফাইল ও অনুমোদন',
          fullLabelEn: 'Vendors, Profiles & Approvals',
          icon: <Store className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
          badge: (() => {
            const pendingOnboarding = (snapshot.vendorEscrow?.vendors ?? []).filter(
              (v) => v.profile.status === 'pending_onboarding'
            ).length;
            const pendingLots = (snapshot.phase7Overview?.consignmentLots ?? []).filter(
              (l) => l.status === 'pending_qc'
            ).length;
            const pendingProposals = (snapshot.phase7Overview?.priceProposals ?? []).filter(
              (p) => p.status === 'pending_review'
            ).length;
            const pendingReqs = (snapshot.pendingVendorRequests ?? []).length;
            const pendingKyc = (snapshot.pendingVendorKycDocs ?? []).length;
            const totalPending =
              pendingOnboarding + pendingLots + pendingProposals + pendingReqs + pendingKyc;
            return totalPending > 0 ? totalPending : snapshot.vendors?.length || undefined;
          })(),
          badgeStatus: (() => {
            const pendingCount =
              (snapshot.vendorEscrow?.vendors ?? []).filter(
                (v) => v.profile.status === 'pending_onboarding'
              ).length +
              (snapshot.phase7Overview?.consignmentLots ?? []).filter(
                (l) => l.status === 'pending_qc'
              ).length +
              (snapshot.phase7Overview?.priceProposals ?? []).filter(
                (p) => p.status === 'pending_review'
              ).length +
              (snapshot.pendingVendorRequests ?? []).length +
              (snapshot.pendingVendorKycDocs ?? []).length;
            return pendingCount > 0 ? 'warning' : 'neutral';
          })(),
        },
        {
          key: 'vendor_payouts',
          labelBn: 'পেআউট ও লেজার',
          labelEn: 'Payouts & Ledger',
          fullLabelBn: 'ভেন্ডর পেআউট রেজিস্টার ও এসক্রো লেজার',
          fullLabelEn: 'Vendor Payouts & Escrow Ledger',
          icon: <Banknote className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin && !snapshot.vendorEscrow,
          badge: (() => {
            const pendingPayouts = (snapshot.vendorEscrow?.payoutRequests ?? []).filter(
              (p) => p.status === 'requested' || p.status === 'approved'
            ).length;
            const pendingReversals = (snapshot.phase7Overview?.ledgerReversals ?? []).filter(
              (r) => r.status === 'pending_checker_approval'
            ).length;
            const total = pendingPayouts + pendingReversals;
            return total > 0 ? total : undefined;
          })(),
          badgeStatus: 'warning',
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
      groupLabelBn: '০৮. সিআরএম, মেসেজিং ও সিঙ্ক',
      groupLabelEn: '08. CRM, Messaging & Sync',
      items: [
        {
          key: 'crm_contacts',
          labelBn: 'সিআরএম ও কন্টাক্টস',
          labelEn: 'CRM & Contacts',
          fullLabelBn: 'সিআরএম, কন্টাক্ট ডিরেক্টরি, কার্ট রিকভারি ও ব্ল্যাকলিস্ট',
          fullLabelEn: 'CRM, Contacts Directory, Cart Recovery & Blacklist',
          icon: <Users className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
          badge: snapshot.phase6Overview
            ? snapshot.phase6Overview.abandonedCarts.filter((c) => !c.isRecovered).length || undefined
            : undefined,
          badgeStatus: 'warning',
        },
        {
          key: 'messaging_hub',
          labelBn: 'মেসেজিং',
          labelEn: 'Messaging',
          fullLabelBn: 'কাস্টমার ইনবক্স, ভেন্ডর ইনবক্স ও টেমপ্লেট',
          fullLabelEn: 'Customer Inbox, Vendor Inbox & Templates',
          icon: <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: isVendor,
          badge: (() => {
            const unreadInq = (snapshot.inquiries ?? []).filter((i) => i.status === 'unread').length;
            const openVendor = (snapshot.vendorSupportTickets ?? []).filter((st) => st.status === 'open').length;
            const total = unreadInq + (isSuperAdmin ? openVendor : 0);
            return total > 0 ? total : undefined;
          })(),
          badgeStatus: 'warning',
        },
        {
          key: 'sync_health',
          labelBn: 'সিঙ্ক ও হেলথ',
          labelEn: 'Sync & Health',
          fullLabelBn: 'Google Sheets সিঙ্ক ও লাইভ কানেকশন হেলথ',
          fullLabelEn: 'Google Sheets Sync & Live Connectivity Health',
          icon: <Activity className="w-4 h-4 shrink-0" aria-hidden="true" />,
          hidden: !isSuperAdmin,
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

  const stickyOffsetStyle = {
    '--preview-banner-h': `${previewBannerHeight}px`,
  } as React.CSSProperties;

  return (
    <div
      style={stickyOffsetStyle}
      className="min-h-[calc(100dvh-var(--preview-banner-h,0px))] flex bg-bg text-ink pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0"
    >
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

      {/* Admin ERP Side Navigation Panel — editorial rail */}
      <aside
        aria-label={locale === 'bn' ? 'অ্যাডমিন নেভিগেশন' : 'Admin navigation'}
        className={`fixed lg:sticky top-0 lg:top-[var(--preview-banner-h,0px)] left-0 z-50 flex h-[100dvh] shrink-0 flex-col border-r border-border bg-surface transition-[width,transform] duration-200 ease-out motion-reduce:transition-none lg:h-[calc(100dvh-var(--preview-banner-h,0px))] w-[min(17rem,86vw)] ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${isSidebarCollapsed ? 'lg:w-[4.75rem]' : 'lg:w-[17rem]'}`}
      >
        {/* Brand zone — brand tile + account chip share one block and one hairline. */}
        <div className="shrink-0 border-b border-border/70">
          <div className="flex h-14 items-center justify-between gap-2 px-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-ink text-sm font-bold text-bg">
                <LocalizedText source={"প"} area="admin" />{" "}
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-tight tracking-tight text-ink">
                    {brandName}
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    <LocalizedText source={"Panchabindu ERP"} area="admin" />{" "}
                  </p>
                </div>
              )}
            </div>

            {/* Collapse / Close Buttons */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden lg:flex min-w-11 min-h-11 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-bg hover:text-ink cursor-pointer"
                title={isSidebarCollapsed ? 'সাইডবার প্রসারিত করুন' : 'সাইডবার সংকুচিত করুন'}
                aria-label={isSidebarCollapsed ? (locale === 'bn' ? 'সাইডবার প্রসারিত করুন' : 'Expand sidebar') : (locale === 'bn' ? 'সাইডবার সংকুচিত করুন' : 'Collapse sidebar')}
              >
                {isSidebarCollapsed ? (
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="lg:hidden w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-muted cursor-pointer hover:bg-bg hover:text-ink"
                aria-label={locale === 'bn' ? 'মেনু বন্ধ করুন' : 'Close menu'}
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Account chip — quiet, lives in the same block as the brand */}
          <div className={isSidebarCollapsed ? 'px-2 pb-3 lg:px-2' : 'px-3 pb-3'}>
            <div className={`flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border/70 bg-bg/60 px-2.5 py-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] font-bold text-ink">
                {currentUser.username.slice(0, 2).toUpperCase()}
              </span>
              {!isSidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink">
                    @{currentUser.username}
                  </p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    {currentUser.roleSlug}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grouped navigation; collapsed desktop mode retains direct icon links. */}
        <nav aria-label={uiText("Admin ERP Sidebar", locale)} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 text-xs font-medium">
          {ADMIN_NAV_GROUPS.map((group, groupIndex) => {
            const allItems = NAV_SECTIONS.flatMap((section) => section.items);
            const visibleItems = group.keys.map((key) => allItems.find((item) => item.key === key)).filter((item): item is (typeof allItems)[number] => Boolean(item && !item.hidden));
            if (visibleItems.length === 0) return null;
            const isOpen = openNavGroups.includes(group.id);
            const hasActive = visibleItems.some((item) => item.key === activeTab);
            const groupName = locale === 'bn' ? group.bn : group.en;
            return (
              <div
                key={group.id}
                data-nav-group={group.id}
                className={isSidebarCollapsed && groupIndex > 0 ? 'mt-1 border-t border-border/60 pt-1' : ''}
              >
                {!isSidebarCollapsed && (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`admin-nav-${group.id}`}
                    onClick={() => setOpenNavGroups((open) => isOpen ? open.filter((id) => id !== group.id) : [...open, group.id])}
                    className={`sticky top-0 z-10 -mx-2 flex w-[calc(100%+1rem)] min-h-9 items-center gap-2 bg-surface px-3 pb-1.5 pt-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${hasActive ? 'text-ink' : 'text-muted'}`}
                  >
                    <span className="tabular-nums opacity-60">{String(groupIndex + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate">{groupName}</span>
                    {hasActive && !isOpen && <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />}
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                )}
                <div id={`admin-nav-${group.id}`} hidden={!isSidebarCollapsed && !isOpen} className={isSidebarCollapsed ? 'space-y-0.5' : 'mt-0.5 space-y-0.5'}>
                  {visibleItems.map((item) => {
                    const isActive = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => { setActiveTab(item.key); setIsMobileSidebarOpen(false); }}
                        title={locale === 'bn' ? item.labelBn : item.labelEn}
                        aria-current={isActive ? 'page' : undefined}
                        className={`relative w-full min-h-11 flex items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                          isActive
                            ? 'border-border bg-bg font-bold text-ink'
                            : 'border-transparent text-ink/90 hover:border-border/70 hover:bg-bg/60 hover:text-ink'
                        } ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between'}`}
                      >
                        {isActive && (
                          <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-ink" />
                        )}
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className={isActive ? 'text-ink' : 'text-muted'}>
                            {item.icon}
                          </span>
                          {!isSidebarCollapsed && <span className="min-w-0 break-words">{locale === 'bn' ? item.labelBn : item.labelEn}</span>}
                        </span>
                        {!isSidebarCollapsed && item.badge !== undefined && (
                          <span className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums ${isActive ? 'bg-ink text-bg' : 'border border-border bg-bg text-muted'}`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer — storefront + locale share one quiet row */}
        <div className="shrink-0 border-t border-border/70 px-2 py-2">
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-1.5">
              <Link
                href="/"
                className="inline-flex flex-1 min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium text-muted transition-colors hover:bg-bg hover:text-ink"
              >
                <Store className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{locale === 'bn' ? 'স্টোরফ্রন্ট' : 'Store'}</span>
                <ArrowUpRight className="ml-auto w-3 h-3 opacity-60" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={toggleLocale}
                title={locale === 'bn' ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
                className="min-w-11 min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-border/70 bg-bg px-2 font-mono text-[11px] font-bold text-muted transition-colors hover:border-ink hover:text-ink cursor-pointer"
              >
                <span aria-hidden="true">{locale === 'bn' ? 'EN' : 'বাং'}</span>
                <span className="sr-only">{locale === 'bn' ? 'Switch to English (EN)' : 'বাংলায় পরিবর্তন করুন (বাং)'}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Link
                href="/"
                title={uiText("স্টোরফ্রন্ট", locale)}
                aria-label={locale === 'bn' ? 'স্টোরফ্রন্ট' : 'Store'}
                className="w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-bg hover:text-ink"
              >
                <Store className="w-4 h-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={toggleLocale}
                title={locale === 'bn' ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
                className="w-11 h-11 flex items-center justify-center rounded-[var(--radius-sm)] border border-border/70 bg-bg text-xs font-mono font-bold text-muted hover:border-ink hover:text-ink cursor-pointer"
              >
                <span aria-hidden="true">{locale === 'bn' ? 'EN' : 'বাং'}</span>
                <span className="sr-only">
                  {locale === 'bn' ? 'Switch to English (EN)' : 'বাংলায় পরিবর্তন করুন (বাং)'}
                </span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Workspace Layout */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Top Bar for Workspace Status, Title & Quick Actions */}
        <header className="sticky top-[var(--preview-banner-h,0px)] z-40 border-b border-border bg-bg/95 backdrop-blur-xs px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIsSidebarCollapsed(false);
                setIsMobileSidebarOpen(true);
              }}
              className="lg:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface text-ink cursor-pointer"
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
                className="min-w-11 min-h-11 -m-1.5 flex items-center justify-center shrink-0 cursor-pointer group"
                title={locale === 'bn' ? 'মডিউল কার্যপ্রণালী গাইড (!)' : 'Module Help Guide (!)'}
                aria-label={uiText("Module Help Guide", locale)}
              >
                <span className="w-6 h-6 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  !
                </span>
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
              className="flex items-center text-xs font-semibold border border-border rounded-full px-1.5 py-1 bg-surface min-h-11 transition-colors cursor-pointer"
              title={locale === 'bn' ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
            >
              <span className="sr-only">
                {locale === 'bn' ? 'Switch admin language to English:' : 'অ্যাডমিন ভাষা বাংলায় পরিবর্তন করুন:'}{' '}
              </span>
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

            <AdminNotificationCenter
              locale={locale}
              notifications={allNotifications}
              onOpenNotification={(n) => {
                if (n.targetQueue === 'VENDOR_SUPPORT_INBOX') {
                  setMessagingSubTab('vendor');
                  setActiveTab('messaging_hub');
                } else if (n.targetQueue === 'VENDORS_APPROVALS') {
                  setVendorsHubSubTab('approvals');
                  setFocusedVendorId(null);
                  setActiveTab('vendors_hub');
                } else if (n.targetQueue?.startsWith('VENDORS_ONBOARDING:')) {
                  const vid = n.targetQueue.slice('VENDORS_ONBOARDING:'.length);
                  setVendorsStatusFilter('pending_onboarding');
                  setVendorsHubSubTab('directory');
                  setFocusedVendorId(vid || null);
                  setActiveTab('vendors_hub');
                } else if (n.targetQueue?.startsWith('PAYOUTS_REQUESTED:')) {
                  const vid = n.targetQueue.slice('PAYOUTS_REQUESTED:'.length);
                  setPayoutsSubTab('register');
                  setPayoutsVendorFilter(vid || null);
                  setPayoutsStatusFilter('requested');
                  setActiveTab('vendor_payouts');
                } else if (n.targetQueue?.startsWith('PAYOUTS_APPROVED:')) {
                  const vid = n.targetQueue.slice('PAYOUTS_APPROVED:'.length);
                  setPayoutsSubTab('register');
                  setPayoutsVendorFilter(vid || null);
                  setPayoutsStatusFilter('approved');
                  setActiveTab('vendor_payouts');
                } else if (n.targetQueue === 'PAYOUTS_LEDGER') {
                  setPayoutsSubTab('ledger');
                  setActiveTab('vendor_payouts');
                } else if (n.targetQueue?.startsWith('CUSTOMER_INQUIRY:')) {
                  setFocusedInquiryId(n.targetQueue.slice('CUSTOMER_INQUIRY:'.length));
                  setMessagingSubTab('customer');
                  setActiveTab('messaging_hub');
                } else if (n.targetQueue) {
                  openOrderQueue(n.targetQueue);
                } else {
                  setActiveTab(n.targetTab as AdminTabKey);
                }
              }}
              onRefresh={() => void fetchWorkspace()}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchWorkspace()}
              aria-label={locale === 'bn' ? 'রিফ্রেশ' : 'Refresh'}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              <span className="hidden sm:inline">{locale === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
            </Button>
            {typeof window !== 'undefined' &&
              window.sessionStorage.getItem('bg_admin_csrf_token') !== 'bypass-csrf-token' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLogout}
                  aria-label={locale === 'bn' ? 'লগআউট' : 'Logout'}
                  leftIcon={<LogOut className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  <span className="hidden sm:inline">{locale === 'bn' ? 'লগআউট' : 'Logout'}</span>
                </Button>
              )}
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
        {activeTab === 'control_center' && isSuperAdmin && <section className="border border-border rounded-[var(--radius-md)] bg-surface p-4 space-y-2" aria-label={locale === 'bn' ? 'জরুরি নিয়ন্ত্রণ' : 'Emergency control'}>
          <h2 className="font-bold text-sm">{locale === 'bn' ? 'জরুরি কার্যক্রম নিয়ন্ত্রণ' : 'Emergency operations control'}</h2>
          <p className="text-xs">{snapshot.emergencyStopActive ? (locale === 'bn' ? 'জরুরি বন্ধ চালু: নতুন ব্যবসায়িক কার্যক্রম বন্ধ আছে।' : 'Emergency stop is active: new business operations are blocked.') : (locale === 'bn' ? 'জরুরি বন্ধ চালু করলে নতুন ব্যবসায়িক কার্যক্রম বন্ধ হবে; লগইন ও পুনরুদ্ধার চালু থাকবে।' : 'Activating emergency stop blocks new business operations; sign-in and recovery remain available.')}</p>
          <Button variant="outline" size="sm" onClick={async () => {
            const active = !snapshot.emergencyStopActive;
            if (!window.confirm(active ? (locale === 'bn' ? 'নতুন ব্যবসায়িক কাজ বন্ধ করবেন?' : 'Stop new business operations?') : (locale === 'bn' ? 'ব্যবসায়িক কাজ পুনরায় চালু করবেন?' : 'Resume business operations?'))) return;
            const reason = window.prompt(locale === 'bn' ? 'কারণ লিখুন (অন্তত ৫ অক্ষর; ব্যক্তিগত তথ্য নয়)' : 'Enter a reason (at least 5 characters; no personal data)')?.trim();
            if (!reason || reason.length < 5) { setActionFeedback({ type: 'error', text: locale === 'bn' ? 'অন্তত ৫ অক্ষরের কারণ প্রয়োজন।' : 'A reason of at least 5 characters is required.' }); return; }
            try {
              const res = await fetch('/api/admin/emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active, reason }) });
              const data = await res.json() as { success?: boolean; errorBn?: string; errorEn?: string };
              if (!res.ok || !data.success) { setActionFeedback({ type: 'error', text: (locale === 'bn' ? data.errorBn : data.errorEn) || (locale === 'bn' ? 'পরিবর্তন করা যায়নি।' : 'Unable to change emergency status.') }); return; }
              await fetchWorkspace();
              setActionFeedback({ type: 'success', text: active ? (locale === 'bn' ? 'জরুরি বন্ধ চালু হয়েছে।' : 'Emergency stop activated.') : (locale === 'bn' ? 'কার্যক্রম পুনরায় চালু হয়েছে।' : 'Operations resumed.') });
            } catch { setActionFeedback({ type: 'error', text: locale === 'bn' ? 'নেটওয়ার্ক সমস্যা হয়েছে।' : 'Network error.' }); }
          }}>{snapshot.emergencyStopActive ? (locale === 'bn' ? 'কার্যক্রম পুনরায় চালু করুন' : 'Resume operations') : (locale === 'bn' ? 'জরুরি বন্ধ চালু করুন' : 'Activate emergency stop')}</Button>
        </section>}
        {snapshot.emergencyStopActive && activeTab !== 'control_center' && (
          <div role="alert" className="border border-danger bg-surface rounded-[var(--radius-md)] p-3 text-sm text-danger">
            {locale === 'bn' ? 'জরুরি বন্ধ চালু: নতুন ব্যবসায়িক কার্যক্রম বন্ধ আছে।' : 'Emergency stop is active: new business operations are blocked.'}
            {isSuperAdmin && <button type="button" className="ml-3 underline" onClick={() => setActiveTab('control_center')}>{locale === 'bn' ? 'কন্ট্রোল সেন্টার' : 'Control Center'}</button>}
          </div>
        )}
        {/* Keep security state mounted while navigating so one-time recovery codes are not lost. */}
        <div hidden={activeTab !== 'users_and_rbac'}>
          <AccountSecurity locale={locale} csrfKey="bg_admin_csrf_token" />
        </div>
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
        {activeTab === 'users_and_rbac' && <div className="p-3 border border-border rounded-[var(--radius-md)] bg-surface flex flex-wrap items-center justify-between gap-2 text-xs">
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

        }

        {/* ==================================================================
            TAB 1: TODAY OPERATIONAL COMMAND SCREEN (MODULE M)
           ================================================================== */}
        {activeTab === 'dashboard' && (
          <React.Suspense
            fallback={
              <div className="space-y-3" aria-busy="true" aria-live="polite">
                <div className="h-36 animate-pulse rounded-[var(--radius-md)] bg-surface" />
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-surface" />
                  ))}
                </div>
                <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-surface" />
              </div>
            }
          >
          <AdminCommandDashboard
            locale={locale}
            snapshot={snapshot}
            loadedAt={snapshotLoadedAt}
            isSuperAdmin={isSuperAdmin}
            isVendor={isVendor}
            onRefresh={fetchWorkspace}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenOrderStatus={openOrderStatus}
            onOpenOrderQueue={openOrderQueue}
          />
          </React.Suspense>
        )}

        {activeTab === 'today_screen' && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h1 className="text-xl font-bold text-ink">
                  {locale === 'bn' ? 'আজকের কাজ' : "Today's work"}
                </h1>
                <p className="text-xs text-muted">
                  {locale === 'bn'
                    ? 'আজকের করণীয়: কল কনফার্ম, ঠিকানা সংশোধন, বিকাশ যাচাই, প্যাকিং ও কুরিয়ার বুকিং — এখানেই।'
                    : "Today's action queues: calls, address fixes, bKash checks, packing and courier booking live here."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[11px] font-semibold text-ink transition-colors hover:border-ink cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                {locale === 'bn' ? 'টাকার হিসাব দেখুন' : 'View the money'}
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <Card surface="surface" padding="md" className="space-y-3" >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h2 className="font-bold text-base">{locale === 'bn' ? 'অর্ডারের সারসংক্ষেপ' : 'Order overview'}</h2>
                  <p className="text-xs text-muted">{locale === 'bn' ? 'সব সময়ের দৃশ্যমান অর্ডার; স্ট্যাটাসে ক্লিক করলে ফিল্টার হবে।' : 'All visible orders, all time. Select a status to filter the order grid.'}</p>
                </div>
                <div className="text-xs text-muted">
                  <span>{locale === 'bn' ? 'মোট অর্ডার: ' : 'Total orders: '}{formatLocaleNumber(dashboard.total, locale)}</span>
                  {snapshotLoadedAt && <p>{locale === 'bn' ? 'তথ্য নেওয়া হয়েছে: ' : 'Data loaded: '}{snapshotLoadedAt.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" aria-label={locale === 'bn' ? 'অর্ডার স্ট্যাটাসের সারসংক্ষেপ' : 'Order status overview'}>
                {DASHBOARD_STATUSES.map(item => <button key={item.key} type="button" onClick={() => openOrderStatus(item.key)} className="min-h-[72px] text-left p-3 rounded-[var(--radius-md)] border border-border bg-bg hover:border-ink focus-visible:outline-2 focus-visible:outline-ink">
                  <span className="block text-xs text-muted">{locale === 'bn' ? item.bn : item.en}</span>
                  <span className="block text-xl font-bold tabular-nums">{formatLocaleNumber(dashboard.statusCounts[item.key] ?? 0, locale)}</span>
                </button>)}
              </div>
            </Card>
            <div role="note" className="rounded-[var(--radius-md)] border border-border bg-surface p-3 text-xs text-muted space-y-1">
              <p>{locale === 'bn' ? 'কুরিয়ার বুকিং ও লাইভ ট্র্যাকিং সংযুক্ত নয়; রেমিট্যান্স ও পুরোনো রিটার্ন নিষ্পত্তি বন্ধ।' : 'Courier booking and live tracking are not connected; remittance and legacy return settlement are unavailable.'}</p>
              {isSuperAdmin && <p>{locale === 'bn' ? `ম্যানুয়াল পেমেন্ট যাচাই অপেক্ষায়: ${formatLocaleNumber((snapshot.manualPaymentSubmissions ?? []).filter(s => s.status === 'pending_verification' || s.status === 'under_review').length, locale)}টি দাবি। এগুলো প্রাপ্ত টাকা হিসেবে গণ্য নয়।` : `Manual payment claims awaiting verification: ${formatLocaleNumber((snapshot.manualPaymentSubmissions ?? []).filter(s => s.status === 'pending_verification' || s.status === 'under_review').length, locale)}. Claims are not received funds.`}</p>}
            </div>

            {isSuperAdmin && <section className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label={locale === 'bn' ? 'প্রশাসনিক করণীয়' : 'Administrative follow-up'}>
              <button
                type="button"
                onClick={() => {
                  setMessagingSubTab('customer');
                  setActiveTab('messaging_hub');
                }}
                className="min-h-[72px] p-3 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer"
              >
                <span className="block text-xs text-muted">{locale === 'bn' ? 'অপঠিত গ্রাহক বার্তা' : 'Unread customer inquiries'}</span>
                <span className="font-bold text-xl">{formatLocaleNumber((snapshot.inquiries ?? []).filter(i => i.status === 'unread').length, locale)}</span>
              </button>
              <button type="button" onClick={() => setActiveTab('vendor_payouts')} className="min-h-[72px] p-3 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer">
                <span className="block text-xs text-muted">{locale === 'bn' ? 'পেআউট অনুরোধ ও অনুমোদন (পরিশোধ নয়)' : 'Requested or approved payouts (not paid)'}</span>
                <span className="font-bold text-xl">{formatLocaleNumber((snapshot.vendorEscrow?.payoutRequests ?? []).filter(p => p.status === 'requested' || p.status === 'approved').length, locale)}</span>
              </button>
            </section>}

            {/* 6 Operational Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <button
                type="button"
                onClick={() => {
                  openOrderQueue('CALL_TO_CONFIRM');
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
                  openOrderQueue('FIX_ADDRESS');
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
                  openOrderQueue('VERIFY_BKASH_TRX');
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
                  openOrderQueue('READY_TO_PACK');
                }}
                className="p-3.5 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
              >
                <p className="text-xs text-muted">{locale === 'bn' ? 'প্যাকিংয়ের জন্য প্রস্তুত' : 'Ready to Pack'}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-info">
                  {formatLocaleNumber(today.readyToPackCount, locale)}
                </p>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    openOrderQueue('READY_TO_BOOK_COURIER');
                  }}
                  className="w-full h-full p-3.5 pr-9 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
                >
                  <p className="text-xs text-muted">
                    {locale === 'bn' ? 'কুরিয়ার বুকিং বাকি' : 'Book Courier'}
                  </p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-ink">
                    {formatLocaleNumber(today.readyToBookCourierCount, locale)}
                  </p>
                </button>
                <InfoTooltip
                  termKey="cod_receivable"
                  locale={locale}
                  className="absolute top-3.5 right-3.5 z-10"
                />
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('product_studio');
                  }}
                  className="w-full h-full p-3.5 pr-9 text-left border border-border rounded-[var(--radius-md)] bg-bg hover:border-ink cursor-pointer space-y-1"
                >
                  <p className="text-xs text-muted">
                    {locale === 'bn' ? 'লো-স্টক ভ্যারিয়েন্ট' : 'Low Stock Alert'}
                  </p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-danger">
                    {formatLocaleNumber(today.lowStockVariantsCount, locale)}
                  </p>
                </button>
                <InfoTooltip
                  termKey="available_stock"
                  locale={locale}
                  className="absolute top-3.5 right-3.5 z-10"
                />
              </div>
            </div>

            {/* Financial & Technical Glossary Strip with ⓘ Tooltips (Section 7.4) */}
            <Card surface="surface" padding="sm" className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-ink">
                  {locale === 'bn'
                    ? 'কনসাইনমেন্ট ফিন্যান্সিয়াল ও অপারেশনাল টার্ম গাইড (ⓘ ক্লিক বা হোভার করুন):'
                    : 'Consignment Finance & Operational Glossary (Click or hover ⓘ):'}
                </p>
                <span className="text-[11px] font-mono text-muted">
                  {locale === 'bn' ? 'হিসাবের তথ্য সমন্বয় ও যাচাই সাপেক্ষ' : 'Accounting figures require reconciliation'}{" "}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'সাপ্লায়ার প্রদেয় (Supplier Payable)' : 'Supplier Payable'}</span>
                  <InfoTooltip termKey="supplier_payable" locale={locale} />
                </span>
                {!isVendor && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                    <span>{locale === 'bn' ? 'প্ল্যাটফর্ম মার্জিন (Platform Margin)' : 'Platform Margin'}</span>
                    <InfoTooltip termKey="platform_margin" locale={locale} />
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'এসক্রো হোল্ডিং (Escrow Holding)' : 'Escrow Holding'}</span>
                  <InfoTooltip termKey="escrow_holding" locale={locale} />
                </span>
                {!isVendor && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                    <span>{locale === 'bn' ? 'সিওডি প্রাপ্য (COD Receivable)' : 'COD Receivable'}</span>
                    <InfoTooltip termKey="cod_receivable" locale={locale} />
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'সমন্বয় (Reconciliation)' : 'Reconciliation'}</span>
                  <InfoTooltip termKey="reconciliation" locale={locale} />
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'সংরক্ষিত স্টক (Reservation)' : 'Stock Reservation'}</span>
                  <InfoTooltip termKey="stock_reservation" locale={locale} />
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <span>{locale === 'bn' ? 'পেআউট অপেক্ষমাণ (Settlement)' : 'Settlement Pending'}</span>
                  <InfoTooltip termKey="settlement_pending" locale={locale} />
                </span>
                {!isVendor && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                    <span>{locale === 'bn' ? 'ফ্রড ঝুঁকি (Fraud Risk)' : 'Fraud Risk'}</span>
                    <InfoTooltip termKey="fraud_risk" locale={locale} />
                  </span>
                )}
              </div>
            </Card>

            {/* Immediate Action Queue Rows */}
            <Card surface="bg" padding="md" className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-base font-bold text-ink">
                  {locale === 'bn'
                    ? 'করণীয় অর্ডার (সর্বশেষ ৮টি)'
                    : 'Orders needing attention (latest 8)'}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openOrderStatus('ALL')}
                >
                  {locale === 'bn' ? `সব অর্ডার দেখুন (${formatLocaleNumber(orders.length, locale)})` : `View All Orders (${formatLocaleNumber(orders.length, locale)})`}
                </Button>
              </div>

              <div className="divide-y divide-border border border-border rounded-[var(--radius-md)]">
                {dashboard.actionable.length === 0 && <p className="p-4 text-sm text-muted">{locale === 'bn' ? 'এই মুহূর্তে কোনো করণীয় অর্ডার নেই।' : 'No orders currently need attention.'}</p>}
                {dashboard.actionable.slice(0, 8).map((ord) => {
                  const badgeMeta =
                    NEXT_ACTION_LABELS[ord.nextBestAction ?? 'COMPLETED'];
                  const isOrderBusy = pendingActionOrderNos.includes(ord.orderNo ?? '');
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
                              aria-disabled={isOrderBusy}
                              onClick={(e) => {
                                if (isOrderBusy) {
                                  e.preventDefault();
                                  return;
                                }
                                void executeGridAction({
                                  orderNos: [ord.orderNo!],
                                  actionType: 'log_call_attempt',
                                });
                              }}
                              className={`inline-flex items-center gap-1.5 min-h-11 px-3 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink font-medium ${
                                isOrderBusy ? 'opacity-50 pointer-events-none' : ''
                              }`}
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
                              className="inline-flex items-center gap-1.5 min-h-11 px-3 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink font-medium"
                            >
                              <MessageSquare
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                              <span><LocalizedText source={"wa.me"} area="admin" /></span>
                            </a>
                          </>
                        )}

                        {ord.nextBestAction === 'VERIFY_BKASH_TRX' && !isVendor && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isOrderBusy}
                            onClick={() => openOrderQueue('VERIFY_BKASH_TRX')}
                          >
                            {locale === 'bn' ? 'যাচাইয়ের কিউ দেখুন' : 'Review verification queue'}
                          </Button>
                        )}

                        {ord.status === 'pending_confirmation' && !isVendor && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isOrderBusy}
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
                            disabled={isOrderBusy}
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
                          !isVendor && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isOrderBusy}
                              onClick={() => openDispatchSheet(ord, 'ship')}
                            >
                              {locale === 'bn' ? 'কুরিয়ার ও শিপ' : 'Courier & Ship'}
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
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <p>{locale === 'bn' ? `কম স্টকের ${formatLocaleNumber(lowStock.length, locale)}টি ভ্যারিয়েন্ট; সর্বোচ্চ ৮টি দেখানো হচ্ছে।` : `${formatLocaleNumber(lowStock.length, locale)} low-stock variants; showing up to 8.`}</p>
                <Button variant="outline" size="sm" onClick={() => setActiveTab('product_studio')}>{locale === 'bn' ? 'পণ্য দেখুন' : 'View products'}</Button>
              </div>
              {lowStock.length === 0 ? <p className="text-sm text-muted">{locale === 'bn' ? 'কম স্টকের কোনো ভ্যারিয়েন্ট নেই।' : 'No low-stock variants.'}</p> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {lowStock.slice(0, 8).map(({ prod, variant: v }) => <div key={v.variantId} className="p-3 border border-border rounded-[var(--radius-md)] bg-surface space-y-1">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-muted">{v.publicSku}</span><Badge status="warning">{locale === 'bn' ? 'স্টক' : 'Stock'}: {formatLocaleNumber(v.stockAvailable, locale)}</Badge></div>
                  <p className="font-bold text-ink truncate">{locale === 'bn' ? prod.nameBn : prod.nameEn}</p>
                  <p className="text-muted">{locale === 'bn' ? v.titleBn : v.titleEn}</p>
                </div>)}
              </div>}

            </Card>
          </section>
        )}

        {/* ==================================================================
            TAB 2: ORDERS MANAGEMENT (MINIMALIST)
           ================================================================== */}
        {activeTab === 'orders_grid' && (
          <OrdersGridMinimal
            orders={orders}
            filteredOrders={filteredOrders}
            manualPaymentSubmissions={snapshot?.manualPaymentSubmissions ?? []}
            locale={locale}
            isVendor={isVendor}
            isSuperAdmin={isSuperAdmin}
            stageFilter={stageFilter}
            onStageFilterChange={setStageFilter}
            queueFilter={queueFilter}
            onQueueFilterChange={setQueueFilter}
            searchQuery={orderSearch}
            onSearchQueryChange={setOrderSearch}
            selectedOrderNos={selectedOrderNos}
            onSelectedOrderNosChange={setSelectedOrderNos}
            pendingActionOrderNos={pendingActionOrderNos}
            trackingSyncAvailable={trackingSyncAvailable}
            isSyncingTracking={isSyncingTracking}
            onSyncTracking={() => void handleSyncCourierTracking()}
            onExportOrders={handleExportOrders}
            onOpenBulkCsv={() => setShowBulkCsvModal(true)}
            onNewOrder={() => setActiveTab('smart_order_entry')}
            onUpdateStatus={(orderNos, newStatus) =>
              void executeGridAction({
                orderNos,
                actionType: 'update_status',
                newStatus,
              })
            }
            onLogCall={(orderNo) =>
              void executeGridAction({
                orderNos: [orderNo],
                actionType: 'log_call_attempt',
              })
            }
            onOpenDispatch={(ord, mode) => openDispatchSheet(ord, mode)}
            onOpenMfs={(ord) => handleOpenMfsModal(ord)}
            onOpenMessage={(ord) => handleOpenMessageStudio(ord)}
            onOpenPrint={(orderNo) => setPrintPreviewOrderNo(orderNo)}
            onOpenDetails={(ord) => openOrderDetailsSheet(ord, 'top')}
          />
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
                        postCode: smartPostCode.trim() || undefined,
                        recipientCity: smartRecipientCity.trim() || undefined,
                        recipientZone: smartRecipientZone.trim() || undefined,
                        recipientArea: smartRecipientArea.trim() || undefined,
                        totalWeightGrams: smartLineWeightGrams,
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

                {/* 64-District -> Upazila Cascade + Auto-Synced PostCode & Pathao Zone */}
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
                        const uId = firstU ? firstU.id : smartUpazilaId;
                        if (firstU) setSmartUpazilaId(firstU.id);
                        const geo = resolveCourierGeoForAddress({
                          districtId: dId,
                          upazilaId: uId,
                          streetAddress: smartStreet,
                        });
                        setSmartPostCode(geo.postCode);
                        setSmartRecipientCity(geo.recipientCity);
                        setSmartRecipientZone(geo.recipientZone);
                        setSmartRecipientArea(geo.recipientArea);
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
                      onChange={(e) => {
                        const uId = Number(e.target.value);
                        setSmartUpazilaId(uId);
                        const geo = resolveCourierGeoForAddress({
                          districtId: smartDistrictId,
                          upazilaId: uId,
                          streetAddress: smartStreet,
                        });
                        setSmartPostCode(geo.postCode);
                        setSmartRecipientCity(geo.recipientCity);
                        setSmartRecipientZone(geo.recipientZone);
                        setSmartRecipientArea(geo.recipientArea);
                      }}
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

                {/* Auto-Synced PostCode & Pathao City/Zone/Area Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 border border-border rounded-[var(--radius-md)] bg-surface text-xs">
                  <Input
                    label={locale === 'bn' ? 'পোস্টকোড (৪ ডিজিট)' : 'Post Code'}
                    value={smartPostCode}
                    onChange={(e) => setSmartPostCode(e.target.value)}
                    maxLength={4}
                  />
                  <Input
                    label="Pathao City(*)"
                    value={smartRecipientCity}
                    onChange={(e) => setSmartRecipientCity(e.target.value)}
                  />
                  <Input
                    label="Pathao Zone(*)"
                    value={smartRecipientZone}
                    onChange={(e) => setSmartRecipientZone(e.target.value)}
                  />
                  <Input
                    label="Pathao Area"
                    value={smartRecipientArea}
                    onChange={(e) => setSmartRecipientArea(e.target.value)}
                  />
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
                  ? 'ইউজার সিকিউরিটি, ঐচ্ছিক 2FA ও পারমিশন ম্যাট্রিক্স'
                  : 'Users, Optional 2FA & Granular Permission Matrix'}
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
                          vendorId: newRoleSlug === 'vendor' ? newVendorId : undefined,
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
                    {newRoleSlug === 'vendor' && <label className="block text-xs font-medium">{locale === 'bn' ? 'ভেন্ডর নির্বাচন করুন' : 'Select vendor'}
                      <select required value={newVendorId} onChange={e => setNewVendorId(e.target.value)} className="w-full min-h-[42px] bg-bg border border-border rounded-[var(--radius-md)]">
                        <option value="">{locale === 'bn' ? 'ভেন্ডর বেছে নিন' : 'Choose vendor'}</option>
                        {(snapshot.vendors ?? snapshot.vendorEscrow?.vendors.map(v => v.profile) ?? []).map(v => <option key={v.vendorId} value={v.vendorId}>{locale === 'bn' ? v.businessNameBn : v.businessNameEn}</option>)}
                      </select></label>}
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
                            `BongoConsign ERP Login\nUsername: ${createdTempCredentials.username}\nTemp Password: ${createdTempCredentials.tempPassword}\nপ্রথম লগইনে পাসওয়ার্ড পরিবর্তন করুন। 2FA আপনার নিরাপত্তা সেটিংসে চালু করা যায়।`
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
                            <Button variant="outline" size="sm" onClick={async () => {
                              const adminTotpCode = window.prompt(locale === 'bn' ? 'অথেনটিকেটরের নতুন কোড দিন' : 'Enter a fresh authenticator code')?.trim();
                              if (!adminTotpCode) return;
                              const res = await fetch('/api/admin/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'reset_user_security', targetUserId: u.userId, action: 'reset_password', adminTotpCode }) });
                              const data = await res.json() as { success?: boolean; oneTimeTempPassword?: string; errorBn?: string };
                              if (!res.ok || !data.success || !data.oneTimeTempPassword) { setActionFeedback({ type: 'error', text: data.errorBn || (locale === 'bn' ? 'পাসওয়ার্ড রিসেট হয়নি।' : 'Password reset failed.') }); return; }
                              setCreatedTempCredentials({ username: u.username, tempPassword: data.oneTimeTempPassword, roleSlug: u.roleSlug });
                              setActionFeedback({ type: 'success', text: locale === 'bn' ? 'অস্থায়ী পাসওয়ার্ড উপরের ইউজার বিভাগে দেখানো হয়েছে।' : 'The temporary password is shown in the user section above.' });
                              await fetchWorkspace();
                            }}>{locale === 'bn' ? 'পাসওয়ার্ড রিসেট' : 'Reset password'}</Button>
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
                                    text: `@${u.username}-এর 2FA রিসেট করা হয়েছে; ব্যবহারকারী চাইলে আবার চালু করতে পারবেন।`,
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
            siteSettings={siteSettings}
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
              manualCourierParcels={snapshot.manualCourierParcels ?? []}
              courierAccountsSummary={snapshot.courierAccountsSummary ?? null}
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
            TAB: VENDORS HUB (Directory, 360° Profiles, Approvals & Performance)
           ================================================================== */}
        {activeTab === 'vendors_hub' && !isVendor && (
          <VendorsHubPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            initialSubTab={vendorsHubSubTab}
            focusedVendorId={focusedVendorId}
            initialStatusFilter={vendorsStatusFilter}
            vendorsEscrow={snapshot.vendorEscrow?.vendors ?? []}
            ledgerEntries={snapshot.vendorEscrow?.ledgerEntries ?? []}
            payoutRequests={snapshot.vendorEscrow?.payoutRequests ?? []}
            manualCourierParcels={snapshot.manualCourierParcels ?? []}
            product360={snapshot.product360 ?? []}
            orders={orders as unknown as Array<Partial<OrderGridRowDTO>>}
            phase7Overview={snapshot.phase7Overview ?? null}
            vendorScorecards={snapshot.phase6Overview?.vendorScorecards ?? []}
            openSupportCount={
              (snapshot.vendorSupportTickets ?? []).filter((tkt) => tkt.status === 'open').length
            }
            pendingKycCount={(snapshot.pendingVendorKycDocs ?? []).length}
            onRefreshWorkspace={fetchWorkspace}
            onNotify={(msg, tone) =>
              setActionFeedback({ type: tone ?? 'success', text: msg })
            }
            onOpenPayoutsForVendor={(vendorId, mode) => {
              setPayoutsVendorFilter(vendorId);
              setPayoutsStatusFilter('all');
              if (mode === 'ledger') {
                setPayoutsSubTab('ledger');
                setPayoutsOpenCreateMode(null);
              } else if (mode === 'direct_pay') {
                setPayoutsSubTab('register');
                setPayoutsOpenCreateMode('direct');
              } else {
                setPayoutsSubTab('register');
                setPayoutsOpenCreateMode(null);
              }
              setActiveTab('vendor_payouts');
            }}
            onOpenOrderDetails={(orderNo) =>
              setDetailsSheetState({ orderNo, initialFocus: 'top' })
            }
            onOpenProductStudio={() => setActiveTab('product_studio')}
            onOpenVendorInbox={() => {
              setMessagingSubTab('vendor');
              setActiveTab('messaging_hub');
            }}
            onOpenUsersRbac={() => setActiveTab('users_and_rbac')}
            onClearFocusedVendor={() => {
              setFocusedVendorId(null);
              setVendorsStatusFilter('all');
            }}
          />
        )}

        {/* ==================================================================
            TAB: VENDOR PAYOUTS & ESCROW LEDGER
           ================================================================== */}
        {activeTab === 'vendor_payouts' && (isSuperAdmin || Boolean(snapshot.vendorEscrow)) && (
          <VendorPayoutsLedgerPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            initialSubTab={payoutsSubTab}
            initialVendorFilter={payoutsVendorFilter}
            initialStatusFilter={payoutsStatusFilter}
            openCreateMode={payoutsOpenCreateMode}
            vendorsEscrow={snapshot.vendorEscrow?.vendors ?? []}
            ledgerEntries={snapshot.vendorEscrow?.ledgerEntries ?? []}
            returnResolutions={snapshot.vendorEscrow?.returnResolutions ?? []}
            maturityBatches={snapshot.phase7Overview?.maturityBatches ?? []}
            ledgerReversals={snapshot.phase7Overview?.ledgerReversals ?? []}
            availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
            onRefreshWorkspace={fetchWorkspace}
            onNotify={(msg, tone) =>
              setActionFeedback({ type: tone ?? 'success', text: msg })
            }
            onOpenVendorProfile={(vendorId) => {
              setFocusedVendorId(vendorId);
              setVendorsHubSubTab('directory');
              setActiveTab('vendors_hub');
            }}
            onConsumeDeepLink={() => setPayoutsOpenCreateMode(null)}
          />
        )}

        {/* ==================================================================
            TAB: PRODUCT & CATEGORY STUDIO (CRUD, 3-TIER PRICING, REVIEWS & LINKAGE)
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
            moderatedReviews={snapshot.phase6Overview?.moderatedReviews ?? []}
            onRefresh={fetchWorkspace}
            currentUserId={currentUser.userId}
            userRole={currentUser.roleSlug}
            locale={locale}
          />
        )}

        {/* ==================================================================
            TAB: FINANCE, ACCOUNTING, VAT, REFUNDS & PRODUCT 360
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
            executiveAccounting={snapshot.phase7Overview?.executiveAccounting ?? null}
            customerRefunds={snapshot.phase7Overview?.customerRefunds ?? []}
            availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB: CRM & CONTACTS (Unified Directory, Cart Recovery & Blacklist)
           ================================================================== */}
        {activeTab === 'crm_contacts' && !isVendor && (
          <CrmContactsPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            customers360={snapshot.phase6Overview?.customers360 ?? []}
            orders={orders}
            inquiries={snapshot.inquiries ?? []}
            abandonedCarts={snapshot.phase6Overview?.abandonedCarts ?? []}
            manualPaymentSubmissions={snapshot.manualPaymentSubmissions ?? []}
            messageLogs={snapshot.messageLogs ?? []}
            returnResolutions={snapshot.vendorEscrow?.returnResolutions ?? []}
            customerRefunds={snapshot.phase7Overview?.customerRefunds ?? []}
            auditLogs={snapshot.auditLogs ?? []}
            blacklistedPhones={Object.fromEntries(
              Object.entries(snapshot.blacklistedPhones ?? {}).map(([phone, val]) => [
                phone,
                typeof val === 'string'
                  ? { reasonBn: val, addedAt: new Date().toISOString() }
                  : {
                      reasonBn: val.reasonBn,
                      addedAt: val.blacklistedAt ?? new Date().toISOString(),
                    },
              ])
            )}
            onOpenInquiryInInbox={(inquiryId) => {
              setFocusedInquiryId(inquiryId);
              setMessagingSubTab('customer');
              setActiveTab('messaging_hub');
            }}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB: MESSAGING HUB (Customer Inbox, Vendor Inbox & Templates)
           ================================================================== */}
        {activeTab === 'messaging_hub' && !isVendor && (
          <MessagingHubPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            initialSubTab={messagingSubTab}
            initialInquiryId={focusedInquiryId}
            inquiries={snapshot.inquiries ?? []}
            users={snapshot.users ?? []}
            vendors={(
              snapshot.vendors ??
              snapshot.vendorEscrow?.vendors.map((v) => v.profile) ??
              []
            ).map((v) => ({
              vendorId: v.vendorId,
              vendorCode: v.vendorCode,
              businessNameBn: v.businessNameBn,
              businessNameEn: v.businessNameEn,
            }))}
            availableOrderNos={orders.map((o) => o.orderNo!).filter(Boolean)}
            messageTemplates={snapshot.messageTemplates ?? []}
            messageLogs={snapshot.messageLogs ?? []}
            automationKillSwitchActive={Boolean(snapshot.automationKillSwitchActive)}
            automationRules={snapshot.automationRules ?? []}
            automationLogs={snapshot.automationLogs ?? []}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB: SYNC & LIVE HEALTH (Google Sheets Mirror + Live Diagnostics)
           ================================================================== */}
        {activeTab === 'sync_health' && isSuperAdmin && (
          <SyncHealthPanel
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            sheetsSyncHistory={snapshot.sheetsSyncHistory ?? []}
            onRefreshWorkspace={fetchWorkspace}
          />
        )}

        {/* ==================================================================
            TAB: SUPER ADMIN CONTROL CENTER, CREDENTIALS, CRON & BACKUPS
           ================================================================== */}
        {activeTab === 'control_center' && isSuperAdmin && (
          <SuperAdminControlCenterPanel
            siteSettings={snapshot.siteSettings!}
            maskedCredentials={snapshot.maskedCredentials ?? []}
            scheduledJobs={snapshot.scheduledJobs ?? []}
            backupSnapshots={snapshot.phase6Overview?.backupSnapshots ?? []}
            onRefreshWorkspace={fetchWorkspace}
            locale={locale}
          />
        )}

        {/* ==================================================================
            TAB: PRE-LAUNCH SECURITY AUDIT & GO-LIVE CENTER
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
            onClick={() => setActiveTab(isVendor ? 'vendor_payouts' : 'vendors_hub')}
            className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'vendors_hub' || activeTab === 'vendor_payouts'
                ? 'text-ink font-bold'
                : 'text-muted'
            }`}
          >
            <Store className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'ভেন্ডর' : 'Vendors'}</span>
          </button>
        </div>
      </nav>

      {/* =====================================================================
          1. UNIFIED ORDER DETAILS, PAYMENT/ADVANCE & COURIER MASTER SHEET
         ===================================================================== */}
      <OrderDetailsSheet
        order={activeDetailsOrder}
        initialFocus={detailsSheetState?.initialFocus ?? 'top'}
        locale={locale}
        isVendor={isVendor}
        isSuperAdmin={isSuperAdmin}
        currentUsername={currentUser.username}
        products={products}
        manualPaymentSubmissions={snapshot?.manualPaymentSubmissions ?? []}
        siteSettings={siteSettings}
        getOrderStatusUrl={getOrderStatusUrl}
        onClose={() => setDetailsSheetState(null)}
        onRefreshWorkspace={fetchWorkspace}
        onLogCall={(orderNo) =>
          void executeGridAction({
            orderNos: [orderNo],
            actionType: 'log_call_attempt',
          })
        }
        onOpenMessage={(ord) => handleOpenMessageStudio(ord)}
        onOpenPrint={(orderNo) => setPrintPreviewOrderNo(orderNo)}
        onFeedback={(fb) => setActionFeedback(fb)}
      />

      {/* =====================================================================
          1A. DIRECT SINGLE-ORDER PRINT PREVIEW SHEET
         ===================================================================== */}
      <OrderPrintPreviewSheet
        orderNo={printPreviewOrderNo}
        locale={locale}
        isSuperAdmin={isSuperAdmin}
        isVendor={isVendor}
        printConfig={
          snapshot?.printConfig ?? {
            defaultMode: 'a4_3part',
            part1TitleBn: 'গ্রাহক কপি (ইনভয়েস)',
            part1TitleEn: 'Customer Invoice',
            part2TitleBn: 'কুরিয়ার বক্স স্টিকার',
            part2TitleEn: 'Courier Box Sticker',
            part3TitleBn: 'অফিস ও প্যাকিং স্লিপ',
            part3TitleEn: 'Office & Packing Slip',
            part1HeightMm: 95,
            part2HeightMm: 100,
            part3HeightMm: 92,
            checklistItemsBn: [],
            footerNoteBn: '',
          }
        }
        siteSettings={siteSettings}
        onClose={() => setPrintPreviewOrderNo(null)}
        onOpenPrintEngineTab={(orderNo) => {
          setPrintPreviewOrderNo(null);
          setSelectedOrderNos([orderNo]);
          setActiveTab('print_engine');
        }}
        onRefreshWorkspace={fetchWorkspace}
      />

      {/* =====================================================================
          1B. DATE-RANGE COURIER BULK CSV EXPORT STUDIO RESPONSIVE SHEET
         ===================================================================== */}
      <ResponsiveSheet
        open={showBulkCsvModal}
        onOpenChange={setShowBulkCsvModal}
        title={
          locale === 'bn'
            ? 'কুরিয়ার বাল্ক CSV এক্সপোর্ট ও অটো-সিঙ্ক স্টুডিও (Pathao / Steadfast / BD Post)'
            : 'Courier Bulk CSV Export & Auto-Sync Studio'
        }
      >
        <CourierBulkCsvPanel
          orders={orders}
          siteSettings={siteSettings}
          onOpenOrderEditor={(orderNo) => {
            setShowBulkCsvModal(false);
            setDetailsSheetState({ orderNo, initialFocus: 'courier' });
          }}
          onExecuteOperation={async (payload) => {
            const res = await fetch('/api/admin/workspace', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
              setActionFeedback({
                type: 'success',
                text:
                  data.messageBn ||
                  'কুরিয়ার ও এরিয়া তথ্য সফলভাবে আপডেট ও সিঙ্ক হয়েছে।',
              });
              await fetchWorkspace();
            } else {
              setActionFeedback({
                type: 'error',
                text: data.errorBn || 'আপডেট ব্যর্থ হয়েছে।',
              });
            }
          }}
        />
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
                {locale === 'bn' ? 'WhatsApp বা SMS অ্যাপে গিয়ে নিজে পাঠাতে হবে। অ্যাপ খোলা বা কপি করা মানে মেসেজ পাঠানো নয়; পাঠানো নিশ্চিত বা লগ করা হয় না।' : 'Send the message in WhatsApp or your SMS app. Opening or copying does not confirm delivery, and is not logged as sent.'}</p>
            </div>
          </div>
        )}
      </ResponsiveSheet>

      {/* =====================================================================
          3. COURIER DISPATCH, CUSTOM COURIER & EDITABLE TRACKING LINK SHEET
         ===================================================================== */}
      <OrderDispatchSheet
        order={dispatchDialogState?.order ?? null}
        mode={dispatchDialogState?.mode ?? 'edit'}
        locale={locale}
        isSubmitting={isSavingTracking}
        onClose={() => setDispatchDialogState(null)}
        onSubmit={handleSubmitDispatch}
      />

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
                aria-label={locale === 'bn' ? 'নোটিফিকেশন ফিল্টার' : 'Notification filter'}
                onChange={(e) =>
                  setNotificationFilter(
                    e.target.value as 'all' | 'vendor_approval' | 'stock_alert' | 'order_alert'
                  )
                }
                className="min-h-11 px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs focus:outline-none focus:ring-1 focus:ring-ink cursor-pointer"
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
                className="inline-flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-[var(--radius-sm)] bg-surface hover:bg-bg border border-border text-ink text-xs font-semibold cursor-pointer transition-colors"
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
                            {locale === 'bn' ? n.timestampBn : n.timestampEn}
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
                          aria-label={
                            isRead
                              ? locale === 'bn'
                                ? 'অপঠিত হিসেবে চিহ্নিত করুন'
                                : 'Mark as Unread'
                              : locale === 'bn'
                              ? 'পঠিত হিসেবে চিহ্নিত করুন'
                              : 'Mark as Read'
                          }
                          className="min-w-11 min-h-11 flex items-center justify-center rounded-[var(--radius-sm)] text-muted hover:text-ink cursor-pointer"
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
                            if (n.targetQueue === 'VENDOR_SUPPORT_INBOX') {
                              setMessagingSubTab('vendor');
                              setActiveTab('messaging_hub');
                            } else if (n.targetQueue === 'VENDORS_APPROVALS') {
                              setVendorsHubSubTab('approvals');
                              setFocusedVendorId(null);
                              setActiveTab('vendors_hub');
                            } else if (n.targetQueue?.startsWith('VENDORS_ONBOARDING:')) {
                              const vid = n.targetQueue.slice('VENDORS_ONBOARDING:'.length);
                              setVendorsStatusFilter('pending_onboarding');
                              setVendorsHubSubTab('directory');
                              setFocusedVendorId(vid || null);
                              setActiveTab('vendors_hub');
                            } else if (n.targetQueue?.startsWith('PAYOUTS_REQUESTED:')) {
                              const vid = n.targetQueue.slice('PAYOUTS_REQUESTED:'.length);
                              setPayoutsSubTab('register');
                              setPayoutsVendorFilter(vid || null);
                              setPayoutsStatusFilter('requested');
                              setActiveTab('vendor_payouts');
                            } else if (n.targetQueue?.startsWith('PAYOUTS_APPROVED:')) {
                              const vid = n.targetQueue.slice('PAYOUTS_APPROVED:'.length);
                              setPayoutsSubTab('register');
                              setPayoutsVendorFilter(vid || null);
                              setPayoutsStatusFilter('approved');
                              setActiveTab('vendor_payouts');
                            } else if (n.targetQueue === 'PAYOUTS_LEDGER') {
                              setPayoutsSubTab('ledger');
                              setActiveTab('vendor_payouts');
                            } else if (n.targetQueue?.startsWith('CUSTOMER_INQUIRY:')) {
                              setFocusedInquiryId(n.targetQueue.slice('CUSTOMER_INQUIRY:'.length));
                              setMessagingSubTab('customer');
                              setActiveTab('messaging_hub');
                            } else if (n.targetQueue) {
                              openOrderQueue(n.targetQueue);
                            } else {
                              setActiveTab(n.targetTab);
                            }
                            setIsNotificationOpen(false);
                          }}
                          className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-[var(--radius-sm)] bg-ink text-surface text-[11px] font-semibold hover:opacity-90 cursor-pointer transition-opacity"
                        >
                          <span>{locale === 'bn' ? 'দেখুন' : 'Open'}</span>
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
