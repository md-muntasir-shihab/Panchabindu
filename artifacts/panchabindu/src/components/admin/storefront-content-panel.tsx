'use client';

import * as React from 'react';
import { Link } from 'wouter';
import type { SiteSettingsRecord } from '@/lib/db/repository';
import { getStorefrontConfig, storefrontContentSchema, type StorefrontContent } from '@/lib/storefront/storefront-config';
import { adminFetch } from '@/lib/admin/admin-fetch';
import { useLocaleStore } from '@/store/use-locale-store';

const labels: Record<string, [string, string]> = {
  brandNameBn: ['নাম (বাংলা)', 'Name (Bangla)'], brandNameEn: ['নাম (ইংরেজি)', 'Name (English)'],
  taglineBn: ['ট্যাগলাইন (বাংলা)', 'Tagline (Bangla)'], taglineEn: ['ট্যাগলাইন (ইংরেজি)', 'Tagline (English)'],
  supportPhone: ['সাপোর্ট ফোন', 'Support phone'], supportEmail: ['সাপোর্ট ইমেইল', 'Support email'], whatsappNumber: ['হোয়াটসঅ্যাপ (দেশের কোডসহ)', 'WhatsApp (country code + number)'],
  maintenanceMessageBn: ['মেইনটেন্যান্স বার্তা (বাংলা)', 'Maintenance message (Bangla)'], maintenanceMessageEn: ['মেইনটেন্যান্স বার্তা (ইংরেজি)', 'Maintenance message (English)'],
  delayBanner: ['ঘোষণা বার', 'Announcement bar'], promoCampaign: ['কুপন ব্যানার', 'Coupon banner'], trustBadges: ['সেবার তথ্য', 'Service highlights'], heroBanners: ['হোমপেজ ব্যানার', 'Hero banners'],
  homepageSections: ['হোমপেজ সেকশন ও ক্রম', 'Homepage sections & order'], legalPages: ['নীতিমালা পেজ', 'Policy pages'], storefront: ['লোগো, ডিজাইন, মেনু ও SEO', 'Logo, design, menus & SEO'],
  logoUrl: ['লোগোর URL', 'Logo URL'], faviconUrl: ['ব্রাউজার আইকনের URL', 'Favicon URL'], logoWidth: ['লোগোর প্রস্থ (px)', 'Logo width (px)'],
  showBrandName: ['নাম দেখান', 'Show store name'], showTagline: ['হেডারে ট্যাগলাইন দেখান', 'Show header tagline'], showSupportPhone: ['হেডারে ফোন দেখান', 'Show header phone'], showWhatsApp: ['হোয়াটসঅ্যাপ বাটন দেখান', 'Show WhatsApp button'],
  accentColor: ['বাটন ও হাইলাইটের রং', 'Button & accent colour'], navigation: ['প্রধান মেনু', 'Main menu'], footerLinks: ['ফুটারের লিংক', 'Footer links'], socialLinks: ['সামাজিক যোগাযোগের লিংক', 'Social links'],
  enabled: ['চালু', 'Enabled'], href: ['লিংক', 'Link'], ctaHref: ['বাটনের লিংক', 'Button link'], imageUrl: ['ছবির URL', 'Image URL'], order: ['ক্রম (ছোটটি আগে)', 'Order (lowest first)'], type: ['সেকশনের ধরন', 'Section type'], id: ['পরিচিতি', 'ID'], code: ['সক্রিয় কুপনের কোড', 'Active coupon code'],
};
const pairs: Record<string, string> = { label: 'লেবেল', title: 'শিরোনাম', subtitle: 'উপশিরোনাম', ctaLabel: 'বাটনের লেখা', badge: 'ব্যাজ', desc: 'বিবরণ', message: 'বার্তা', discountLabel: 'ছাড়ের লেখা', content: 'বিস্তারিত', footerText: 'ফুটারের বিবরণ', copyright: 'কপিরাইট ({year}, {brand})', footerNote: 'ফুটারের নিচের বার্তা', collectionTitle: 'পণ্যসম্ভারের শিরোনাম', collectionSubtitle: 'পণ্যসম্ভারের বিবরণ', seoTitle: 'SEO টাইটেল', seoDescription: 'SEO বিবরণ' };
const sections = ['hero', 'trust_strip', 'categories', 'featured_products', 'promo_banner', 'new_arrivals', 'best_sellers'];
const bilingual = (stems: string[]) => Object.fromEntries(stems.flatMap(k => [[`${k}Bn`, ''], [`${k}En`, '']]));
const makeItem = (key: string) => {
  const id = crypto.randomUUID();
  if (['navigation', 'footerLinks', 'socialLinks'].includes(key)) return { id, labelBn: 'নতুন লিংক', labelEn: 'New link', href: '/shop', enabled: true };
  if (key === 'heroBanners') return { id, ...bilingual(['title', 'subtitle', 'ctaLabel', 'badge']), ctaHref: '/shop', imageUrl: '' };
  if (key === 'trustBadges') return { id, ...bilingual(['label', 'desc']) };
  return { id, type: 'hero', enabled: false, order: 0, titleBn: '', titleEn: '' };
};
function initialContent(settings: SiteSettingsRecord): StorefrontContent {
  return storefrontContentSchema.parse({ ...settings, storefront: getStorefrontConfig(settings), maintenanceMessageEn: settings.maintenanceMessageEn ?? 'We will be back shortly. Please try again later.' });
}

