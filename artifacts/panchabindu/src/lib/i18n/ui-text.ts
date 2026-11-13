import type { Locale } from './dictionaries';
import { UI_MESSAGES } from './ui-messages';

const normalize = (text: string) => text.replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();
const bangla = new Map<string, string>();
const english = new Map<string, string>();
for (const [bn, en] of Object.entries(UI_MESSAGES)) {
  english.set(normalize(bn), en);
  bangla.set(normalize(en), bn);
}

export function uiText(text: string, locale: Locale): string {
  const key = normalize(text);
  if (key === '5 roles') return locale === 'bn' ? 'চারটি স্টাফ রোল ও পৃথক গ্রাহক পরিচয়' : '4 staff roles + separate customer';
  if (key === 'vat 5% deducted') return locale === 'bn' ? 'কর নীতিমালা যাচাই প্রয়োজন' : 'Tax policy requires review';
  const statuses: Record<string, [string, string]> = {
    pending_confirmation: ['নিশ্চিতকরণ অপেক্ষমাণ', 'Pending confirmation'], confirmed: ['নিশ্চিত', 'Confirmed'],
    packed: ['প্যাকিং সম্পন্ন', 'Packed'], shipped: ['কুরিয়ারে হস্তান্তরিত', 'Shipped'],
    out_for_delivery: ['ডেলিভারির পথে', 'Out for delivery'], delivered: ['ডেলিভারি সম্পন্ন', 'Delivered'],
    return_initiated: ['রিটার্ন শুরু', 'Return initiated'], returned: ['ফেরত গৃহীত', 'Returned'],
    cancelled: ['বাতিল', 'Cancelled'], unpaid: ['অনপরিশোধিত', 'Unpaid'],
    partial_verified: ['আংশিক পরিশোধ যাচাইকৃত', 'Partially paid'], paid_verified: ['পরিশোধ যাচাইকৃত', 'Payment verified'],
    remitted: ['রেমিট্যান্স প্রাপ্ত', 'Remitted'], refunded: ['রিফান্ড সম্পন্ন', 'Refunded'],
    active: ['সক্রিয়', 'Active'], draft: ['ড্রাফট', 'Draft'], archived: ['আর্কাইভড', 'Archived'],
    super_admin: ['সুপার অ্যাডমিন', 'Super Admin'], vendor: ['ভেন্ডর', 'Vendor'],
    marketing_manager: ['মার্কেটিং ম্যানেজার', 'Marketing Manager'], packaging_manager: ['প্যাকেজিং ম্যানেজার', 'Packaging Manager'],
    pending: ['অপেক্ষমাণ', 'Pending'], approved: ['অনুমোদিত', 'Approved'], rejected: ['প্রত্যাখ্যাত', 'Rejected'],
    cod: ['ক্যাশ অন ডেলিভারি', 'Cash on Delivery'], bkash_manual: ['ম্যানুয়াল বিকাশ', 'Manual bKash'],
    not_integrated: ['সংযুক্ত নয়', 'Not integrated'], sandbox_test_only: ['শুধু স্থানীয় পরীক্ষা', 'Local testing only'],
  };
  if (statuses[key]) return statuses[key][locale === 'bn' ? 0 : 1];
  return (locale === 'en' ? english : bangla).get(key) ?? text;
}

export function localizeMessages<T>(value: T, locale: Locale): T {
  if (Array.isArray(value)) return value.map(item => localizeMessages(item, locale)) as T;
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) result[key] = localizeMessages(item, locale);
  for (const stem of ['error', 'message']) {
    const source = locale === 'en' ? record[`${stem}En`] : record[`${stem}Bn`];
    for (const suffix of ['Bn', 'En']) {
      if (typeof record[`${stem}${suffix}`] === 'string') {
        result[`${stem}${suffix}`] = typeof source === 'string' && source ? source : uiText(record[`${stem}${suffix}`] as string, locale);
      }
    }
  }
  return result as T;
}

export function localizedField(value: object | null | undefined, field: string, locale: Locale): string {
  if (!value) return '';
  const record = value as Record<string, unknown>;
  const preferred = record[field.replace(/Bn$/, locale === 'bn' ? 'Bn' : 'En')];
  if (typeof preferred === 'string' && preferred) return preferred;
  const fallback = record[field];
  return typeof fallback === 'string' ? uiText(fallback, locale) : '';
}
