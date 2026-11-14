'use client';

// src/components/vendor/vendor-client.tsx
// Consignment vendor panel: login gate (first-login password change + 2FA
// enrollment) followed by a full self-service dashboard.
// Server contract: /api/vendor/* returns whitelisted DTOs only — no platform
// margin, no net profit, no customer PII, no other vendor's data.
// Admin controls every capability via /api/admin/vendors (capability matrix,
// commission, escrow hold, suspension, request approval).

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Boxes,
  ClipboardList,
  Coins,
  LayoutDashboard,
  Loader2,
  Package,
  PackagePlus,
  Percent,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { useLocaleStore } from '@/store/use-locale-store';
import { localizedFetch } from '@/lib/i18n/localized-fetch';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { formatPoishaToBdt } from '@/lib/money';
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import {
  DashboardTab,
  EarningsTab,
  OrdersTab,
  PayoutsTab,
  ProductsTab,
  ProfileTab,
  ProposalsTab,
  StockTab,
} from '@/components/vendor/vendor-tabs';
import type {
  VendorWorkspaceDTO,
  VendorWorkspaceResponse,
} from '@/lib/vendor/vendor-types';

const vendorFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  localizedFetch(input, init, 'admin');

const CSRF_KEY = 'bg_vendor_csrf_token';

type TabKey =
  | 'overview'
  | 'products'
  | 'stock'
  | 'orders'
  | 'earnings'
  | 'payouts'
  | 'proposals'
  | 'profile';

interface TabDef {
  key: TabKey;
  labelBn: string;
  labelEn: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { key: 'overview', labelBn: 'ড্যাশবোর্ড', labelEn: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> },
  { key: 'products', labelBn: 'পণ্য ও স্টক', labelEn: 'Products & Stock', icon: <Package className="h-4 w-4" aria-hidden="true" /> },
  { key: 'stock', labelBn: 'চালান (LOT)', labelEn: 'Challans (LOT)', icon: <Truck className="h-4 w-4" aria-hidden="true" /> },
  { key: 'orders', labelBn: 'অর্ডার', labelEn: 'Orders', icon: <ClipboardList className="h-4 w-4" aria-hidden="true" /> },
  { key: 'earnings', labelBn: 'আয় ও এসক্রো', labelEn: 'Earnings & Escrow', icon: <Coins className="h-4 w-4" aria-hidden="true" /> },
  { key: 'payouts', labelBn: 'পেআউট', labelEn: 'Payouts', icon: <Wallet className="h-4 w-4" aria-hidden="true" /> },
  { key: 'proposals', labelBn: 'মূল্য প্রস্তাব', labelEn: 'Price Proposals', icon: <Percent className="h-4 w-4" aria-hidden="true" /> },
  { key: 'profile', labelBn: 'প্রোফাইল', labelEn: 'Profile', icon: <Store className="h-4 w-4" aria-hidden="true" /> },
];