function ImagePreview({ src, label, bn }: { src: string; label: string; bn: boolean }) {
  const [failed, setFailed] = React.useState(false);
  return failed ? <span role="alert" className="text-xs text-danger">{bn ? 'ছবি দেখা যাচ্ছে না—সরাসরি সর্বজনীন HTTPS ছবির লিংক দিন।' : 'Image unavailable—use a direct public HTTPS image URL.'}</span> : <img src={src} alt={label} width={100} height={60} onError={() => setFailed(true)} className="h-14 w-24 object-contain rounded bg-white border border-border" loading="lazy" decoding="async" />;
}

export function StorefrontContentPanel({ siteSettings, onRefresh }: { siteSettings: SiteSettingsRecord; onRefresh: () => Promise<void> }) {
  const locale = useLocaleStore(s => s.adminLocale);
  const bn = locale === 'bn';
  const [draft, setDraft] = React.useState(() => initialContent(siteSettings));
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState('');
  const [newSlug, setNewSlug] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const label = (key: string) => {
    if (labels[key]) return labels[key][bn ? 0 : 1];
    const stem = key.replace(/(Bn|En)$/, '');
    const lang = key.endsWith('Bn') ? 'বাংলা / Bangla' : 'English';
    return pairs[stem] ? `${bn ? pairs[stem] : stem.replace(/([A-Z])/g, ' $1')} (${lang})` : key.replace(/([A-Z])/g, ' $1');
  };
  const change = (path: string[], value: unknown) => {
    setDraft(current => {
      const next = structuredClone(current);
      let cursor = next as unknown as Record<string, unknown>;
      for (const part of path.slice(0, -1)) cursor = cursor[part] as Record<string, unknown>;
      cursor[path.at(-1)!] = value;
      return next;
    });
    setDirty(true);
  };
  const upload = async (file: File, path: string[]) => {
    setBusy(true); setFeedback('');
    try {
      const form = new FormData(); form.set('file', file);
      const response = await adminFetch('/api/admin/brand-media', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error((bn ? result.errorBn : result.errorEn) || result.code || 'Upload failed');
      change(path, result.url);
      setFeedback(bn ? 'ছবি আপলোড হয়েছে। প্রকাশ করতে নিচের সেভ বাটন চাপুন।' : 'Image uploaded. Save below to publish the change.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Upload failed'); } finally { setBusy(false); }
  };
  const fieldClass = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30';
  const renderField = (value: unknown, path: string[]): React.ReactNode => {
    const key = path.at(-1)!;
    const inputId = `store-${path.join('-')}`;
    if (typeof value === 'boolean') return <label key={inputId} className="flex items-center gap-2 text-sm py-2"><input type="checkbox" checked={value} onChange={e => change(path, e.target.checked)} />{label(key)}</label>;
    if (Array.isArray(value)) return <fieldset key={inputId} className="space-y-3 rounded-xl border border-border p-3"><legend className="px-1 font-semibold text-sm">{label(key)}</legend>{value.map((item, index) => <div key={item.id ?? index} className="space-y-3 rounded-lg border border-border bg-bg/50 p-3"><div className="flex justify-between gap-3 text-xs"><span>{index + 1}. {item.titleEn || item.labelEn || item.type || item.id}</span><button type="button" className="text-danger underline" onClick={() => change(path, value.filter((_, i) => i !== index))}>{bn ? 'সরান' : 'Remove'}</button></div>{renderField(item, [...path, String(index)])}</div>)}<button type="button" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold" onClick={() => change(path, [...value, makeItem(key)])}>+ {bn ? 'যোগ করুন' : 'Add item'}</button></fieldset>;
    if (key === 'legalPages' && value && typeof value === 'object') return <div className="space-y-4">{Object.entries(value).map(([slug, page]) => <fieldset key={slug} className="border border-border rounded-xl p-3 space-y-3"><legend className="text-sm px-2">{slug}</legend>{renderField(page, [...path, slug])}<button type="button" className="text-danger underline text-xs" onClick={() => change(path, Object.fromEntries(Object.entries(value).filter(([k]) => k !== slug)))}>{bn ? 'পেজ সরান' : 'Remove page'}</button></fieldset>)}</div>;
    if (value && typeof value === 'object') return <div key={inputId} className="grid gap-3 sm:grid-cols-2">{Object.entries(value).map(([k, v]) => renderField(v, [...path, k]))}</div>;
    const isImage = ['logoUrl', 'faviconUrl', 'socialImageUrl', 'imageUrl'].includes(key);
    return <div key={inputId} className={/content|footerText|seoDescription/.test(key) ? 'sm:col-span-2 space-y-1' : 'space-y-1'}><label htmlFor={inputId} className="block text-xs font-medium">{label(key)}</label>{key === 'type' ? <select id={inputId} className={fieldClass} value={String(value)} onChange={e => change(path, e.target.value)}>{sections.map(type => <option key={type} value={type}>{type}</option>)}</select> : /content|Paragraph|footerText/.test(key) ? <textarea id={inputId} className={fieldClass} rows={4} value={String(value ?? '')} onChange={e => change(path, e.target.value)} /> : <input id={inputId} className={fieldClass} type={typeof value === 'number' ? 'number' : key === 'accentColor' ? 'color' : 'text'} readOnly={key === 'id'} value={String(value ?? '')} onChange={e => change(path, typeof value === 'number' ? Number(e.target.value) : e.target.value)} />}{isImage && <div className="flex flex-wrap items-center gap-3 py-1">{typeof value === 'string' && value && <ImagePreview key={value} src={value} label={label(key)} bn={bn} />}<label className="text-xs underline cursor-pointer">{bn ? 'ছবি আপলোড' : 'Upload image'}<input className="sr-only" aria-label={bn ? 'ছবি নির্বাচন করুন' : 'Choose image'} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, path); e.target.value = ''; }} /></label></div>}</div>;
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setFeedback('');
    const parsed = storefrontContentSchema.safeParse(draft);
    if (!parsed.success) { setFeedback(parsed.error.issues.map(v => `${v.path.join('.')}: ${v.message}`).join('\n')); return; }
    setBusy(true);
    try {
      const response = await adminFetch('/api/admin/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'update_storefront_content', content: parsed.data }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error((bn ? result.errorBn : result.errorEn) || 'Save failed');
      setDraft(initialContent(result.siteSettings)); setDirty(false); await onRefresh();
      setFeedback(bn ? 'স্টোরের সেটিংস সেভ হয়েছে। স্টোর খুলে পরিবর্তন দেখুন।' : 'Store settings saved. Open the store to see your changes.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Save failed'); } finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6 space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{bn ? 'স্টোর ডিজাইন ও কনটেন্ট' : 'Store design & content'}</h2><p className="text-sm text-muted mt-1">{bn ? 'লোগো, পরিচয়, মেনু, ব্যানার, সেকশন, নীতিমালা ও সার্চ প্রিভিউ।' : 'Logo, identity, menus, banners, sections, policies and search previews.'}</p></div><Link href="/" target="_blank" rel="noopener" className="text-sm underline">{bn ? 'স্টোর খুলুন ↗' : 'Open store ↗'}</Link></div><form onSubmit={save} className="space-y-4">{Object.entries(draft).map(([key, value]) => typeof value === 'object' ? <details key={key} className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold text-sm">{label(key)}</summary><div className="pt-4">{renderField(value, [key])}{key === 'legalPages' && <div className="mt-4 flex gap-2"><input aria-label={bn ? 'নতুন পেজের পরিচিতি' : 'New page slug'} className={fieldClass} placeholder="delivery_policy" value={newSlug} onChange={e => setNewSlug(e.target.value)} /><button type="button" onClick={() => { if (/^[a-z0-9_-]{1,50}$/.test(newSlug) && !draft.legalPages[newSlug]) { change(['legalPages'], { ...draft.legalPages, [newSlug]: bilingual(['title', 'content']) }); setNewSlug(''); } }}>{bn ? 'পেজ যোগ' : 'Add page'}</button></div>}</div></details> : <React.Fragment key={key}>{renderField(value, [key])}</React.Fragment>)}<p className="text-xs text-muted">{bn ? 'ব্যানার দেখাতে হোমপেজ সেকশনে Hero চালু রাখুন। ছবির লিংক অবশ্যই সরাসরি সর্বজনীন HTTPS ছবি হতে হবে; শেয়ার পেজের লিংক নয়। পরিবর্তন প্রকাশ করতে সেভ করুন।' : 'Enable the Hero homepage section to show banners. Use a direct public HTTPS image URL, not a sharing page. Save to publish changes.'}</p>{feedback && <p role="status" className="whitespace-pre-wrap text-sm border border-border p-3 rounded-lg">{feedback}</p>}<div className="flex gap-3 sticky bottom-16 md:bottom-3 bg-surface border border-border p-3 rounded-xl"><button type="submit" disabled={busy || !dirty} className="px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">{busy ? (bn ? 'অপেক্ষা করুন…' : 'Please wait…') : (bn ? 'স্টোরের পরিবর্তন সেভ করুন' : 'Save store changes')}</button><button type="button" disabled={busy} onClick={() => { setDraft(initialContent(siteSettings)); setDirty(false); setFeedback(''); }} className="px-3 text-sm">{bn ? 'পরিবর্তন বাতিল' : 'Discard changes'}</button></div></form></section>;
}
