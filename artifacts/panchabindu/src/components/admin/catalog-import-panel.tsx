'use client';

import { useId, useState } from 'react';
import { adminFetch } from '@/lib/admin/admin-fetch';
import { formatLocaleNumber, type Locale } from '@/lib/i18n/dictionaries';
import { CATALOG_IMPORT_COLUMNS, parseCatalogCsv } from '@/lib/media/csv';

interface Preview {
  previewHash: string;
  rowCount: number;
  errors: Array<{ row: number; code: string }>;
  items: Array<{ nameBn: string; nameEn: string; sku: string }>;
}

export function CatalogImportPanel({
  locale,
  onComplete,
}: {
  locale: Locale;
  onComplete: () => Promise<void>;
}) {
  const idPrefix = useId();
  const bn = locale === 'bn';
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<'success' | 'failure' | 'file_too_large' | null>(null);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const updateCsv = (text: string) => {
    setCsv(text);
    setPreview(null);
    setMapping({});
    setMessage(null);
    setFailureDetail(null);
    try {
      setHeaders(parseCatalogCsv(text)[0] ?? []);
    } catch {
      setHeaders([]);
    }
  };

  const errorMessage = (code: string) => {
    const messages: Record<string, [string, string]> = {
      DUPLICATE_CATALOG_ITEM: [
        'পণ্য, SKU বা slug পুনরাবৃত্তি হয়েছে।',
        'Duplicate product, SKU or slug.',
      ],
      UNKNOWN_CATEGORY: ['ক্যাটাগরি পাওয়া যায়নি।', 'Category not found.'],
      UNKNOWN_VENDOR: ['সক্রিয় ভেন্ডর পাওয়া যায়নি।', 'Active vendor not found.'],
      INVALID_CATALOG_ROW: [
        'নাম, পরিমাণ, ওজন ও মূল্য যাচাই করুন।',
        'Check names, quantities, weight and prices.',
      ],
      CSV_COLUMN_COUNT: [
        'কলামের সংখ্যা হেডারের সঙ্গে মেলে না।',
        'The number of columns does not match the header.',
      ],
    };
    return (messages[code] ?? ['এই সারির তথ্য যাচাই করুন।', 'Check this row.'])[bn ? 0 : 1];
  };

  async function submit(mode: 'preview' | 'commit') {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setFailureDetail(null);
    try {
      const response = await adminFetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, csv, mapping, previewHash: preview?.previewHash }),
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error((bn ? data?.errorBn : data?.errorEn) || 'IMPORT_FAILED');
      if (mode === 'preview') {
        setPreview(data);
      } else {
        setMessage('success');
        setPreview(null);
        setCsv('');
        setHeaders([]);
        setMapping({});
        await onComplete();
      }
    } catch (error) {
      setMessage('failure');
      const detail = error instanceof Error ? error.message : '';
      setFailureDetail(detail && detail !== 'IMPORT_FAILED' ? detail : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded border border-border bg-surface p-4">
      <summary className="min-h-11 flex items-center cursor-pointer font-semibold text-sm text-ink">
        {bn ? 'CSV থেকে ড্রাফট পণ্য আমদানি' : 'Import draft products from CSV'}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted">
          {bn
            ? 'সর্বোচ্চ ২০০ পণ্য। প্রিভিউ যাচাই করে সংরক্ষণ করুন। SKU বা পণ্য পুনরাবৃত্তি গ্রহণ করা হবে না; স্টক আলাদাভাবে QC শেষে যোগ করুন।'
            : 'Up to 200 products. Review the preview before saving. Duplicate SKUs or products are rejected; receive stock separately after QC.'}
        </p>
        <p className="break-all font-mono text-xs text-muted">
          vendor_id, category_id, name_bn, name_en, public_sku, variant_bn, variant_en,
          supplier_cost_bdt, supplier_profit_bdt, sale_price_bdt, weight_grams
        </p>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-csv-file`} className="block text-xs font-semibold text-ink">
            {bn ? 'CSV ফাইল আপলোড (সর্বোচ্চ ২৫৬ KB)' : 'Upload CSV file (max 256 KB)'}
          </label>
          <input
            id={`${idPrefix}-csv-file`}
            className="block w-full min-w-0 max-w-full text-xs"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              setPreview(null);
              setMessage(null);
              setFailureDetail(null);
              if (!file) return;
              if (file.size > 256 * 1024) {
                setMessage('file_too_large');
                return;
              }
              updateCsv(await file.text());
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-csv-text`} className="block text-xs font-semibold text-ink">
            {bn ? 'অথবা CSV তথ্য পেস্ট করুন' : 'Or paste CSV contents'}
          </label>
          <textarea
            id={`${idPrefix}-csv-text`}
            rows={4}
            value={csv}
            disabled={busy}
            className="w-full rounded border border-border bg-bg p-2.5 text-base lg:text-xs font-mono text-ink"
            onChange={(event) => updateCsv(event.target.value)}
          />
        </div>
        {headers.length > 0 && (
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-ink">
              {bn ? 'CSV কলাম মিলিয়ে নিন' : 'Map CSV columns'}
            </legend>
            {CATALOG_IMPORT_COLUMNS.map((column) => (
              <label key={column} htmlFor={`${idPrefix}-col-${column}`} className="block min-w-0 text-xs break-words">
                <span className="font-mono text-ink">{column}</span>
                <select
                  id={`${idPrefix}-col-${column}`}
                  className="mt-1 block w-full min-h-11 min-w-0 max-w-full rounded border border-border bg-bg p-2 text-base lg:text-xs text-ink"
                  disabled={busy}
                  value={mapping[column] ?? headers.find((header) => header.toLowerCase() === column) ?? ''}
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [column]: event.target.value }));
                    setPreview(null);
                  }}
                >
                  <option value="">{bn ? 'কলাম নির্বাচন করুন' : 'Choose column'}</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        )}
        <button
          type="button"
          disabled={busy || !csv.trim()}
          onClick={() => void submit('preview')}
          className="min-h-11 rounded border border-border bg-bg px-4 py-2 text-xs font-semibold text-ink hover:border-ink disabled:opacity-50"
        >
          {bn ? 'যাচাই ও প্রিভিউ' : 'Validate and preview'}
        </button>
        {preview && (
          <div className="space-y-2 text-xs border-t border-border pt-3">
            <p className="font-semibold text-ink">
              {bn ? 'মোট সারি:' : 'Rows:'} {formatLocaleNumber(preview.rowCount, locale)}
            </p>
            {preview.errors.map((error) => (
              <p key={`${error.row}-${error.code}`} className="text-danger">
                {bn ? 'সারি' : 'Row'} {formatLocaleNumber(error.row, locale)}:{' '}
                {errorMessage(error.code)}
              </p>
            ))}
            {preview.items.length > 0 && (
              <ul className="list-disc pl-5 space-y-0.5 text-ink">
                {preview.items.slice(0, 10).map((item) => (
                  <li key={item.sku}>
                    {bn ? item.nameBn : item.nameEn} · <span className="font-mono">{item.sku}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={busy || preview.errors.length > 0 || !preview.items.length}
              onClick={() => void submit('commit')}
              className="min-h-11 rounded bg-ink px-4 py-2 text-xs font-bold text-bg disabled:opacity-50"
            >
              {bn ? 'প্রিভিউ অনুমোদন ও ড্রাফট সংরক্ষণ' : 'Approve preview and save drafts'}
            </button>
          </div>
        )}
        {message && (
          <p
            role={message === 'success' ? 'status' : 'alert'}
            className={
              message === 'success'
                ? 'text-xs font-medium text-emerald-800'
                : 'text-xs font-medium text-danger'
            }
          >
            {message === 'success'
              ? bn
                ? 'ড্রাফট পণ্যগুলো সংরক্ষিত হয়েছে।'
                : 'Draft products were saved.'
              : message === 'file_too_large'
              ? bn
                ? 'CSV ফাইলের আকার ২৫৬ KB এর বেশি হতে পারবে না।'
                : 'CSV file size must not exceed 256 KB.'
              : bn
              ? 'আমদানি হয়নি। ফাইল, অনুমতি ও সারির তথ্য যাচাই করে আবার চেষ্টা করুন।'
              : 'Import failed. Check the file, permissions and row details, then retry.'}
          </p>
        )}
        {message === 'failure' && failureDetail && (
          <p className="text-xs font-medium text-danger">{failureDetail}</p>
        )}
      </div>
    </details>
  );
}