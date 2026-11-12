'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Overview = { products: Array<{ id: string; nameBn: string; status: string; variants: Array<{ titleBn: string; stockAvailable: number }> }>; orders: Array<{ orderNo: string; status: string; items: Array<{ nameBn: string; variantBn: string; quantity: number }> }> };

export function VendorClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [username, setUsername] = useState('rupganj_vendor');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [enrollment, setEnrollment] = useState<{ userId: string; uri: string; csrf: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch('/api/vendor/overview', { cache: 'no-store' });
    if (res.ok) setOverview(await res.json() as Overview);
    else setOverview(null);
  }
  useEffect(() => {
    let active = true;
    fetch('/api/vendor/overview', { cache: 'no-store' }).then(async res => {
      if (active && res.ok) setOverview(await res.json() as Overview);
    }).catch(() => { /* Login form remains available when the server is offline. */ });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(enrollment ? { 'x-csrf-token': enrollment.csrf } : {}) },
        body: JSON.stringify(enrollment
          ? { action: 'complete_first_login', userId: enrollment.userId, currentPassword: password, newPassword, totpCode: totp }
          : { action: 'login', username, password, totpCode: totp }),
      });
      const data = await res.json() as { success?: boolean; errorBn?: string; requiresFirstLoginGate?: boolean; user?: { userId: string; roleSlug: string }; totpSetupUri?: string; csrfToken?: string };
      if (!res.ok || !data.success || data.user?.roleSlug !== 'vendor') {
        if (data.success && data.user?.roleSlug !== 'vendor') {
          const csrf = data.csrfToken;
          await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify({ action: 'logout' }) });
        }
        setError(data.errorBn || 'Vendor login failed.');
      } else if (data.requiresFirstLoginGate && data.user && data.csrfToken) {
        setEnrollment({ userId: data.user.userId, uri: data.totpSetupUri || '', csrf: data.csrfToken });
        setTotp('');
      } else {
        if (data.csrfToken) window.sessionStorage.setItem('bg_vendor_csrf_token', data.csrfToken);
        setEnrollment(null); setPassword(''); setTotp(''); setNewPassword('');
        await refresh();
      }
    } catch { setError('Network error.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-bg text-ink px-4 py-12">
    <section className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">পঞ্চগড় · Vendor</h1>
      {!overview ? <form onSubmit={submit} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-semibold">{enrollment ? 'প্রথম লগইন: পাসওয়ার্ড ও 2FA সেট করুন' : 'Vendor login'}</h2>
        {!enrollment && <label className="block">Username<input className="mt-1 w-full rounded border border-border bg-bg p-3" value={username} onChange={e => setUsername(e.target.value)} required /></label>}
        <label className="block">{enrollment ? 'Current password' : 'Password'}<input type="password" className="mt-1 w-full rounded border border-border bg-bg p-3" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {enrollment && <><p className="text-sm">Authenticator অ্যাপে নিচের setup URI যোগ করুন; এটি কাউকে শেয়ার করবেন না।</p>
          <code className="block break-all rounded bg-bg p-2 text-xs">{enrollment.uri}</code>
          <label className="block">New password<input type="password" minLength={8} className="mt-1 w-full rounded border border-border bg-bg p-3" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /></label></>}
        <label className="block">Authenticator code (প্রথম লগইনে password দিয়ে শুরু করুন)<input inputMode="numeric" className="mt-1 w-full rounded border border-border bg-bg p-3" value={totp} onChange={e => setTotp(e.target.value)} required={Boolean(enrollment)} /></label>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <button disabled={busy} className="rounded bg-ink px-5 py-3 text-bg disabled:opacity-50">{busy ? 'অপেক্ষা করুন…' : 'লগইন'}</button>
      </form> : <>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">নিজস্ব কাজের সারাংশ</h2><button className="rounded border border-border p-3" onClick={async () => { const csrf = window.sessionStorage.getItem('bg_vendor_csrf_token'); const res = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify({ action: 'logout' }) }); if (res.ok) { window.sessionStorage.removeItem('bg_vendor_csrf_token'); setOverview(null); } else setError('Logout failed. Please close this browser.'); }}>Log out</button></div>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <section className="space-y-2"><h3 className="font-semibold">পণ্য ({overview.products.length})</h3>{overview.products.length === 0 && <p>পণ্য নেই।</p>}{overview.products.map(p => <article key={p.id} className="rounded border border-border bg-surface p-4"><strong>{p.nameBn}</strong> · {p.status}<ul>{p.variants.map((v, i) => <li key={i}>{v.titleBn} · Available: {v.stockAvailable}</li>)}</ul></article>)}</section>
        <section className="space-y-2"><h3 className="font-semibold">অর্ডার ({overview.orders.length})</h3>{overview.orders.length === 0 && <p>অর্ডার নেই।</p>}{overview.orders.map(o => <article key={o.orderNo} className="rounded border border-border bg-surface p-4"><strong>{o.orderNo}</strong> · {o.status}<ul>{o.items.map((i, n) => <li key={n}>{i.nameBn} · {i.variantBn} × {i.quantity}</li>)}</ul></article>)}</section>
      </>}
    </section>
  </main>;
}