// src/lib/vendor/vendor-control.ts
// Admin-controlled vendor capability registry.
// Stored inside the existing phase-4B vendor document (erp-phase4b-store.json)
// so the runtime persistence contract keeps its fixed set of documents.
//
// Every vendor-facing mutation checks a capability flag here first, so the super
// admin panel decides what a consignment vendor may do. Anything a flag turns
// off is denied; missing records fall back to the conservative defaults below.

import { readPhase4BStore, writePhase4BStore } from '../admin/phase4b-service';

export interface VendorCapabilityFlags {
  canCreateProduct: boolean;
  canEditProduct: boolean;
  canChangeProductStatus: boolean;
  canSubmitConsignmentLot: boolean;
  canSubmitPriceProposal: boolean;
  canRequestPayout: boolean;
  canEditProfile: boolean;
  canEditPayoutProfile: boolean;
  canSubmitOnboardingAnswers: boolean;
  /** 0 = unlimited active products. */
  maxActiveProducts: number;
}

export const DEFAULT_VENDOR_CAPABILITIES: VendorCapabilityFlags = {
  canCreateProduct: true,
  canEditProduct: true,
  canChangeProductStatus: true,
  canSubmitConsignmentLot: true,
  canSubmitPriceProposal: true,
  canRequestPayout: true,
  canEditProfile: true,
  canEditPayoutProfile: true,
  canSubmitOnboardingAnswers: true,
  maxActiveProducts: 0,
};

export type VendorCapabilityKey = keyof VendorCapabilityFlags;
type BooleanCapabilityKey = Exclude<VendorCapabilityKey, 'maxActiveProducts'>;

export const VENDOR_CAPABILITY_LABELS: Array<{
  key: VendorCapabilityKey;
  labelBn: string;
  labelEn: string;
  hintBn: string;
  hintEn: string;
}> = [
  {
    key: 'canCreateProduct',
    labelBn: 'নতুন পণ্য তৈরি',
    labelEn: 'Create new products',
    hintBn: 'ভেন্ডর নিজে নতুন প্রোডাক্ট ও ভ্যারিয়েন্ট যোগ করতে পারবে।',
    hintEn: 'Vendor may add new products and variants.',
  },
  {
    key: 'canEditProduct',
    labelBn: 'নিজের পণ্য সম্পাদনা',
    labelEn: 'Edit own products',
    hintBn: 'নাম, ছবি, বিবরণ ও স্পেক পরিবর্তন করতে পারবে (মূল্য শুধু প্রস্তাবের মাধ্যমে)।',
    hintEn: 'May change name, images, description and specs (prices go through proposals).',
  },
  {
    key: 'canChangeProductStatus',
    labelBn: 'পণ্য ড্রাফট/লাইভ করা',
    labelEn: 'Publish or unpublish products',
    hintBn: 'নিজের পণ্য ড্রাফট বা লাইভ করতে পারবে (ডিলিট কেবল সুপার অ্যাডমিন)।',
    hintEn: 'May draft or publish own products (deletion stays super-admin only).',
  },
  {
    key: 'canSubmitConsignmentLot',
    labelBn: 'কনসাইনমেন্ট চালান জমা',
    labelEn: 'Submit consignment challans',
    hintBn: 'গুদামে পণ্য পাঠানোর চালান (LOT) জমা দিতে পারবে।',
    hintEn: 'May dispatch stock lots to the warehouse for QC.',
  },
  {
    key: 'canSubmitPriceProposal',
    labelBn: 'মূল্য প্রস্তাব জমা',
    labelEn: 'Submit price proposals',
    hintBn: 'সাপ্লায়ার কস্ট ও বিক্রয়মূল্য পরিবর্তনের প্রস্তাব দিতে পারবে।',
    hintEn: 'May propose supplier cost and retail price changes.',
  },
  {
    key: 'canRequestPayout',
    labelBn: 'পেআউট অনুরোধ',
    labelEn: 'Request payouts',
    hintBn: 'Available এসক্রো ব্যালেন্স থেকে পেআউট চাইতে পারবে।',
    hintEn: 'May withdraw from the available escrow balance.',
  },
  {
    key: 'canEditProfile',
    labelBn: 'প্রোফাইল সম্পাদনা',
    labelEn: 'Edit business profile',
    hintBn: 'ব্যবসার নাম, মালিকের নাম ও যোগাযোগ নম্বর বদলাতে পারবে।',
    hintEn: 'May change business name, owner name and contact number.',
  },
  {
    key: 'canEditPayoutProfile',
    labelBn: 'পেআউট অ্যাকাউন্ট পরিবর্তন',
    labelEn: 'Change payout account',
    hintBn: 'বিকাশ/ব্যাংক অ্যাকাউন্ট বদলাতে পারবে (প্রতিটি পরিবর্তন অডিট হয়)।',
    hintEn: 'May change the payout method/account (every change is audited).',
  },
  {
    key: 'canSubmitOnboardingAnswers',
    labelBn: 'অনবোর্ডিং ১৫ প্রশ্নের উত্তর',
    labelEn: 'Submit onboarding answers',
    hintBn: '১৫-প্রশ্নের অনবোর্ডিং তথ্য নিজে পূরণ করতে পারবে।',
    hintEn: 'May fill in the 15-question onboarding profile.',
  },
];

