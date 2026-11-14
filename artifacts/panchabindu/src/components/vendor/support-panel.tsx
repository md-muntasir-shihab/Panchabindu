import * as React from 'react';

type Ticket = { ticketId: string; vendorId?: string; subject: string; status: 'open' | 'closed'; updatedAt: string; messages: Array<{ messageId: string; sender: 'vendor' | 'admin'; text: string; createdAt: string }> };
export function SupportPanel({ locale, mode }: { locale: 'bn' | 'en'; mode: 'vendor' | 'admin' }) {
  const t = React.useCallback((bn: string, en: string) => locale === 'bn' ? bn : en, [locale]);
  const url = mode === 'vendor' ? '/api/vendor/support' : '/api/admin/vendor-support';
  const csrfKey = mode === 'vendor' ? 'bg_vendor_csrf_token' : 'bg_admin_csrf_token';
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [text, setText] = React.useState('');
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const input = 'block w-full rounded border border-border bg-bg px-3 py-2 text-sm';
  const button = 'min-h-[44px] rounded border border-border px-3 disabled:opacity-50';
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json() as { success?: boolean; tickets?: Ticket[] };
      if (!res.ok || !data.success || !Array.isArray(data.tickets)) throw new Error();
      setTickets(data.tickets); return true;
    } catch { setNotice(t('সহায়তার তালিকা লোড করা যায়নি।', 'Could not load support tickets.')); return false; }
    finally { setLoading(false); }
  }, [url, t]);
  React.useEffect(() => { void load(); }, [load]);
  async function send(body: Record<string, string>) {
    setBusy(true); setNotice('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': sessionStorage.getItem(csrfKey) || '' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      if (body.action === 'create') { setSubject(''); setText(''); }
      if (body.action === 'reply') setReplies(old => ({ ...old, [body.ticketId]: '' }));
      if (await load()) setNotice(t('সংরক্ষণ করা হয়েছে।', 'Saved.'));
    } catch { setNotice(t('সংরক্ষণ করা যায়নি। সেশন বা টিকিটের অবস্থা পরীক্ষা করে আবার চেষ্টা করুন।', 'Could not save. Check your session or ticket status and try again.')); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm">
    <h2 className="font-bold">{t('ভেন্ডর সহায়তা', 'Vendor support')}</h2>
    <p className="text-xs text-muted">{t('পাসওয়ার্ড, পরিচয়পত্র বা ব্যাংক তথ্য পাঠাবেন না। এটি সাধারণ সহায়তা; আনুষ্ঠানিক বিরোধ নিষ্পত্তি নয়।', 'Do not send passwords, identity documents or bank details. This is general support, not a formal dispute process.')}</p>
    {mode === 'vendor' && <form onSubmit={e => { e.preventDefault(); void send({ action: 'create', subject, text }); }} className="space-y-2">
      <label className="block text-xs">{t('বিষয়', 'Subject')}<input required minLength={3} maxLength={160} className={input} value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label className="block text-xs">{t('বার্তা', 'Message')}<textarea required minLength={3} maxLength={2000} className={input} value={text} onChange={e => setText(e.target.value)} /></label>
      <button className={button} disabled={busy}>{t('টিকিট তৈরি করুন', 'Create ticket')}</button>
      <p className="text-xs text-muted">{t('একসাথে সর্বোচ্চ ২০টি খোলা টিকিট।', 'At most 20 open tickets at a time.')}</p>
    </form>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>{t('লোড হচ্ছে…', 'Loading…')}</p> : tickets.length === 0 ? <p>{t('কোনো টিকিট নেই।', 'No tickets yet.')}</p> : <ul className="space-y-3">{tickets.map(ticket => <li key={ticket.ticketId} className="space-y-2 rounded border border-border p-3">
      <h3 className="font-bold break-words">{ticket.subject}</h3>
      <p className="text-xs">{ticket.status === 'open' ? t('খোলা', 'Open') : t('বন্ধ', 'Closed')} · {t('সর্বশেষ পরিবর্তন', 'Last updated')}: {new Date(ticket.updatedAt).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')}{mode === 'admin' && <> · {t('ভেন্ডর ID', 'Vendor ID')}: <span className="break-all">{ticket.vendorId}</span></>}</p>
      <ol className="space-y-2">{ticket.messages.map(message => <li key={message.messageId} className="rounded bg-bg p-2 text-xs"><strong>{message.sender === 'admin' ? t('অ্যাডমিন', 'Admin') : t('ভেন্ডর', 'Vendor')}</strong> · {new Date(message.createdAt).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')}<p className="whitespace-pre-wrap break-words">{message.text}</p></li>)}</ol>
      {ticket.status === 'open' && <><form onSubmit={e => { e.preventDefault(); void send({ action: 'reply', ticketId: ticket.ticketId, text: replies[ticket.ticketId] || '' }); }} className="space-y-2"><label className="block text-xs">{t('উত্তর', 'Reply')}<textarea className={input} required maxLength={2000} value={replies[ticket.ticketId] || ''} onChange={e => setReplies(old => ({ ...old, [ticket.ticketId]: e.target.value }))} /></label><button className={button} disabled={busy || ticket.messages.length >= 100}>{t('উত্তর পাঠান', 'Send reply')}</button></form>
        {ticket.messages.length >= 100 && <p className="text-xs">{t('বার্তার সীমা পূর্ণ; প্রয়োজন হলে নতুন টিকিট তৈরি করুন।', 'Message limit reached; create a new ticket if needed.')}</p>}
        {mode === 'admin' && <button type="button" className={button} disabled={busy} onClick={() => { if (window.confirm(t('টিকিট বন্ধ করবেন?', 'Close this ticket?'))) void send({ action: 'close', ticketId: ticket.ticketId }); }}>{t('টিকিট বন্ধ করুন', 'Close ticket')}</button>}</>}
    </li>)}</ul>}
  </section>;
}
