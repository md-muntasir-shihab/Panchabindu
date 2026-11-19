import * as React from 'react';
import { adminFetch } from '@/lib/admin/admin-fetch';

type Doc = {
  documentId: string;
  vendorId?: string;
  category: 'identity' | 'business' | 'other';
  status: 'pending_review' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
};

type Props = {
  locale: 'bn' | 'en';
  mode: 'vendor' | 'admin';
};

export function KycPanel({ locale, mode }: Props) {
  const [documents, setDocuments] = React.useState<Doc[]>([]);
  const [category, setCategory] = React.useState('identity');
  const [file, setFile] = React.useState<File | null>(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [inputKey, setInputKey] = React.useState(0);
  const [reviewingDoc, setReviewingDoc] = React.useState<{
    documentId: string;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [reviewNote, setReviewNote] = React.useState('');

  const t = React.useCallback((bn: string, en: string) => (locale === 'bn' ? bn : en), [locale]);
  const url = mode === 'vendor' ? '/api/vendor/kyc' : '/api/admin/vendor-kyc';
  const fetcher = mode === 'admin' ? adminFetch : fetch;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher(url, { cache: 'no-store' });
      const data = (await res.json()) as { success?: boolean; documents?: Doc[] };
      if (!res.ok || !data.success || !Array.isArray(data.documents)) throw new Error();
      setDocuments(data.documents);
    } catch {
      setMessage(t('নথির তালিকা লোড করা যায়নি।', 'Could not load document list.'));
    } finally {
      setLoading(false);
    }
  }, [fetcher, url, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage(t('ছবির আকার সর্বোচ্চ ৫ MB।', 'The image must be at most 5 MB.'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const body = new FormData();
      body.set('category', category);
      body.set('file', file);
      const headers: Record<string, string> = {};
      if (mode === 'vendor') {
        headers['x-csrf-token'] = window.sessionStorage.getItem('bg_vendor_csrf_token') || '';
      }
      const res = await fetcher(url, { method: 'POST', headers, body });
      const data = (await res.json()) as {
        success?: boolean;
        code?: string;
        errorBn?: string;
        errorEn?: string;
      };
      if (!res.ok || !data.success) {
        setMessage(
          data.code === 'PRIVATE_STORAGE_UNAVAILABLE'
            ? t('নিরাপদ স্টোরেজ এখন উপলব্ধ নয়।', 'Private storage is unavailable.')
            : (locale === 'bn' ? data.errorBn : data.errorEn) ||
                t(
                  'নথি জমা হয়নি। ছবির ধরন ও আকার পরীক্ষা করুন।',
                  'Upload failed. Check the image format and size.'
                )
        );
        return;
      }
      setFile(null);
      setInputKey((n) => n + 1);
      await load();
      setMessage(t('নথি পর্যালোচনার জন্য জমা হয়েছে।', 'Document submitted for review.'));
    } catch {
      setMessage(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewingDoc) return;
    const trimmed = reviewNote.trim();
    if (reviewingDoc.decision === 'rejected' && trimmed.length < 3) {
      setMessage(
        t(
          'প্রত্যাখ্যানের জন্য কমপক্ষে ৩ অক্ষরের কারণ লিখুন।',
          'Enter at least 3 characters explaining the rejection.'
        )
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: reviewingDoc.documentId,
          decision: reviewingDoc.decision,
          note: trimmed,
        }),
      });
      const data = (await res.json()) as { success?: boolean };
      if (!res.ok || !data.success) throw new Error();
      setReviewingDoc(null);
      setReviewNote('');
      await load();
      setMessage(t('পর্যালোচনা সংরক্ষিত হয়েছে।', 'Review saved.'));
    } catch {
      setMessage(t('পর্যালোচনা সংরক্ষণ করা যায়নি।', 'Could not save review.'));
    } finally {
      setBusy(false);
    }
  }

  const labels = {
    identity: t('পরিচয়', 'Identity'),
    business: t('ব্যবসা', 'Business'),
    other: t('অন্যান্য', 'Other'),
  };

  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm">
      <div>
        <h2 className="font-semibold text-ink">
          {t('ব্যক্তিগত যাচাই নথি', 'Private verification documents')}
        </h2>
        <p className="text-xs text-muted mt-1">
          {t(
            'শুধু প্রয়োজনীয় নথি দিন। JPG, PNG বা WebP, সর্বোচ্চ ৫ MB; PDF এখন গ্রহণ করা হয় না। নথি ব্যক্তিগত থাকে এবং অনুমোদন স্বয়ংক্রিয় নয়।',
            'Submit only necessary documents. JPG, PNG or WebP up to 5 MB; PDF is not supported. Documents remain private and approval is not automatic.'
          )}
        </p>
      </div>

      {mode === 'vendor' && (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink">
            {t('ধরন', 'Category')}
            <select
              className="mt-1 block min-h-[44px] rounded-[var(--radius-md)] border border-border bg-bg px-2 text-ink"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink">
            {t('ছবি', 'Image')}
            <input
              key={inputKey}
              className="mt-1 block max-w-full min-h-[44px]"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <button
            type="submit"
            className="min-h-[44px] rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium text-ink hover:bg-bg disabled:opacity-50"
            disabled={busy || !file}
          >
            {t('নথি জমা দিন', 'Submit document')}
          </button>
        </form>
      )}

      {message && (
        <p role="status" className="text-xs text-ink border border-border rounded-[var(--radius-md)] bg-bg px-3 py-2">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : documents.length === 0 ? (
        <p className="text-xs text-muted">{t('কোনো নথি জমা নেই।', 'No documents submitted.')}</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => {
            const isReviewing = reviewingDoc?.documentId === doc.documentId;
            return (
              <li
                key={doc.documentId}
                className="border border-border rounded-[var(--radius-md)] p-3 space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2 text-muted">
                  <strong className="text-ink">{labels[doc.category]}</strong>
                  <span>·</span>
                  <span className="text-ink">
                    {doc.status === 'approved'
                      ? t('অনুমোদিত', 'Approved')
                      : doc.status === 'rejected'
                        ? t('প্রত্যাখ্যাত', 'Rejected')
                        : t('পর্যালোচনাধীন', 'Pending review')}
                  </span>
                  {mode === 'admin' && doc.vendorId && (
                    <>
                      <span>·</span>
                      <span className="break-all">
                        {t('ভেন্ডর ID', 'Vendor ID')}: {doc.vendorId}
                      </span>
                    </>
                  )}
                </div>
                {doc.reviewNote && (
                  <p className="break-words text-ink">
                    {t('রিভিউ নোট', 'Review note')}: {doc.reviewNote}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <a
                    className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] border border-border px-3 text-ink hover:bg-bg"
                    href={`${url}?documentId=${encodeURIComponent(doc.documentId)}`}
                  >
                    {t('নিরাপদে ডাউনলোড', 'Download securely')}
                  </a>
                  {mode === 'admin' && doc.status === 'pending_review' && (
                    <>
                      <button
                        type="button"
                        className="min-h-[44px] rounded-[var(--radius-md)] border border-border px-3 text-ink hover:bg-bg disabled:opacity-50"
                        disabled={busy}
                        onClick={() => {
                          setReviewingDoc({ documentId: doc.documentId, decision: 'approved' });
                          setReviewNote('');
                        }}
                      >
                        {t('অনুমোদন', 'Approve')}
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] rounded-[var(--radius-md)] border border-danger/40 px-3 text-danger hover:bg-danger/10 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => {
                          setReviewingDoc({ documentId: doc.documentId, decision: 'rejected' });
                          setReviewNote('');
                        }}
                      >
                        {t('প্রত্যাখ্যান', 'Reject')}
                      </button>
                    </>
                  )}
                </div>

                {isReviewing && reviewingDoc && (
                  <form
                    onSubmit={submitReview}
                    className="mt-2 pt-2 border-t border-border space-y-2"
                  >
                    <label className="block text-xs text-ink">
                      {reviewingDoc.decision === 'rejected'
                        ? t(
                            'প্রত্যাখ্যানের কারণ (কমপক্ষে ৩ অক্ষর, ব্যক্তিগত তথ্য ছাড়া) *',
                            'Rejection reason (min 3 chars, no personal data) *'
                          )
                        : t(
                            'পর্যালোচনা নোট (ঐচ্ছিক, ব্যক্তিগত তথ্য ছাড়া)',
                            'Review note (optional, no personal data)'
                          )}
                      <input
                        type="text"
                        required={reviewingDoc.decision === 'rejected'}
                        minLength={reviewingDoc.decision === 'rejected' ? 3 : 0}
                        maxLength={300}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        className="mt-1 block w-full min-h-[44px] rounded-[var(--radius-md)] border border-border bg-bg px-3 text-ink"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="min-h-[44px] rounded-[var(--radius-md)] bg-ink text-bg px-4 text-xs font-semibold disabled:opacity-50"
                      >
                        {reviewingDoc.decision === 'approved'
                          ? t('অনুমোদন নিশ্চিত করুন', 'Confirm approval')
                          : t('প্রত্যাখ্যান নিশ্চিত করুন', 'Confirm rejection')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setReviewingDoc(null);
                          setReviewNote('');
                        }}
                        className="min-h-[44px] rounded-[var(--radius-md)] border border-border px-3 text-xs text-ink"
                      >
                        {t('বাতিল', 'Cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
