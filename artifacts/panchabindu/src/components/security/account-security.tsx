import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';

type Action = 'start_mfa' | 'enable_mfa' | 'disable_mfa' | 'change_password';

/** The setup URI and recovery codes are displayed only to the signed-in user. */
export function AccountSecurity({ locale, csrfKey }: { locale: 'bn' | 'en'; csrfKey: string }) {
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [setupUri, setSetupUri] = React.useState('');
  const [recovery, setRecovery] = React.useState<string[]>([]);
  const [revoked, setRevoked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const t = (bn: string, en: string) => locale === 'bn' ? bn : en;
  async function send(action: Action) {
    setBusy(true); setMessage('');
    try {
      const csrf = window.sessionStorage.getItem(csrfKey) || '';
      const response = await fetch('/api/admin/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ action, currentPassword: password, newPassword, totpCode: code }) });
      const data = await response.json() as { success?: boolean; errorBn?: string; errorEn?: string; setupUri?: string; recoveryBackupCodes?: string[]; sessionRevoked?: boolean };
      if (!response.ok || !data.success) { setMessage((locale === 'bn' ? data.errorBn : data.errorEn) || t('কাজটি সম্পন্ন হয়নি।', 'The action failed.')); return; }
      if (data.setupUri) { setSetupUri(data.setupUri); setCode(''); }
      if (data.sessionRevoked) {
        setRecovery(data.recoveryBackupCodes || []); setSetupUri(''); setPassword(''); setNewPassword(''); setCode(''); setRevoked(true);
      }
    } catch { setMessage(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.')); }
    finally { setBusy(false); }
  }
  const inputClass = 'w-full min-h-[44px] rounded border border-border bg-bg px-3 text-sm';
  return <details className="border border-border rounded-[var(--radius-md)] bg-surface p-3 text-sm">
    <summary className="cursor-pointer min-h-[44px] flex items-center font-bold">{t('অ্যাকাউন্ট নিরাপত্তা', 'Account security')}</summary>
    {revoked ? <div className="space-y-3">
      <p>{t('নিরাপত্তা পরিবর্তনের জন্য সব সেশন বন্ধ হয়েছে। আবার লগইন করুন।', 'All sessions were revoked after the security change. Sign in again.')}</p>
      {recovery.length > 0 && <><p className="font-bold">{t('এই রিকভারি কোডগুলো এখনই নিরাপদ স্থানে রাখুন। প্রতিটি একবার ব্যবহার করা যাবে; আর দেখানো হবে না।', 'Save these recovery codes securely now. Each works once and will not be shown again.')}</p><ul className="font-mono">{recovery.map(c => <li key={c}>{c}</li>)}</ul></>}
      <button className="min-h-[44px] border border-border rounded px-3" type="button" onClick={() => window.location.reload()}>{t('লগইন পেজে ফিরুন', 'Return to sign in')}</button>
    </div> : <div className="space-y-3 max-w-md">
      <label className="block">{t('বর্তমান পাসওয়ার্ড', 'Current password')}<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label className="block">{t('নতুন পাসওয়ার্ড (পাসওয়ার্ড পরিবর্তনের জন্য)', 'New password (for password change)')}<input className={inputClass} type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
      <label className="block">{t('অথেনটিকেটর বা রিকভারি কোড', 'Authenticator or recovery code')}<input className={inputClass} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label>
      {setupUri && <div className="space-y-2"><p>{t('অথেনটিকেটর অ্যাপে স্ক্যান করে নতুন কোড দিন। সেটআপ ১০ মিনিটের জন্য বৈধ।', 'Scan in your authenticator app and enter a fresh code. Setup expires in 10 minutes.')}</p><div className="bg-white p-3 inline-block"><QRCodeSVG value={setupUri} size={180} /></div></div>}
      {message && <p role="alert" className="text-danger">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !password} className="min-h-[44px] border border-border rounded px-3" onClick={() => void send('change_password')}>{t('পাসওয়ার্ড পরিবর্তন', 'Change password')}</button>
        {!setupUri ? <button type="button" disabled={busy || !password} className="min-h-[44px] border border-border rounded px-3" onClick={() => void send('start_mfa')}>{t('2FA সেটআপ', 'Set up 2FA')}</button> : <button type="button" disabled={busy || !password || !code} className="min-h-[44px] border border-border rounded px-3" onClick={() => void send('enable_mfa')}>{t('2FA চালু করুন', 'Enable 2FA')}</button>}
        <button type="button" disabled={busy || !password || !code} className="min-h-[44px] border border-border rounded px-3" onClick={() => void send('disable_mfa')}>{t('2FA বন্ধ করুন', 'Disable 2FA')}</button>
      </div>
    </div>}
  </details>;
}
