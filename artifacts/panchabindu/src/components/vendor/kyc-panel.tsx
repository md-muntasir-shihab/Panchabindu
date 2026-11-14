import * as React from 'react';

type Doc = { documentId: string; vendorId?: string; category: 'identity' | 'business' | 'other'; status: 'pending_review' | 'approved' | 'rejected'; createdAt: string; reviewedAt: string | null; reviewNote: string | null };
type Props = { locale: 'bn' | 'en'; mode: 'vendor' | 'admin' };

export function KycPanel({ locale, mode }: Props) {
  const [documents, setDocuments] = React.useState<Doc[]>([]);
  const [category, setCategory] = React.useState('identity');
  const [file, setFile] = React.useState<File | null>(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [inputKey, setInputKey] = React.useState(0);
  const t = React.useCallback((bn: string, en: string) => locale === 'bn' ? bn : en, [locale]);
  const url = mode === 'vendor' ? '/api/vendor/kyc' : '/api/admin/vendor-kyc';
  const csrfKey = mode === 'vendor' ? 'bg_vendor_csrf_token' : 'bg_admin_csrf_token';
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json() as { success?: boolean; documents?: Doc[] };
      if (!res.ok || !data.success || !Array.isArray(data.documents)) throw new Error();
      setDocuments(data.documents);
    } catch { setMessage(t('নথির তালিকা লোড করা যায়নি।', 'Could not load document list.')); }
    finally { setLoading(false); }
  }, [url, t]);
  React.useEffect(() => { void load(); }, [load]);
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMessage(t('ছবির আকার সর্বোচ্চ ৫ MB।', 'The image must be at most 5 MB.')); return; }
    setBusy(true); setMessage('');
    try {
      const body = new FormData(); body.set('category', category); body.set('file', file);
      const res = await fetch(url, { method: 'POST', headers: { 'x-csrf-token': window.sessionStorage.getItem(csrfKey) || '' }, body });
      const data = await res.json() as { success?: boolean; code?: string; errorBn?: string; errorEn?: string };
      if (!res.ok || !data.success) { setMessage(data.code === 'PRIVATE_STORAGE_UNAVAILABLE' ? t('নিরাপদ স্টোরেজ এখন উপলব্ধ নয়।', 'Private storage is unavailable.') : (locale === 'bn' ? data.errorBn : data.errorEn) || t('নথি জমা হয়নি। ছবির ধরন ও আকার পরীক্ষা করুন।', 'Upload failed. Check the image format and size.')); return; }
      setFile(null); setInputKey(n => n + 1); await load(); setMessage(t('নথি পর্যালোচনার জন্য জমা হয়েছে।', 'Document submitted for review.'));
    } catch { setMessage(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.')); }
    finally { setBusy(false); }
  }
  async function review(doc: Doc, decision: 'approved' | 'rejected') {
    const note = window.prompt(decision === 'rejected' ? t('প্রত্যাখ্যানের কারণ দিন (ব্যক্তিগত তথ্য ছাড়া)', 'Enter the rejection reason (no personal data)') : t('পর্যালোচনা নোট (ঐচ্ছিক; ব্যক্তিগত তথ্য ছাড়া)', 'Review note (optional; no personal data)'));
    if (note === null || (decision === 'rejected' && note.trim().length < 3)) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': window.sessionStorage.getItem(csrfKey) || '' }, body: JSON.stringify({ documentId: doc.documentId, decision, note: note.trim() }) });
      const data = await res.json() as { success?: boolean };
      if (!res.ok || !data.success) throw new Error();
      await load(); setMessage(t('পর্যালোচনা সংরক্ষিত হয়েছে।', 'Review saved.'));
    } catch { setMessage(t('পর্যালোচনা সংরক্ষণ করা যায়নি।', 'Could not save review.')); }
    finally { setBusy(false); }
  }
  const labels = { identity: t('পরিচয়', 'Identity'), business: t('ব্যবসা', 'Business'), other: t('অন্যান্য', 'Other') };
  return <section className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm">
    <h2 className="font-bold">{t('ব্যক্তিগত যাচাই নথি', 'Private verification documents')}</h2>
    <p className="text-xs text-muted">{t('শুধু প্রয়োজনীয় নথি দিন। JPG, PNG বা WebP, সর্বোচ্চ ৫ MB; PDF এখন গ্রহণ করা হয় না। নথি ব্যক্তিগত থাকে এবং অনুমোদন স্বয়ংক্রিয় নয়।', 'Submit only necessary documents. JPG, PNG or WebP up to 5 MB; PDF is not supported. Documents remain private and approval is not automatic.')}</p>
    {mode === 'vendor' && <form onSubmit={upload} className="flex flex-wrap items-end gap-2">
      <label className="text-xs">{t('ধরন', 'Category')}<select className="block min-h-[44px] border border-border rounded bg-bg px-2" value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">{t('ছবি', 'Image')}<input key={inputKey} className="block max-w-full min-h-[44px]" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} required /></label>
      <button className="min-h-[44px] rounded border border-border px-3" disabled={busy || !file}>{t('নথি জমা দিন', 'Submit document')}</button>
    </form>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {loading ? <p>{t('লোড হচ্ছে…', 'Loading…')}</p> : documents.length === 0 ? <p className="text-xs text-muted">{t('কোনো নথি জমা নেই।', 'No documents submitted.')}</p> : <ul className="space-y-3">{documents.map(doc => <li key={doc.documentId} className="border border-border rounded p-3 space-y-2 text-xs">
      <div className="flex flex-wrap gap-2"><strong>{labels[doc.category]}</strong><span>{doc.status === 'approved' ? t('অনুমোদিত', 'Approved') : doc.status === 'rejected' ? t('প্রত্যাখ্যাত', 'Rejected') : t('পর্যালোচনাধীন', 'Pending review')}</span>{mode === 'admin' && <span className="break-all">{t('ভেন্ডর ID', 'Vendor ID')}: {doc.vendorId}</span>}</div>
      {doc.reviewNote && <p className="break-words">{t('রিভিউ নোট', 'Review note')}: {doc.reviewNote}</p>}
      <div className="flex flex-wrap gap-2"><a className="inline-flex min-h-[44px] items-center rounded border border-border px-3" href={`${url}?documentId=${encodeURIComponent(doc.documentId)}`}>{t('নিরাপদে ডাউনলোড', 'Download securely')}</a>
      {mode === 'admin' && doc.status === 'pending_review' && <><button type="button" className="min-h-[44px] rounded border border-border px-3" disabled={busy} onClick={() => void review(doc, 'approved')}>{t('অনুমোদন', 'Approve')}</button><button type="button" className="min-h-[44px] rounded border border-border px-3" disabled={busy} onClick={() => void review(doc, 'rejected')}>{t('প্রত্যাখ্যান', 'Reject')}</button></>}</div>
    </li>)}</ul>}
  </section>;
}