function normalize(raw: Record<string, unknown> | undefined): VendorCapabilityFlags {
  const merged: VendorCapabilityFlags = { ...DEFAULT_VENDOR_CAPABILITIES };
  for (const key of Object.keys(DEFAULT_VENDOR_CAPABILITIES) as VendorCapabilityKey[]) {
    const value = raw?.[key];
    if (key === 'maxActiveProducts') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        merged.maxActiveProducts = Math.max(0, Math.trunc(value));
      }
    } else if (typeof value === 'boolean') {
      merged[key] = value;
    }
  }
  return merged;
}

export function getVendorCapabilities(vendorId: string): VendorCapabilityFlags {
  return normalize(readPhase4BStore().vendorControls?.[vendorId]?.capabilities as Record<string, unknown> | undefined);
}

export function getVendorRestrictionNote(vendorId: string): string | null {
  return readPhase4BStore().vendorControls?.[vendorId]?.restrictionNoteBn ?? null;
}

export function setVendorCapabilities(
  vendorId: string,
  patch: Partial<VendorCapabilityFlags>,
  actorUsername: string,
  restrictionNoteBn?: string
): VendorCapabilityFlags {
  const store = readPhase4BStore();
  const previous = store.vendorControls?.[vendorId];
  const capabilities = normalize({
    ...((previous?.capabilities ?? {}) as Record<string, unknown>),
    ...patch,
  });
  store.vendorControls = {
    ...(store.vendorControls ?? {}),
    [vendorId]: {
      capabilities,
      restrictionNoteBn: restrictionNoteBn ?? previous?.restrictionNoteBn,
      updatedAt: new Date().toISOString(),
      updatedByUsername: actorUsername,
    },
  };
  writePhase4BStore(store);
  return capabilities;
}

/**
 * Clearing admin overrides must also drop the admin-facing restriction note,
 * otherwise a re-enabled vendor keeps seeing "payouts are closed" in the panel.
 */
export function resetVendorControls(vendorId: string, actorUsername: string): VendorCapabilityFlags {
  const store = readPhase4BStore();
  if (store.vendorControls) {
    const { [vendorId]: _removed, ...rest } = store.vendorControls;
    store.vendorControls = rest;
    writePhase4BStore(store);
  }
  void actorUsername;
  return getVendorCapabilities(vendorId);
}

export function vendorCan(vendorId: string, key: BooleanCapabilityKey): boolean {
  return getVendorCapabilities(vendorId)[key] === true;
}
