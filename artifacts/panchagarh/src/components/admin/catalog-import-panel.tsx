'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin/admin-fetch';
import { formatLocaleNumber, type Locale } from '@/lib/i18n/dictionaries';
import { CATALOG_IMPORT_COLUMNS, parseCatalogCsv } from '@/lib/media/csv';

interface Preview {
  previewHash: string; rowCount: number; errors: Array<{ row: number; code: string }>;
  items: Array<{ nameBn: string; nameEn: string; sku: string }>;
}

export function CatalogImportPanel({ locale, onComplete }: { locale: Locale; onComplete: () => Promise<void> }) {
  const bn = locale === 'bn';
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<'success' | 'failure' | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const updateCsv = (text: string) => {
    setCsv(text); setPreview(null); setMapping({});
    try { setHeaders(parseCatalogCsv(text)[0] ?? []); }
    catch { setHeaders([]); }
  };
  const errorMessage = (code: string) => {
    const messages: Record<string, [string, string]> = {
      DUPLICATE_CATALOG_ITEM: ['পণ্য, SKU বা slug পুনরাবৃত্তি হয়েছে।', 'Duplicate product, SKU or slug.'],
      UNKNOWN_CATEGORY: ['ক্যাটাগরি পাওয়া যায়নি।', 'Category not found.'],
      UNKNOWN_VENDOR: ['সক্রিয় ভেন্ডর পাওয়া যায়নি।', 'Active vendor not found.'],
      INVALID_CATALOG_ROW: ['নাম, পরিমাণ, ওজন ও মূল্য যাচাই করুন।', 'Check names, quantities, weight and prices.'],
      CSV_COLUMN_COUNT: ['কলামের সংখ্যা হেডারের সঙ্গে মেলে না।', 'The number of columns does not match the header.'],
    };
    return (messages[code] ?? ['এই সারির তথ্য যাচাই করুন।', 'Check this row.'])[bn ? 0 : 1];
  };

  async function submit(mode: 'preview' | 'commit') {
    setBusy(true); setMessage(null);
    try {
      const response = await adminFetch('/api/catalog/import', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, csv, mapping, previewHash: preview?.previewHash }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('IMPORT_FAILED');
      if (mode === 'preview') setPreview(data);
      else { setMessage('success'); setPreview(null); setCsv(''); await onComplete(); }
    } catch { setMessage('failure'); }
    finally { setBusy(false); }
  }

  return <details className="rounded border border-border bg-surface p-4">
    <summary className="cursor-pointer font-semibold">{bn ? 'CSV থেকে ড্রাফট পণ্য আমদানি' : 'Import draft products from CSV'}</summary>
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted">{bn ? 'সর্বোচ্চ ২০০ পণ্য। প্রিভিউ যাচাই করে সংরক্ষণ করুন। SKU বা পণ্য পুনরাবৃত্তি গ্রহণ করা হবে না; স্টক আলাদাভাবে QC শেষে যোগ করুন।' : 'Up to 200 products. Review the preview before saving. Duplicate SKUs or products are rejected; receive stock separately after QC.'}</p>
      <p className="break-all text-xs text-muted">vendor_id, category_id, name_bn, name_en, public_sku, variant_bn, variant_en, supplier_cost_bdt, supplier_profit_bdt, sale_price_bdt, weight_grams</p>
      <input type="file" accept=".csv,text/csv" aria-label={bn ? 'CSV ফাইল নির্বাচন করুন' : 'Choose CSV file'} disabled={busy} onChange={async event => {
        const file = event.currentTarget.files?.[0];
        setPreview(null); setMessage(null);
        if (!file) return;
        if (file.size > 256 * 1024) { setMessage('failure'); return; }
        updateCsv(await file.text());
      }} />
      <textarea rows={4} value={csv} disabled={busy} aria-label={bn ? 'CSV তথ্য' : 'CSV contents'} className="w-full rounded border border-border bg-bg p-2 text-xs" onChange={event => updateCsv(event.target.value)} />
      {headers.length > 0 && <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">{bn ? 'CSV কলাম মিলিয়ে নিন' : 'Map CSV columns'}</legend>{CATALOG_IMPORT_COLUMNS.map(column => <label key={column} className="text-xs">{column}<select className="ml-2 rounded border border-border bg-bg p-2" disabled={busy} value={mapping[column] ?? headers.find(header => header.toLowerCase() === column) ?? ''} onChange={event => { setMapping(current => ({ ...current, [column]: event.target.value })); setPreview(null); }}><option value="">{bn ? 'কলাম নির্বাচন করুন' : 'Choose column'}</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</fieldset>}
      <button type="button" disabled={busy || !csv} onClick={() => void submit('preview')} className="rounded border border-border px-3 py-2 text-sm disabled:opacity-50">{bn ? 'যাচাই ও প্রিভিউ' : 'Validate and preview'}</button>
      {preview && <div className="space-y-2 text-sm">
        <p>{bn ? 'মোট সারি:' : 'Rows:'} {formatLocaleNumber(preview.rowCount, locale)}</p>
        {preview.errors.map(error => <p key={error.row} className="text-danger">{bn ? 'সারি' : 'Row'} {formatLocaleNumber(error.row, locale)}: {errorMessage(error.code)}</p>)}
        <ul>{preview.items.slice(0, 10).map(item => <li key={item.sku}>{bn ? item.nameBn : item.nameEn} · {item.sku}</li>)}</ul>
        <button type="button" disabled={busy || preview.errors.length > 0 || !preview.items.length} onClick={() => void submit('commit')} className="rounded bg-ink px-4 py-2 text-bg disabled:opacity-50">{bn ? 'প্রিভিউ অনুমোদন ও ড্রাফট সংরক্ষণ' : 'Approve preview and save drafts'}</button>
      </div>}
      {message && <p role="status" className={message === 'success' ? 'text-success' : 'text-danger'}>{message === 'success' ? (bn ? 'ড্রাফট পণ্যগুলো সংরক্ষিত হয়েছে।' : 'Draft products were saved.') : (bn ? 'আমদানি হয়নি। ফাইল, অনুমতি ও সারির তথ্য যাচাই করে আবার চেষ্টা করুন।' : 'Import failed. Check the file, permissions and row details, then retry.')}</p>}
    </div>
  </details>;
}
