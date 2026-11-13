// src/lib/validators/index.ts
// Zod Validation Schemas & Operational Intelligence Validators (Module A, E, G, M)
// Enforces:
//   - BD Phone normalization & validation (supports Bangla digits ০-৯ & +880 prefix)
//   - Address Quality Check (flags missing house/road/landmark, blocks courier booking unless overridden)
//   - Order Risk Score calculation (0..100)
//   - Strict integer poisha & basis points validation on every API boundary

import { z } from 'zod';
import { BD_DISTRICTS, BD_UPAZILAS } from '../geo/bd-geocode';

const BENGALI_TO_ASCII_DIGIT: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

/**
 * Converts Bengali digits (০-৯) to ASCII digits (0-9) and strips spaces/hyphens.
 */
export function normalizeDigits(raw: string): string {
  return raw
    .trim()
    .replace(/[০-৯]/g, (ch) => BENGALI_TO_ASCII_DIGIT[ch] ?? ch)
    .replace(/[\s\-()]/g, '');
}

/**
 * Normalizes any valid Bangladesh mobile phone string (+88017..., 88017..., ০১৭...)
 * to the canonical 11-digit format `01XXXXXXXXX`. Returns null if invalid.
 */
export function normalizeBdPhone(raw: string): string | null {
  const clean = normalizeDigits(raw).replace(/^\+?88/, '');
  if (/^01[3-9]\d{8}$/.test(clean)) {
    return clean;
  }
  return null;
}

