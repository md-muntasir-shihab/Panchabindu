import * as React from 'react';
import { adminFetch } from '@/lib/admin/admin-fetch';

export interface VendorSupportTicketDTO {
  ticketId: string;
  vendorId?: string;
  subject: string;
  status: 'open' | 'closed';
  updatedAt: string;
  messages: Array<{
    messageId: string;
    sender: 'vendor' | 'admin';
    text: string;
    createdAt: string;
  }>;
}

export interface VendorLookupItem {
  vendorId: string;
  vendorCode: string;
  businessNameBn: string;
  businessNameEn?: string;
}

export function SupportPanel({
  locale,
  mode,
  vendors,
}: {
  locale: 'bn' | 'en';
  mode: 'vendor' | 'admin';
  vendors?: VendorLookupItem[];
}) {
  const t = React.useCallback((bn: string, en: string) => (locale === 'bn' ? bn : en), [locale]);
  const url = mode === 'vendor' ? '/api/vendor/support' : '/api/admin/vendor-support';
  const fetcher = mode === 'admin' ? adminFetch : fetch;
  const [tickets, setTickets] = React.useState<VendorSupportTicketDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [text, setText] = React.useState('');
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [confirmCloseId, setConfirmCloseId] = React.useState<string | null>(null);

  const vendorMap = React.useMemo(() => {
    const map = new Map<string, VendorLookupItem>();
    for (const v of vendors ?? []) map.set(v.vendorId, v);
    return map;
  }, [vendors]);

  const input =
    'block w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:border-ink';
  const button =
    'min-h-[44px] rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium text-ink hover:bg-bg disabled:opacity-50 transition-colors';

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher(url, { cache: 'no-store' });
      const data = (await res.json()) as {
        success?: boolean;
        tickets?: VendorSupportTicketDTO[];
      };
      if (!res.ok || !data.success || !Array.isArray(data.tickets)) throw new Error();
      setTickets(data.tickets);
      return true;
    } catch {
      setNotice(t('সহায়তার তালিকা লোড করা যায়নি।', 'Could not load support tickets.'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetcher, url, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function send(body: Record<string, string>) {
    setBusy(true);
    setNotice('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (mode === 'vendor') {
        headers['x-csrf-token'] = window.sessionStorage.getItem('bg_vendor_csrf_token') || '';
      }
      const res = await fetcher(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      if (body.action === 'create') {
        setSubject('');
        setText('');
      }
      if (body.action === 'reply') {
        setReplies((old) => ({ ...old, [body.ticketId]: '' }));
      }
      if (body.action === 'close') {
        setConfirmCloseId(null);
      }
      if (await load()) setNotice(t('সংরক্ষণ করা হয়েছে।', 'Saved.'));
    } catch {
      setNotice(
        t(
          'সংরক্ষণ করা যায়নি। সেশন বা টিকিটের অবস্থা পরীক্ষা করে আবার চেষ্টা করুন।',
          'Could not save. Check your session or ticket status and try again.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm">
      <div>
        <h2 className="font-semibold text-ink">{t('ভেন্ডর সহায়তা', 'Vendor support')}</h2>
        <p className="text-xs text-muted mt-1">
          {t(
            'পাসওয়ার্ড, পরিচয়পত্র বা ব্যাংক তথ্য পাঠাবেন না। এটি সাধারণ সহায়তা; আনুষ্ঠানিক বিরোধ নিষ্পত্তি নয়।',
            'Do not send passwords, identity documents or bank details. This is general support, not a formal dispute process.'
          )}
        </p>
      </div>

      {mode === 'vendor' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({ action: 'create', subject, text });
          }}
          className="space-y-2.5"
        >
          <label className="block text-xs text-ink">
            {t('বিষয়', 'Subject')}
            <input
              required
              minLength={3}
              maxLength={160}
              className={`${input} mt-1`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="block text-xs text-ink">
            {t('বার্তা', 'Message')}
            <textarea
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              className={`${input} mt-1`}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={button} disabled={busy}>
              {t('টিকিট তৈরি করুন', 'Create ticket')}
            </button>
            <span className="text-xs text-muted">
              {t('একসাথে সর্বোচ্চ ২০টি খোলা টিকিট।', 'At most 20 open tickets at a time.')}
            </span>
          </div>
        </form>
      )}

      {notice && (
        <p role="status" className="text-xs text-ink border border-border rounded-[var(--radius-md)] bg-bg px-3 py-2">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : tickets.length === 0 ? (
        <p className="text-xs text-muted">{t('কোনো টিকিট নেই।', 'No tickets yet.')}</p>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => {
            const vendorInfo = ticket.vendorId ? vendorMap.get(ticket.vendorId) : undefined;
            return (
              <li
                key={ticket.ticketId}
                className="space-y-2.5 rounded-[var(--radius-md)] border border-border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-ink break-words">{ticket.subject}</h3>
                  <span className="text-xs text-muted tabular-nums">
                    {ticket.status === 'open' ? t('খোলা', 'Open') : t('বন্ধ', 'Closed')} ·{' '}
                    {new Date(ticket.updatedAt).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')}
                  </span>
                </div>
                {mode === 'admin' && (
                  <p className="text-xs text-muted">
                    {vendorInfo
                      ? `${locale === 'bn' ? vendorInfo.businessNameBn : vendorInfo.businessNameEn || vendorInfo.businessNameBn} · ${vendorInfo.vendorCode}`
                      : `${t('ভেন্ডর ID', 'Vendor ID')}: ${ticket.vendorId ?? '—'}`}
                  </p>
                )}
                <ol className="space-y-2">
                  {ticket.messages.map((message) => (
                    <li
                      key={message.messageId}
                      className="rounded-[var(--radius-sm)] bg-bg p-2.5 text-xs border border-border/60"
                    >
                      <div className="flex items-center justify-between gap-2 text-muted mb-1">
                        <strong className="text-ink">
                          {message.sender === 'admin' ? t('অ্যাডমিন', 'Admin') : t('ভেন্ডর', 'Vendor')}
                        </strong>
                        <span className="tabular-nums">
                          {new Date(message.createdAt).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-ink">{message.text}</p>
                    </li>
                  ))}
                </ol>
                {ticket.status === 'open' && (
                  <div className="space-y-2 pt-1">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send({
                          action: 'reply',
                          ticketId: ticket.ticketId,
                          text: replies[ticket.ticketId] || '',
                        });
                      }}
                      className="space-y-2"
                    >
                      <label className="block text-xs text-ink">
                        {t('উত্তর', 'Reply')}
                        <textarea
                          className={`${input} mt-1`}
                          required
                          rows={2}
                          maxLength={2000}
                          value={replies[ticket.ticketId] || ''}
                          onChange={(e) =>
                            setReplies((old) => ({ ...old, [ticket.ticketId]: e.target.value }))
                          }
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="submit"
                          className={button}
                          disabled={busy || ticket.messages.length >= 100}
                        >
                          {t('উত্তর পাঠান', 'Send reply')}
                        </button>
                        {mode === 'admin' &&
                          (confirmCloseId === ticket.ticketId ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                className="min-h-[44px] rounded-[var(--radius-md)] border border-danger bg-danger/10 px-3 text-xs font-semibold text-danger"
                                disabled={busy}
                                onClick={() =>
                                  void send({ action: 'close', ticketId: ticket.ticketId })
                                }
                              >
                                {t('হ্যাঁ, বন্ধ করুন', 'Confirm close')}
                              </button>
                              <button
                                type="button"
                                className={button}
                                disabled={busy}
                                onClick={() => setConfirmCloseId(null)}
                              >
                                {t('বাতিল', 'Cancel')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={button}
                              disabled={busy}
                              onClick={() => setConfirmCloseId(ticket.ticketId)}
                            >
                              {t('টিকিট বন্ধ করুন', 'Close ticket')}
                            </button>
                          ))}
                      </div>
                    </form>
                    {ticket.messages.length >= 100 && (
                      <p className="text-xs text-muted">
                        {t(
                          'বার্তার সীমা পূর্ণ; প্রয়োজন হলে নতুন টিকিট তৈরি করুন।',
                          'Message limit reached; create a new ticket if needed.'
                        )}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