export function VendorClient() {
  const locale = useLocaleStore((state) => state.adminLocale);
  const toggleLocale = useLocaleStore((state) => state.toggleAdminLocale);
  const bn = locale === 'bn';
  const t = useCallback((b: string, e: string) => (bn ? b : e), [bn]);
  const money = useCallback((p: number) => formatPoishaToBdt(p, locale), [locale]);
  const num = useCallback((v: number) => formatLocaleNumber(v, locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const [workspace, setWorkspace] = useState<VendorWorkspaceDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [error, setError] = useState('');

  // login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [totpLoginEnabled, setTotpLoginEnabled] = useState(false);
  const [enrollment, setEnrollment] = useState<{
    userId: string;
    uri: string;
    csrf: string;
    require2fa: boolean;
  } | null>(null);

  const csrfRef = useRef<string>('');

  const notify = useCallback((tone: 'success' | 'error', message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 6000);
  }, []);

  const refresh = useCallback(async () => {
    const response = await vendorFetch('/api/vendor/workspace', { cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      setWorkspace(null);
      return null;
    }
    const data = (await response.json()) as VendorWorkspaceResponse;
    if (!response.ok || !data.success || !data.workspace) {
      setWorkspace(null);
      return null;
    }
    if (data.csrfToken) {
      csrfRef.current = data.csrfToken;
      window.sessionStorage.setItem(CSRF_KEY, data.csrfToken);
    }
    setWorkspace(data.workspace);
    return data.workspace;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await vendorFetch('/api/admin/auth', { cache: 'no-store' });
        if (response.ok) {
          const data = (await response.json()) as { twoFactorLoginEnabled?: boolean };
          if (active) setTotpLoginEnabled(data.twoFactorLoginEnabled === true);
        }
      } catch {
        if (active) setTotpLoginEnabled(true);
      }
      try {
        const stored = window.sessionStorage.getItem(CSRF_KEY);
        if (stored) csrfRef.current = stored;
        await refresh();
        if (active) setError('');
      } catch {
        if (active) setError(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** POST helper with CSRF + locale, refreshing the workspace afterwards. */
  const send = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      successMessage: { bn: string; en: string }
    ): Promise<boolean> => {
      setBusy(true);
      try {
        const csrf = csrfRef.current || window.sessionStorage.getItem(CSRF_KEY) || '';
        const response = await vendorFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { success?: boolean; errorBn?: string; errorEn?: string };
        if (!response.ok || !data.success) {
          notify('error', (bn ? data.errorBn : data.errorEn || data.errorBn) || t('কাজটি সম্পন্ন হয়নি।', 'The action failed.'));
          return false;
        }
        notify('success', bn ? successMessage.bn : successMessage.en);
        await refresh();
        return true;
      } catch {
        notify('error', t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [bn, notify, refresh, t]
  );

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await vendorFetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(enrollment ? { 'x-csrf-token': enrollment.csrf } : {}),
        },
        body: JSON.stringify(
          enrollment
            ? {
                action: 'complete_first_login',
                userId: enrollment.userId,
                currentPassword: password,
                newPassword,
                totpCode: totp,
              }
            : { action: 'login', username, password, totpCode: totp }
        ),
      });
      const data = (await response.json()) as {
        success?: boolean;
        errorBn?: string;
        requiresFirstLoginGate?: boolean;
        user?: { userId: string; roleSlug: string; require2fa?: boolean };
        totpSetupUri?: string;
        csrfToken?: string;
      };

      if (!response.ok || !data.success || data.user?.roleSlug !== 'vendor') {
        if (data.success && data.user?.roleSlug !== 'vendor') {
          await vendorFetch('/api/admin/auth', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(data.csrfToken ? { 'x-csrf-token': data.csrfToken } : {}),
            },
            body: JSON.stringify({ action: 'logout' }),
          });
          setError(t('এই লগইন অ্যাডমিন অ্যাকাউন্টের। ভেন্ডর অ্যাকাউন্ট দিয়ে প্রবেশ করুন।', 'This account is a staff account. Log in with a vendor account.'));
        } else {
          setError(data.errorBn || t('লগইন ব্যর্থ হয়েছে।', 'Vendor login failed.'));
        }
      } else if (data.requiresFirstLoginGate && data.user && data.csrfToken) {
        setEnrollment({
          userId: data.user.userId,
          uri: data.totpSetupUri || '',
          csrf: data.csrfToken,
          require2fa: data.user.require2fa !== false,
        });
        setTotp('');
        setError('');
      } else {
        if (data.csrfToken) {
          csrfRef.current = data.csrfToken;
          window.sessionStorage.setItem(CSRF_KEY, data.csrfToken);
        }
        setEnrollment(null);
        setPassword('');
        setTotp('');
        setNewPassword('');
        await refresh();
      }
    } catch {
      setError(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      const csrf = csrfRef.current || window.sessionStorage.getItem(CSRF_KEY) || '';
      const response = await vendorFetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (response.ok) {
        window.sessionStorage.removeItem(CSRF_KEY);
        csrfRef.current = '';
        setWorkspace(null);
      } else {
        notify('error', t('লগআউট ব্যর্থ হয়েছে।', 'Logout failed.'));
      }
    } catch {
      notify('error', t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-bg px-4 py-10">
        <div className="mx-auto max-w-md space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main lang={bn ? 'bn' : 'en'} className="min-h-[100dvh] bg-bg px-4 py-10 text-ink">
        <div className="mx-auto max-w-md space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">{t('পঞ্চবিন্দু · ভেন্ডর প্যানেল', 'Panchabindu · Vendor Panel')}</h1>
              <p className="text-xs text-muted">{t('কনসাইনমেন্ট সাপ্লায়ার লগইন', 'Consignment supplier login')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleLocale}>
              {bn ? 'English' : 'বাংলা'}
            </Button>
          </div>

          <Card surface="surface" padding="md" className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {enrollment
                ? t('প্রথম লগইন: পাসওয়ার্ড পরিবর্তন ও 2FA', 'First login: password change & 2FA')
                : t('ভেন্ডর লগইন', 'Vendor login')}
            </h2>

            <form onSubmit={handleLogin} className="space-y-3">
              {!enrollment && (
                <Input
                  label={t('ইউজারনেম', 'Username')}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              )}
              <Input
                type="password"
                label={enrollment ? t('বর্তমান পাসওয়ার্ড', 'Current password') : t('পাসওয়ার্ড', 'Password')}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {enrollment && enrollment.require2fa && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">
                    {t(
                      'অথেনটিকেটর অ্যাপে এই URI যোগ করুন। এটি কাউকে দেখাবেন না।',
                      'Add this URI to your authenticator app and keep it private.'
                    )}
                  </p>
                  <code className="block break-all rounded-[var(--radius-sm)] border border-border bg-bg p-2 text-[11px]">
                    {enrollment.uri}
                  </code>
                </div>
              )}
              {enrollment && (
                <Input
                  type="password"
                  label={t('নতুন পাসওয়ার্ড', 'New password')}
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              )}
              {totpLoginEnabled && (!enrollment || enrollment.require2fa) && (
                <Input
                  label={t('অথেনটিকেটর কোড', 'Authenticator code')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  required={Boolean(enrollment?.require2fa)}
                />
              )}
              {error && (
                <p role="alert" className="text-xs font-medium text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" isLoading={busy} className="w-full">
                {enrollment ? t('পাসওয়ার্ড সংরক্ষণ করুন', 'Save password') : t('লগইন', 'Log in')}
              </Button>
            </form>
            <p className="text-[11px] text-muted">
              {t(
                'ভেন্ডর অ্যাকাউন্ট শুধুমাত্র এই প্যানেলে প্রবেশ করতে পারে; অ্যাডমিন ওয়ার্কস্পেস নয়।',
                'Vendor accounts can only reach this panel, never the admin workspace.'
              )}
            </p>
          </Card>
        </div>
      </main>
    );
  }

  const { profile, capabilities, escrow, counters, rules } = workspace;

  return (
    <div lang={bn ? 'bn' : 'en'} className="min-h-[100dvh] bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{bn ? profile.businessNameBn : profile.businessNameEn}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="font-mono">{profile.vendorCode}</span>
              <Badge status={profile.status === 'active' ? 'success' : profile.status === 'suspended' ? 'danger' : 'warning'}>
                {profile.status === 'active'
                  ? t('সক্রিয়', 'Active')
                  : profile.status === 'suspended'
                  ? t('স্থগিত', 'Suspended')
                  : profile.status}
              </Badge>
              <span>{t('কমিশন', 'Commission')}: {profile.defaultCommissionBp === null ? t('গ্লোবাল', 'Global') : `${profile.defaultCommissionBp / 100}%`}</span>
              <span>{t('এসক্রো হোল্ড', 'Escrow hold')}: {profile.escrowHoldDaysOverride ?? rules.globalEscrowHoldDays} {t('দিন', 'days')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label={t('রিফ্রেশ', 'Refresh')}>
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} aria-hidden="true" />
            </Button>
            <Button variant="outline" size="sm" onClick={toggleLocale}>
              {bn ? 'English' : 'বাংলা'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()} isLoading={busy}>
              {t('লগআউট', 'Log out')}
            </Button>
          </div>
        </div>

        <nav aria-label={t('ভেন্ডর প্যানেল মেনু', 'Vendor panel navigation')} className="mx-auto max-w-6xl overflow-x-auto px-3 sm:px-4">
          <ul className="flex min-w-max gap-1 pb-2">
            {TABS.map((item) => {
              const active = item.key === tab;
              const badge =
                item.key === 'products'
                  ? counters.draftProducts
                  : item.key === 'stock'
                  ? counters.pendingLots
                  : item.key === 'orders'
                  ? counters.openOrders
                  : item.key === 'payouts'
                  ? counters.pendingPayouts
                  : item.key === 'proposals'
                  ? counters.pendingProposals
                  : 0;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setTab(item.key)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] border px-3 text-xs font-semibold transition-colors',
                      active ? 'border-ink bg-ink text-bg' : 'border-border bg-bg text-ink hover:bg-surface'
                    )}
                  >
                    {item.icon}
                    {bn ? item.labelBn : item.labelEn}
                    {badge > 0 && (
                      <span
                        className={cn(
                          'ml-0.5 inline-flex min-w-[18px] justify-center rounded-full border px-1 text-[10px] font-bold',
                          active ? 'border-bg text-bg' : 'border-warning text-warning'
                        )}
                      >
                        {num(badge)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-3 py-4 sm:px-4 sm:py-6">
        {profile.restrictionNoteBn && (
          <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning bg-bg p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-ink">
              <span className="font-semibold">{t('অ্যাডমিন নোট', 'Admin note')}: </span>
              {profile.restrictionNoteBn}
            </p>
          </div>
        )}

        {tab === 'overview' && (
          <DashboardTab workspace={workspace} onNavigate={setTab} t={t} num={num} money={money} />
        )}
        {tab === 'products' && (
          <ProductsTab workspace={workspace} send={send} busy={busy} t={t} num={num} money={money} bn={bn} />
        )}
        {tab === 'stock' && (
          <StockTab workspace={workspace} send={send} busy={busy} t={t} num={num} money={money} />
        )}
        {tab === 'orders' && <OrdersTab workspace={workspace} t={t} num={num} money={money} />}
        {tab === 'earnings' && <EarningsTab workspace={workspace} t={t} num={num} money={money} />}
        {tab === 'payouts' && (
          <PayoutsTab workspace={workspace} send={send} busy={busy} t={t} num={num} money={money} />
        )}
        {tab === 'proposals' && (
          <ProposalsTab workspace={workspace} send={send} busy={busy} t={t} num={num} money={money} />
        )}
        {tab === 'profile' && (
          <ProfileTab workspace={workspace} send={send} busy={busy} t={t} num={num} money={money} bn={bn} />
        )}

        <footer className="border-t border-border pt-3 text-[11px] text-muted">
          {t(
            'আপনার প্ল্যাটফর্ম মার্জিন ও নিট লাভ কখনো এই প্যানেলে দেখানো হয় না। কাস্টমারের ফোন ও ঠিকানা প্ল্যাটফর্ম সুরক্ষিত রাখে।',
            'Your platform margin and net profit are never shown here. Customer phone numbers and addresses stay protected by the platform.'
          )}
        </footer>
      </main>

      {toast && (
        <div
          role="alert"
          className={cn(
            'fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-lg items-start gap-3 rounded-[var(--radius-md)] border bg-surface p-3',
            toast.tone === 'success' ? 'border-success' : 'border-danger'
          )}
        >
          <p className="flex-1 text-xs text-ink">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label={t('বন্ধ করুন', 'Dismiss')}
            className="min-h-[32px] min-w-[32px] rounded-[var(--radius-sm)] border border-border text-xs text-muted"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
