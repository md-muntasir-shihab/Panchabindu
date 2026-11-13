'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocaleStore } from '@/src/store/use-locale-store';
import { localizedFetch } from '@/src/lib/i18n/localized-fetch';
import { uiText } from '@/src/lib/i18n/ui-text';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';

type Overview = {
  products: Array<{ id: string; nameBn: string; nameEn?: string; status: string; variants: Array<{ titleBn: string; titleEn?: string; stockAvailable: number }> }>;
  orders: Array<{ orderNo: string; status: string; items: Array<{ nameBn: string; nameEn?: string; variantBn: string; variantEn?: string; quantity: number }> }>;
};

const fetch = (input: RequestInfo | URL, init?: RequestInit) => localizedFetch(input, init, 'admin');

export function VendorClient() {
  const locale = useLocaleStore(state => state.adminLocale);
  const toggleLocale = useLocaleStore(state => state.toggleAdminLocale);
  const bn = locale === 'bn';
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [enrollment, setEnrollment] = useState<{ userId: string; uri: string; csrf: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch('/api/vendor/overview', { cache: 'no-store' });
    setOverview(response.ok ? await response.json() as Overview : null);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/vendor/overview', { cache: 'no-store' }).then(async response => {
      if (active && response.ok) setOverview(await response.json() as Overview);
    }).catch(() => setError('Network error.'));
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(enrollment ? { 'x-csrf-token': enrollment.csrf } : {}) },
        body: JSON.stringify(enrollment
          ? { action: 'complete_first_login', userId: enrollment.userId, currentPassword: password, newPassword, totpCode: totp }
          : { action: 'login', username, password, totpCode: totp }),
      });
      const data = await response.json() as { success?: boolean; errorBn?: string; requiresFirstLoginGate?: boolean; user?: { userId: string; roleSlug: string }; totpSetupUri?: string; csrfToken?: string };
      if (!response.ok || !data.success || data.user?.roleSlug !== 'vendor') {
        if (data.success && data.user?.roleSlug !== 'vendor') {
          await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(data.csrfToken ? { 'x-csrf-token': data.csrfToken } : {}) }, body: JSON.stringify({ action: 'logout' }) });
        }
        setError(data.errorBn || 'Vendor login failed.');
      } else if (data.requiresFirstLoginGate && data.user && data.csrfToken) {
        setEnrollment({ userId: data.user.userId, uri: data.totpSetupUri || '', csrf: data.csrfToken });
        setTotp('');
      } else {
        if (data.csrfToken) window.sessionStorage.setItem('bg_vendor_csrf_token', data.csrfToken);
        setEnrollment(null);
        setPassword('');
        setTotp('');
        setNewPassword('');
        await refresh();
      }
    } catch { setError('Network error.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      const csrf = window.sessionStorage.getItem('bg_vendor_csrf_token');
      const response = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify({ action: 'logout' }) });
      if (response.ok) {
        window.sessionStorage.removeItem('bg_vendor_csrf_token');
        setOverview(null);
      } else setError('Logout failed. Please try again.');
    } catch { setError('Network error.'); }
    finally { setBusy(false); }
  }

  return <main lang={bn ? 'bn' : 'en'} className="min-h-screen bg-bg text-ink px-4 py-12">
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{bn ? 'পঞ্চগড় · ভেন্ডর' : 'Panchagarh · Vendor'}</h1>
        <button type="button" onClick={toggleLocale} className="rounded border border-border px-4 py-2" aria-label={bn ? 'ইংরেজিতে দেখুন' : 'Switch to Bangla'}>{bn ? 'English' : 'বাংলা'}</button>
      </div>
      {!overview ? <form onSubmit={submit} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-semibold">{enrollment ? (bn ? 'প্রথম লগইন: পাসওয়ার্ড ও 2FA সেট করুন' : 'Set your password and authenticator') : (bn ? 'ভেন্ডর লগইন' : 'Vendor login')}</h2>
        {!enrollment && <label className="block">{bn ? 'ইউজারনেম' : 'Username'}<input autoComplete="username" className="mt-1 w-full rounded border border-border bg-bg p-3" value={username} onChange={event => setUsername(event.target.value)} required /></label>}
        <label className="block">{enrollment ? (bn ? 'বর্তমান পাসওয়ার্ড' : 'Current password') : (bn ? 'পাসওয়ার্ড' : 'Password')}<input type="password" autoComplete="current-password" className="mt-1 w-full rounded border border-border bg-bg p-3" value={password} onChange={event => setPassword(event.target.value)} required /></label>
        {enrollment && <><p className="text-sm">{bn ? 'অথেনটিকেটর অ্যাপে এই URI যোগ করুন। এটি গোপন রাখুন।' : 'Add this URI to your authenticator app and keep it private.'}</p>
          <code className="block break-all rounded bg-bg p-2 text-xs">{enrollment.uri}</code>
          <label className="block">{bn ? 'নতুন পাসওয়ার্ড' : 'New password'}<input type="password" autoComplete="new-password" minLength={8} className="mt-1 w-full rounded border border-border bg-bg p-3" value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label></>}
        <label className="block">{bn ? 'অথেনটিকেটর কোড (প্রথমবার পাসওয়ার্ড দিয়ে শুরু করুন)' : 'Authenticator code (start with your password on first login)'}<input inputMode="numeric" autoComplete="one-time-code" className="mt-1 w-full rounded border border-border bg-bg p-3" value={totp} onChange={event => setTotp(event.target.value)} required={Boolean(enrollment)} /></label>
        {error && <p role="alert" className="text-danger">{uiText(error, locale)}</p>}
        <button disabled={busy} className="rounded bg-ink px-5 py-3 text-bg disabled:opacity-50">{busy ? (bn ? 'অপেক্ষা করুন…' : 'Please wait…') : (bn ? 'লগইন' : 'Log in')}</button>
      </form> : <>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{bn ? 'নিজস্ব কাজের সারাংশ' : 'Your workspace'}</h2><button disabled={busy} className="rounded border border-border p-3" onClick={logout}>{bn ? 'লগআউট' : 'Log out'}</button></div>
        {error && <p role="alert" className="text-danger">{uiText(error, locale)}</p>}
        <section className="space-y-2"><h3 className="font-semibold">{bn ? 'পণ্য' : 'Products'} ({formatLocaleNumber(overview.products.length, locale)})</h3>{overview.products.length === 0 && <p>{bn ? 'পণ্য নেই।' : 'No products yet.'}</p>}{overview.products.map(product => <article key={product.id} className="rounded border border-border bg-surface p-4"><strong>{bn ? product.nameBn : product.nameEn || product.nameBn}</strong> · {uiText(product.status, locale)}<ul>{product.variants.map((variant, index) => <li key={index}>{bn ? variant.titleBn : variant.titleEn || variant.titleBn} · {bn ? 'উপলব্ধ:' : 'Available:'} {formatLocaleNumber(variant.stockAvailable, locale)}</li>)}</ul></article>)}</section>
        <section className="space-y-2"><h3 className="font-semibold">{bn ? 'অর্ডার' : 'Orders'} ({formatLocaleNumber(overview.orders.length, locale)})</h3>{overview.orders.length === 0 && <p>{bn ? 'অর্ডার নেই।' : 'No orders yet.'}</p>}{overview.orders.map(order => <article key={order.orderNo} className="rounded border border-border bg-surface p-4"><strong>{order.orderNo}</strong> · {uiText(order.status, locale)}<ul>{order.items.map((item, index) => <li key={index}>{bn ? item.nameBn : item.nameEn || item.nameBn} · {bn ? item.variantBn : item.variantEn || item.variantBn} × {formatLocaleNumber(item.quantity, locale)}</li>)}</ul></article>)}</section>
      </>}
    </section>
  </main>;
}