export const bdPhoneSchema = z
  .string()
  .min(11, 'ফোন নম্বর কমপক্ষে ১১ সংখ্যার হতে হবে')
  .transform((val, ctx) => {
    const normalized = normalizeBdPhone(val);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const poishaSchema = z
  .number()
  .int('টাকার হিসাব পূর্ণসংখ্যা (পয়সা) হতে হবে')
  .nonnegative('টাকার পরিমাণ ঋণাত্মক হতে পারবে না');

export const basisPointsSchema = z
  .number()
  .int()
  .min(0)
  .max(10000, 'কমিশন বা ডিসকাউন্ট হার ০ থেকে ১০০০০ বেসিস পয়েন্টের (১০০%) মধ্যে হতে হবে');

export interface AddressQualityResult {
  score: number;
  flags: string[];
  isBookableWithoutOverride: boolean;
}

/**
 * Address Quality Check (Module M):
 * Evaluates district/upazila match, street address length, house/road/area detail,
 * and landmark presence. Blocks courier booking if score < 70 unless staff provides an override reason.
 */
export function evaluateAddressQuality(params: {
  districtId: number;
  upazilaId: number;
  streetAddress: string;
  landmark?: string;
  customerPhone: string;
}): AddressQualityResult {
  const flags: string[] = [];
  let score = 100;

  if (!normalizeBdPhone(params.customerPhone)) {
    flags.push('INVALID_PHONE');
    score -= 50;
  }

  const districtExists = BD_DISTRICTS.some((d) => d.id === params.districtId);
  const upazila = BD_UPAZILAS.find((u) => u.id === params.upazilaId);

  if (!districtExists) {
    flags.push('MISSING_DISTRICT');
    score -= 40;
  }
  if (!upazila || upazila.district_id !== params.districtId) {
    flags.push('DISTRICT_UPAZILA_MISMATCH');
    score -= 40;
  }

  const trimmedStreet = params.streetAddress.trim();
  if (trimmedStreet.length < 10) {
    flags.push('ADDRESS_TOO_SHORT');
    score -= 35;
  } else if (trimmedStreet.length < 18) {
    flags.push('VAGUE_STREET_DETAIL');
    score -= 15;
  }

  const trimmedLandmark = (params.landmark ?? '').trim();
  if (trimmedLandmark.length < 3) {
    flags.push('MISSING_LANDMARK');
    score -= 15;
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  return {
    score: clampedScore,
    flags,
    isBookableWithoutOverride:
      clampedScore >= 70 &&
      !flags.includes('INVALID_PHONE') &&
      !flags.includes('DISTRICT_UPAZILA_MISMATCH'),
  };
}

/**
 * Order Risk Score Calculator (Module M):
 * Combines customer return history, address quality, district courier success rate,
 * high COD order value, and acquisition source into a 0..100 risk score.
 */
export function calculateOrderRiskScore(params: {
  customerTotalOrders: number;
  customerReturnedOrders: number;
  isCustomerBlacklisted: boolean;
  addressQualityScore: number;
  districtSuccessRateBp: number;
  totalPayablePoisha: number;
  source: 'storefront' | 'facebook' | 'whatsapp' | 'instagram' | 'phone_call' | 'other';
  mandatoryAdvanceThresholdScore?: number;
}): {
  riskScore: number;
  riskBadge: 'LOW' | 'MEDIUM' | 'HIGH';
  isAdvanceMandatory: boolean;
} {
  if (params.isCustomerBlacklisted) {
    return {
      riskScore: 100,
      riskBadge: 'HIGH',
      isAdvanceMandatory: true,
    };
  }

  let risk = 0;

  // 1. Customer Return Rate Weight (up to 45 points + 10 chronic returner penalty)
  if (params.customerTotalOrders > 0) {
    const returnRatio = params.customerReturnedOrders / params.customerTotalOrders;
    risk += Math.round(returnRatio * 45);
    if (params.customerReturnedOrders >= 2 && returnRatio >= 0.5) {
      risk += 10;
    }
  } else {
    // First-time unverified buyer base risk
    risk += 10;
  }

  // 2. Address Incompleteness Weight (up to 25 points)
  const addressDeficit = 100 - Math.max(0, Math.min(100, params.addressQualityScore));
  risk += Math.round((addressDeficit / 100) * 25);

  // 3. District Courier Failure Rate Weight (up to 15 points)
  const failureBp = Math.max(0, 10000 - params.districtSuccessRateBp);
  risk += Math.round((failureBp / 10000) * 15);

  // 4. High COD Value Weight (> 3,000 BDT = 300,000 poisha adds up to 15 points)
  if (params.totalPayablePoisha >= 500000) {
    risk += 15;
  } else if (params.totalPayablePoisha >= 300000) {
    risk += 8;
  }

  // 5. Unverified Acquisition Source Weight (up to 10 points)
  if (params.source !== 'storefront') {
    risk += 8;
  }

  const clamped = Math.max(0, Math.min(100, risk));
  const threshold = params.mandatoryAdvanceThresholdScore ?? 70;
  const riskBadge = clamped >= 70 ? 'HIGH' : clamped >= 40 ? 'MEDIUM' : 'LOW';

  return {
    riskScore: clamped,
    riskBadge,
    isAdvanceMandatory: clamped >= threshold,
  };
}

/**
 * Checkout & Smart Order Entry Zod Schema
 */
export const createOrderInputSchema = z
  .object({
    idempotencyKey: z.string().min(8, 'Idempotency key is required'),
    customerName: z.string().trim().min(2, 'গ্রাহকের নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(120),
    customerPhone: bdPhoneSchema,
    districtId: z.number().int().positive('জেলা নির্বাচন করুন'),
    upazilaId: z.number().int().positive('উপজেলা নির্বাচন করুন'),
    streetAddress: z
      .string()
      .trim()
      .min(6, 'বাড়ি/রোড/এলাকার বিস্তারিত ঠিকানা লিখুন')
      .max(500),
    landmark: z.string().trim().max(200).optional().default(''),
    addressOverrideReason: z.string().trim().optional(),
    source: z
      .enum(['storefront', 'facebook', 'whatsapp', 'instagram', 'phone_call', 'other'])
      .default('storefront'),
    deliveryMethod: z.enum(['courier', 'post_office', 'free']).default('courier'),
    paymentMethod: z
      .enum(['cod', 'bkash_manual', 'nagad_manual', 'rocket_manual'])
      .default('cod'),
    manualPaymentTrxId: z.string().trim().max(64).optional(),
    manualPaymentSenderPhone: z.string().trim().optional(),
    advancePaidPoisha: poishaSchema.default(0),
    promoCode: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .optional(),
    customerNote: z.string().trim().max(500).optional().default(''),
    internalStaffNote: z.string().trim().max(500).optional().default(''),
    duplicateOverrideReason: z.string().trim().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid('সঠিক প্রোডাক্ট আইডি দিন'),
          variantId: z.string().uuid('সঠিক ভ্যারিয়েন্ট আইডি দিন'),
          quantity: z.number().int().min(1, 'কমপক্ষে ১টি পণ্য নির্বাচন করুন').max(100),
        })
      )
      .min(1, 'অর্ডারে কমপক্ষে ১টি পণ্য থাকতে হবে'),
  })
  .superRefine((data, ctx) => {
    const upazila = BD_UPAZILAS.find((u) => u.id === data.upazilaId);
    if (!upazila || upazila.district_id !== data.districtId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['upazilaId'],
        message: 'নির্বাচিত উপজেলাটি ওই জেলার অন্তর্ভুক্ত নয়',
      });
    }

    if (
      data.paymentMethod !== 'cod' &&
      (!data.manualPaymentTrxId || data.manualPaymentTrxId.length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualPaymentTrxId'],
        message: 'ম্যানুয়াল বিকাশ/নগদ/রকেট পেমেন্টের ক্ষেত্রে সঠিক Transaction ID প্রদান করুন',
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

/**
 * Four-Way Return & Damage Submission Schema
 */
export const createReturnCaseSchema = z.object({
  orderId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  faultType: z.enum([
    'WAREHOUSE_PACKAGING_FAULT',
    'SUPPLIER_DEFECT',
    'CUSTOMER_INTACT_RETURN',
    'COURIER_NEGLIGENCE',
  ]),
  proofMediaUrls: z
    .array(z.string().url())
    .min(1, 'রিটার্ন বা ড্যামেজ এন্ট্রির জন্য কমপক্ষে ১টি ছবি/ভিডিও প্রমাণ আবশ্যক'),
  reasonNote: z.string().trim().min(5, 'রিটার্নের কারণ বিস্তারিত লিখুন').max(1000),
});

/**
 * Vendor Payout Request Schema
 */
export const createPayoutRequestSchema = z.object({
  idempotencyKey: z.string().min(8),
  vendorId: z.string().uuid(),
  requestedAmountPoisha: poishaSchema.refine((v) => v > 0, {
    message: 'উত্তোলনের পরিমাণ অবশ্যই শূন্যের বেশি হতে হবে',
  }),
  vendorNote: z.string().trim().max(300).optional().default(''),
});
