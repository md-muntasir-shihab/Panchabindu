import type { StorefrontConfig } from '../storefront/storefront-config';
import { getStorefrontConfig } from '../storefront/storefront-config';
// src/lib/db/repository.ts
// Enforces:
//   - Rule A1/A2: Server-side field hiding (Customer NEVER sees vendor_id, internal_vendor_sku, supplier_cost_poisha, or margin)
//   - Zero hardcoded business constants in UI — everything comes from site_settings & database tables

import crypto from 'node:crypto';
import { postVerifiedManualBkashPaymentJournal } from '../finance/phase4-general-ledger-engine';
import path from 'node:path';
import type {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
} from '../../types/database.types';
import type {
  OrderGridRowDTO,
  Poisha,
  PromoRuleInput,
  StorefrontProductDTO,
  ThreeTierPriceSnapshot,
} from '../../types/domain';
import {
  checkMakerCheckerSeparation,
  sanitizeRecordForRole,
  type ActorSecurityContext,
  type SystemRoleSlug,
} from '../../types/permissions';
import {
  getDistrictById,
  getDistrictDeliveryRates,
  getUpazilaById,
} from '../geo/bd-geocode';
import {
  applyBasisPointsHalfUp,
  buildOrderItemPricingSnapshot,
  calculateAutoNetProfit,
  calculateDeliveryCharge,
  calculatePromoDiscount,
} from '../money';
import {
  calculateOrderRiskScore,
  evaluateAddressQuality,
  type CreateOrderInput,
} from '../validators';
import { readLocalJsonStore, writeLocalJsonStore } from './local-json-store';
import { verifyCustomerSessionToken } from '../security/crypto-session';


export interface HomepageSectionConfig {
  id: string;
  type:
    | 'hero'
    | 'trust_strip'
    | 'categories'
    | 'featured_products'
    | 'promo_banner'
    | 'new_arrivals'
    | 'best_sellers';
  enabled: boolean;
  order: number;
  titleBn: string;
  titleEn: string;
}

export interface HeroBannerSlide {
  id: string;
  titleBn: string;
  titleEn: string;
  subtitleBn: string;
  subtitleEn: string;
  ctaLabelBn: string;
  ctaLabelEn: string;
  ctaHref: string;
  badgeBn: string;
  badgeEn: string;
  imageUrl: string;
}

export interface TrustBadgeItem {
  id: string;
  labelBn: string;
  labelEn: string;
  descBn: string;
  descEn: string;
}

export interface CategoryRecord {
  id: string;
  parentId: string | null;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  iconName: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductReviewRecord {
  id: string;
  productId: string;
  customerName: string;
  rating: number; // 1..5
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface InternalVariantRecord {
  variantId: string;
  productId: string;
  internalVendorSku: string;
  publicSku: string;
  titleBn: string;
  titleEn: string;
  attributes: Record<string, string>;
  imageUrl: string | null;
  supplierCostPoisha: Poisha;
  supplierProfitPoisha: Poisha;
  supplierPayablePoisha: Poisha;
  platformMarginPoisha: Poisha;
  salePricePoisha: Poisha;
  compareAtPricePoisha: Poisha | null;
  weightGrams: number;
  stockOnHand: number;
  stockReserved: number;
  stockInTransit: number;
  stockDamaged: number;
  stockAvailable: number;
}

export interface InternalProductRecord {
  productId: string;
  vendorId: string;
  vendorCode: string;
  vendorBusinessName: string;
  categoryId: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  specs: Array<{ labelBn: string; labelEn: string; valueBn: string; valueEn: string }>;
  variantAxes: string[];
  images: string[];
  isFeatured: boolean;
  isFreeDelivery: boolean;
  requiresAdvanceCourierCharge?: boolean;
  customAdvanceDepositPoisha?: Poisha;
  lowStockThreshold: number;
  leadTimeDays: number;
  commissionOverrideBp: number | null;
  totalSoldCount: number;
  totalReturnedCount: number;
  ratingAvgBp: number;
  reviewCount: number;
  status: 'draft' | 'active' | 'archived';
  variants: InternalVariantRecord[];
}

export interface SiteSettingsRecord {
  storefront?: StorefrontConfig;
  maintenanceMessageEn?: string;
  brandNameBn: string;
  brandNameEn: string;
  taglineBn: string;
  taglineEn: string;
  accentColorHex: string;
  supportPhone: string;
  supportEmail: string;
  whatsappNumber: string;
  freeDeliveryThresholdPoisha: Poisha;
  globalFreeDelivery: boolean;
  bdPostDefaultPerKgPoisha: Poisha;
  globalDefaultCommissionBp: number;
  globalEscrowHoldDays: number;
  minPayoutRequestPoisha: Poisha;
  defaultPackagingCostPoisha: Poisha;
  riskAdvanceMandatoryScore: number;
  bkashManualNumber: string;
  bkashInstructionBn: string;
  bkashInstructionEn: string;
  nagadManualNumber?: string;
  nagadInstructionBn?: string;
  rocketManualNumber?: string;
  rocketInstructionBn?: string;
  maintenanceMode: boolean;
  maintenanceMessageBn: string;
  demoMode: boolean;
  delayBanner: {
    enabled: boolean;
    messageBn: string;
    messageEn: string;
  };
  promoCampaign: {
    enabled: boolean;
    titleBn: string;
    titleEn: string;
    code: string;
    discountLabelBn: string;
    discountLabelEn: string;
  };
  trustBadges: TrustBadgeItem[];
  heroBanners: HeroBannerSlide[];
  homepageSections: HomepageSectionConfig[];
  legalPages: Record<
    string,
    { titleBn: string; titleEn: string; contentBn: string; contentEn: string }
  >;
  aboutContactPage?: AboutContactPageSettings;
}

export interface AboutContactPageSettings {
  titleBn: string;
  titleEn: string;
  subtitleBn: string;
  subtitleEn: string;
  storyTitleBn: string;
  storyTitleEn: string;
  storyParagraph1Bn: string;
  storyParagraph1En: string;
  storyParagraph2Bn: string;
  storyParagraph2En: string;
  warehouseAddressBn: string;
  warehouseAddressEn: string;
  helplineHoursBn: string;
  helplineHoursEn: string;
}

export interface CustomerInquiryRecord {
  id: string;
  name: string;
  phone: string;
  subject: string;
  message: string;
  status: 'unread' | 'replied' | 'resolved';
  createdAt: string;
  adminNotes?: string;
}

export interface PublicOrderTrackingItemDTO {
  productNameBn: string;
  productNameEn?: string;
  variantTitleBn: string;
  variantTitleEn?: string;
  publicSku: string;
  quantity: number;
  unitSalePricePoisha: Poisha;
  lineSubtotalPoisha: Poisha;
}

export interface PublicOrderTrackingDTO {
  orderNo: string;
  secureTrackingToken: string;
  status: OrderStatus;
  customerName: string;
  customerPhoneMasked: string;
  districtNameBn: string;
  upazilaNameBn: string;
  deliveryMethod: DeliveryMethod;
  courierProvider: string;
  trackingCode: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  subtotalPoisha: Poisha;
  discountPoisha: Poisha;
  deliveryChargePoisha: Poisha;
  totalPayablePoisha: Poisha;
  advancePaidPoisha: Poisha;
  codCollectablePoisha: Poisha;
  createdAt: string;
  items: PublicOrderTrackingItemDTO[];
}

export interface AuthenticatedCustomerOrderDTO extends PublicOrderTrackingDTO {
  streetAddress: string;
  landmark: string | null;
}

export type ManualBkashSubmissionStatus =
  | 'pending_verification'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'reversed';

export interface ManualBkashSubmissionRecord {
  submissionId: string;
  orderNo: string;
  senderPhone: string;
  senderPhoneMasked: string;
  orderCustomerPhone: string;
  senderPhoneMatchesOrderPhone: boolean;
  trxId: string;
  provider?: 'bkash' | 'nagad' | 'rocket';
  submittedAmountPoisha: Poisha;
  expectedPayablePoisha: Poisha;
  status: ManualBkashSubmissionStatus;
  submittedByRole: 'customer' | SystemRoleSlug;
  submittedByUsername: string;
  reviewedByUsername: string | null;
  reviewNoteBn: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface InternalOrderLineRecord {
  orderId: string;
  productId: string;
  variantId: string;
  vendorId: string;
  productNameBn: string;
  productNameEn?: string;
  variantTitleBn: string;
  variantTitleEn?: string;
  publicSku: string;
  internalVendorSku: string;
  quantity: number;
  weightGrams: number;
  snapSupplierCostPoisha: Poisha;
  snapSupplierProfitPoisha: Poisha;
  snapSupplierPayablePoisha: Poisha;
  snapPlatformMarginPoisha: Poisha;
  snapUnitSalePricePoisha: Poisha;
  lineSubtotalPoisha: Poisha;
  lineDiscountPoisha: Poisha;
  lineNetPlatformMarginPoisha: Poisha;
}

export interface AbandonedCartSnapshot {
  customerPhone: string;
  customerName: string;
  districtId: number;
  subtotalPoisha: Poisha;
  items: Array<{
    productId: string;
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    quantity: number;
    unitSalePricePoisha: Poisha;
  }>;
  updatedAt: string;
}

export interface ErpPersistentState {
  mediaAssets?: Array<{
    assetId: string; productId: string; vendorId: string; uploaderId: string;
    stagingPath: string; publicPath: string | null; status: 'pending' | 'approved';
    sha256: string; width: number; height: number; createdAt: string; approvedBy: string | null;
  }>;
  siteSettings: SiteSettingsRecord;
  categories: CategoryRecord[];
  products: InternalProductRecord[];
  reviews: ProductReviewRecord[];
  promoCodes: PromoRuleInput[];
  orders: OrderGridRowDTO[];
  orderLines: InternalOrderLineRecord[];
  idempotencyKeys: Record<string, string>; // idempotencyKey -> orderNo
  idempotencyPayloadHashes?: Record<string, string>;
  abandonedCarts: AbandonedCartSnapshot[];
  inquiries: CustomerInquiryRecord[];
  manualBkashSubmissions?: ManualBkashSubmissionRecord[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'erp-store.json');

function getInitialSeedState(): ErpPersistentState {
  const siteSettings: SiteSettingsRecord = {
    brandNameBn: 'পঞ্চগড়',
    brandNameEn: 'Panchagarh',
    taglineBn: 'বাংলাদেশের প্রিমিয়াম মাল্টি-ভেন্ডর কনসাইনমেন্ট স্টোর',
    taglineEn: 'Bangladesh Premium Multi-Vendor Consignment Store',
    accentColorHex: '#2563EB',
    supportPhone: '01711002233',
    supportEmail: 'support@panchagarh.bd',
    whatsappNumber: '8801711002233',
    freeDeliveryThresholdPoisha: 150000, // 1,500 BDT
    globalFreeDelivery: false,
    bdPostDefaultPerKgPoisha: 1000, // 10 BDT/kg
    globalDefaultCommissionBp: 1500, // 15%
    globalEscrowHoldDays: 7,
    minPayoutRequestPoisha: 50000, // 500 BDT
    defaultPackagingCostPoisha: 1500, // 15 BDT
    riskAdvanceMandatoryScore: 70,
    bkashManualNumber: '01711002233',
    bkashInstructionBn:
      'বিকাশ অ্যাপ থেকে 01711002233 নম্বরে Send Money করে নিচের ঘরে Transaction ID লিখুন।',
    bkashInstructionEn:
      'Send Money to 01711002233 via bKash and enter the Transaction ID below.',
    nagadManualNumber: '01811002244',
    nagadInstructionBn:
      'নগদ অ্যাপ বা *167# থেকে 01811002244 নম্বরে Send Money করে Transaction ID লিখুন।',
    rocketManualNumber: '019110022558',
    rocketInstructionBn:
      'রকেট অ্যাপ বা *322# থেকে 019110022558 নম্বরে Send Money করে Transaction ID লিখুন।',
    maintenanceMode: false,
    maintenanceMessageBn:
      'সাইটটি বর্তমানে রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
    demoMode: true,
    delayBanner: {
      enabled: true,
      messageBn: 'ঢাকার ভেতরে ২৪-৪৮ ঘণ্টায় এবং ঢাকার বাইরে ২-৪ কার্যদিবসে নিশ্চিত ডেলিভারি।',
      messageEn: 'Guaranteed delivery within 24-48h inside Dhaka and 2-4 days nationwide.',
    },
    promoCampaign: {
      enabled: true,
      titleBn: 'বিশেষ উৎসব ছাড় — কোড EID10 ব্যবহারে ১০% ডিসকাউন্ট (সর্বোচ্চ ৳৩০০)',
      titleEn: 'Festive Offer — Use code EID10 for 10% OFF (Up to BDT 300)',
      code: 'EID10',
      discountLabelBn: '১০% ছাড়',
      discountLabelEn: '10% OFF',
    },
    trustBadges: [
      {
        id: 'cod',
        labelBn: 'ক্যাশ অন ডেলিভারি সুবিধা',
        labelEn: 'Cash on Delivery Nationwide',
        descBn: 'পণ্য হাতে পেয়ে যাচাই করে মূল্য পরিশোধ করুন',
        descEn: 'Inspect your parcel upon delivery before paying',
      },
      {
        id: 'return',
        labelBn: '৭ দিনের সহজ রিটার্ন নীতি',
        labelEn: '7-Day Easy Return Policy',
        descBn: 'ত্রুটিপূর্ণ পণ্যে বিনা খরচে দ্রুত রিটার্ন ও এক্সচেঞ্জ',
        descEn: 'Hassle-free return for any defective item within 7 days',
      },
      {
        id: 'quality',
        labelBn: '১০০% কিউসি যাচাইকৃত পণ্য',
        labelEn: '100% QC Verified Stock',
        descBn: 'প্রতিটি পণ্য আমাদের ওয়্যারহাউসে ছবি ও ভিডিওসহ যাচাইকৃত',
        descEn: 'Every consignment item is inspected at our warehouse',
      },
      {
        id: 'delivery',
        labelBn: '৬৪ জেলায় দ্রুত ডেলিভারি',
        labelEn: '64 Districts Coverage',
        descBn: 'পাঠাও, স্টেডফাস্ট ও ডাক বিভাগের মাধ্যমে সারা দেশে ডেলিভারি',
        descEn: 'Pathao, Steadfast & Bangladesh Post Office coverage',
      },
    ],
    heroBanners: [
      {
        id: 'hero-1',
        titleBn: 'ঐতিহ্যবাহী তাঁত ও প্রিমিয়াম লাইফস্টাইল কালেকশন',
        titleEn: 'Authentic Handloom & Premium Lifestyle Collection',
        subtitleBn:
          'দেশের সেরা কারিগর ও ভেরিফাইড সাপ্লায়ারদের থেকে সরাসরি কনসাইনমেন্ট কিউসি করা পণ্য। ৳১,৫০০+ অর্ডারে ফ্রি ডেলিভারি।',
        subtitleEn:
          'Direct QC-verified consignment products from top artisans across Bangladesh. Free delivery on orders over BDT 1,500.',
        ctaLabelBn: '',
        ctaLabelEn: '',
        ctaHref: '#unified-catalog',
        badgeBn: 'নতুন কালেকশন ২০২৬',
        badgeEn: 'New Collection 2026',
        imageUrl: '/assets/authentic_handloom_hero.jpg',
      },
    ],
    homepageSections: [
      {
        id: 'hero',
        type: 'hero',
        enabled: true,
        order: 1,
        titleBn: 'হিরো ব্যানার',
        titleEn: 'Hero Banner',
      },
      {
        id: 'trust_strip',
        type: 'trust_strip',
        enabled: true,
        order: 2,
        titleBn: 'আস্থার প্রতীক',
        titleEn: 'Trust Guarantees',
      },
      {
        id: 'categories',
        type: 'categories',
        enabled: true,
        order: 3,
        titleBn: 'জনপ্রিয় ক্যাটাগরি',
        titleEn: 'Shop by Category',
      },
      {
        id: 'featured_products',
        type: 'featured_products',
        enabled: true,
        order: 4,
        titleBn: 'ফিচার্ড পণ্যসমূহ',
        titleEn: 'Featured Products',
      },
      {
        id: 'promo_banner',
        type: 'promo_banner',
        enabled: true,
        order: 5,
        titleBn: 'ক্যাম্পেইন অফার',
        titleEn: 'Campaign Offer',
      },
      {
        id: 'new_arrivals',
        type: 'new_arrivals',
        enabled: true,
        order: 6,
        titleBn: 'নতুন আগমন',
        titleEn: 'New Arrivals',
      },
      {
        id: 'best_sellers',
        type: 'best_sellers',
        enabled: true,
        order: 7,
        titleBn: 'সবচেয়ে বেশি বিক্রিত',
        titleEn: 'Best Sellers',
      },
    ],
    legalPages: {
      about: {
        titleBn: 'আমাদের সম্পর্কে',
        titleEn: 'About Us',
        contentBn:
          'বঙ্গকনসাইন বাংলাদেশের একটি আধুনিক কনসাইনমেন্ট ই-কমার্স স্টোর। আমাদের প্রতিটি পণ্য ওয়্যারহাউসে যাচাই করার পর গ্রাহকের কাছে পাঠানো হয়।',
        contentEn:
          'BongoConsign is a modern consignment e-commerce store in Bangladesh where every item is QC-verified before dispatch.',
      },
      privacy: {
        titleBn: 'গোপনীয়তা নীতি',
        titleEn: 'Privacy Policy',
        contentBn:
          'গ্রাহকের ফোন নম্বর ও ঠিকানা শুধুমাত্র ডেলিভারির কাজে ব্যবহৃত হয় এবং থার্ড-পার্টির কাছে কখনোই প্রকাশ করা হয় না।',
        contentEn:
          'Customer phone numbers and addresses are strictly used for order fulfillment and masked from third parties.',
      },
      return_policy: {
        titleBn: 'রিটার্ন ও রিফান্ড নীতি',
        titleEn: 'Return & Refund Policy',
        contentBn:
          'ডেলিভারি ম্যানের সামনে পণ্য চেক করে নিন। কোনো ত্রুটি থাকলে তাৎক্ষণিক রিটার্ন অথবা ৭ দিনের মধ্যে এক্সচেঞ্জ সুবিধা পাবেন।',
        contentEn:
          'Please check your parcel in front of the delivery rider. Defective items are eligible for 7-day replacement or refund.',
      },
      terms: {
        titleBn: 'শর্তাবলী',
        titleEn: 'Terms & Conditions',
        contentBn:
          'সঠিক ফোন নম্বর ও বিস্তারিত ঠিকানা দিয়ে অর্ডার নিশ্চিত করার জন্য অনুরোধ করা হচ্ছে।',
        contentEn:
          'Orders require a valid Bangladesh mobile number and complete delivery address.',
      },
    },
  };

  const categories: CategoryRecord[] = [
    {
      id: 'cat-fashion',
      parentId: null,
      slug: 'traditional-wear',
      nameBn: 'ঐতিহ্যবাহী পোশাক',
      nameEn: 'Traditional Wear',
      descriptionBn: 'জামদানি, টাঙ্গাইল তাঁত ও প্রিমিয়াম পাঞ্জাবি কালেকশন',
      descriptionEn: 'Authentic Jamdani, Tangail handloom sarees & panjabis',
      iconName: 'Shirt',
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 'cat-leather',
      parentId: null,
      slug: 'leather-goods',
      nameBn: 'লেদার ও ব্যাগ',
      nameEn: 'Leather & Bags',
      descriptionBn: 'খাঁটি চামড়ার ওয়ালেট, অফিস ব্যাগ ও বেল্ট',
      descriptionEn: 'Genuine leather wallets, office bags & accessories',
      iconName: 'Briefcase',
      sortOrder: 2,
      isActive: true,
    },
    {
      id: 'cat-organic',
      parentId: null,
      slug: 'organic-food',
      nameBn: 'অর্গানিক ফুড ও মধু',
      nameEn: 'Organic Food & Honey',
      descriptionBn: 'সুন্দরবনের প্রাকৃতিক মধু, ঘি ও খাঁটি মসলা',
      descriptionEn: 'Sundarbans raw honey, pure cow ghee & organic spices',
      iconName: 'PackageCheck',
      sortOrder: 3,
      isActive: true,
    },
    {
      id: 'cat-home',
      parentId: null,
      slug: 'home-craft',
      nameBn: 'হোম ডেকোর ও ক্রাফট',
      nameEn: 'Home Decor & Craft',
      descriptionBn: 'নকশিকাঁথা, মাটির শোপিস ও জুট হ্যান্ডিক্রাফট',
      descriptionEn: 'Nakshi Kantha, terracotta & artisanal jute decor',
      iconName: 'Home',
      sortOrder: 4,
      isActive: true,
    },
  ];

  const products: InternalProductRecord[] = [
    {
      productId: '00000000-0000-4000-8000-000000000101',
      vendorId: '00000000-0000-4000-8000-000000000901',
      vendorCode: 'VND-001',
      vendorBusinessName: 'রূপগঞ্জ উইভার্স কনসাইনমেন্ট',
      categoryId: 'cat-fashion',
      slug: 'dhakai-half-silk-jamdani-saree',
      nameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
      nameEn: 'Dhakai Half-Silk Handwoven Jamdani Saree',
      descriptionBn:
        'নারায়ণগঞ্জের রূপগঞ্জের দক্ষ তাঁতিদের হাতে বোনা ৮৪ কাউন্টের ঢাকাই হাফ-সিল্ক জামদানি শাড়ি। উৎসব ও যেকোনো বিশেষ আয়োজনে পরার উপযোগী।',
      descriptionEn:
        '84-count handwoven Dhakai Half-Silk Jamdani Saree crafted by master weavers in Rupganj.',
      specs: [
        { labelBn: 'বুনন প্রকৃতি', labelEn: 'Weave Type', valueBn: 'হাতে বোনা জামদানি', valueEn: 'Handloom Jamdani' },
        { labelBn: 'দৈর্ঘ্য', labelEn: 'Length', valueBn: '১২ হাত (ব্লাউজ পিস সহ)', valueEn: '5.5 Meters with Blouse Piece' },
      ],
      variantAxes: ['Color'],
      images: [
        'https://picsum.photos/seed/jamdani-1/800/800',
        'https://picsum.photos/seed/jamdani-2/800/800',
      ],
      isFeatured: true,
      isFreeDelivery: true,
      requiresAdvanceCourierCharge: true,
      customAdvanceDepositPoisha: 10000,
      lowStockThreshold: 5,
      leadTimeDays: 3,
      commissionOverrideBp: null,
      totalSoldCount: 48,
      totalReturnedCount: 1,
      ratingAvgBp: 485,
      reviewCount: 19,
      status: 'active',
      variants: [
        {
          variantId: '00000000-0000-4000-8000-000000000201',
          productId: '00000000-0000-4000-8000-000000000101',
          internalVendorSku: 'VND001-JAM-CRIMSON',
          publicSku: 'BG-JAM-201',
          titleBn: 'মেরুন ও গোল্ডেন জরি',
          titleEn: 'Crimson & Golden Zari',
          attributes: { Color: 'মেরুন' },
          imageUrl: 'https://picsum.photos/seed/jamdani-1/800/800',
          supplierCostPoisha: 160000,
          supplierProfitPoisha: 40000,
          supplierPayablePoisha: 200000,
          platformMarginPoisha: 45000,
          salePricePoisha: 245000,
          compareAtPricePoisha: 280000,
          weightGrams: 550,
          stockOnHand: 12,
          stockReserved: 2,
          stockInTransit: 3,
          stockDamaged: 0,
          stockAvailable: 10,
        },
        {
          variantId: '00000000-0000-4000-8000-000000000202',
          productId: '00000000-0000-4000-8000-000000000101',
          internalVendorSku: 'VND001-JAM-MIDNIGHT',
          publicSku: 'BG-JAM-202',
          titleBn: 'মিডনাইট ব্লু ও কপার জরি',
          titleEn: 'Midnight Blue & Copper Zari',
          attributes: { Color: 'মিডনাইট ব্লু' },
          imageUrl: 'https://picsum.photos/seed/jamdani-2/800/800',
          supplierCostPoisha: 160000,
          supplierProfitPoisha: 40000,
          supplierPayablePoisha: 200000,
          platformMarginPoisha: 45000,
          salePricePoisha: 245000,
          compareAtPricePoisha: 280000,
          weightGrams: 550,
          stockOnHand: 4,
          stockReserved: 1,
          stockInTransit: 0,
          stockDamaged: 0,
          stockAvailable: 3,
        },
      ],
    },
    {
      productId: '00000000-0000-4000-8000-000000000102',
      vendorId: '00000000-0000-4000-8000-000000000902',
      vendorCode: 'VND-002',
      vendorBusinessName: 'হাজারীবাগ ক্রাফট লেদার ওয়ার্কস',
      categoryId: 'cat-leather',
      slug: 'full-grain-cowhide-executive-wallet',
      nameBn: 'ফুল-গ্রেইন কাউহাইড লেদার এক্সিকিউটিভ ওয়ালেট',
      nameEn: 'Full-Grain Cowhide Leather Executive Bi-Fold Wallet',
      descriptionBn:
        '১০০% এক্সপোর্ট কোয়ালিটি ফুল-গ্রেইন চামড়ায় তৈরি স্লিম ওয়ালেট। ৮টি কার্ড স্লট, ২টি ক্যাশ কম্পার্টমেন্ট এবং মজবুত সেলাই।',
      descriptionEn:
        '100% export-grade full-grain cowhide leather bi-fold wallet with 8 card slots.',
      specs: [
        { labelBn: 'উপাদান', labelEn: 'Material', valueBn: '১০০% ফুল-গ্রেইন কাউহাইড লেদার', valueEn: '100% Full-Grain Cowhide' },
        { labelBn: 'ওয়ারেন্টি', labelEn: 'Warranty', valueBn: '২ বছরের স্টিচ ও লেদার গ্যারান্টি', valueEn: '2-Year Leather Guarantee' },
      ],
      variantAxes: ['Color'],
      images: [
        'https://picsum.photos/seed/wallet-1/800/800',
        'https://picsum.photos/seed/wallet-2/800/800',
      ],
      isFeatured: true,
      isFreeDelivery: false,
      lowStockThreshold: 5,
      leadTimeDays: 2,
      commissionOverrideBp: 2000,
      totalSoldCount: 92,
      totalReturnedCount: 2,
      ratingAvgBp: 490,
      reviewCount: 34,
      status: 'active',
      variants: [
        {
          variantId: '00000000-0000-4000-8000-000000000203',
          productId: '00000000-0000-4000-8000-000000000102',
          internalVendorSku: 'VND002-WAL-BRN',
          publicSku: 'BG-WAL-203',
          titleBn: 'ভিন্টেজ ব্রাউন',
          titleEn: 'Vintage Brown',
          attributes: { Color: 'ভিন্টেজ ব্রাউন' },
          imageUrl: 'https://picsum.photos/seed/wallet-1/800/800',
          supplierCostPoisha: 42000,
          supplierProfitPoisha: 13000,
          supplierPayablePoisha: 55000,
          platformMarginPoisha: 20000,
          salePricePoisha: 75000,
          compareAtPricePoisha: 90000,
          weightGrams: 200,
          stockOnHand: 25,
          stockReserved: 3,
          stockInTransit: 5,
          stockDamaged: 0,
          stockAvailable: 22,
        },
        {
          variantId: '00000000-0000-4000-8000-000000000204',
          productId: '00000000-0000-4000-8000-000000000102',
          internalVendorSku: 'VND002-WAL-BLK',
          publicSku: 'BG-WAL-204',
          titleBn: 'ম্যাট ব্ল্যাক',
          titleEn: 'Matte Black',
          attributes: { Color: 'ম্যাট ব্ল্যাক' },
          imageUrl: 'https://picsum.photos/seed/wallet-2/800/800',
          supplierCostPoisha: 42000,
          supplierProfitPoisha: 13000,
          supplierPayablePoisha: 55000,
          platformMarginPoisha: 20000,
          salePricePoisha: 75000,
          compareAtPricePoisha: 90000,
          weightGrams: 200,
          stockOnHand: 18,
          stockReserved: 0,
          stockInTransit: 2,
          stockDamaged: 0,
          stockAvailable: 18,
        },
      ],
    },
    {
      productId: '00000000-0000-4000-8000-000000000103',
      vendorId: '00000000-0000-4000-8000-000000000903',
      vendorCode: 'VND-003',
      vendorBusinessName: 'সুন্দরবন ন্যাচারালস সাতক্ষীরা',
      categoryId: 'cat-organic',
      slug: 'sundarbans-raw-khalisha-flower-honey',
      nameBn: 'সুন্দরবনের প্রাকৃতিক খলিশা ফুলের মধু (আনপ্রসেসড)',
      nameEn: 'Sundarbans Raw Khalisha Flower Honey (Unprocessed)',
      descriptionBn:
        'সাতক্ষীরা রেঞ্জের মৌয়ালদের থেকে সংগৃহীত ১০০% প্রাকৃতিক ও ল্যাব-টেস্টেড খলিশা ফুলের মধু। কোনো কৃত্রিম চিনি বা প্রিজারভেটিভ নেই।',
      descriptionEn:
        '100% raw, unprocessed Khalisha flower honey harvested directly from Satkhira range of the Sundarbans.',
      specs: [
        { labelBn: 'উৎস', labelEn: 'Origin', valueBn: 'বুড়িগোয়ালিনী, সাতক্ষীরা রেঞ্জ', valueEn: 'Satkhira Range, Sundarbans' },
        { labelBn: 'গুণগত মান', labelEn: 'Purity', valueBn: 'ল্যাব টেস্টেড ও আনহিটেড', valueEn: 'Lab Verified Raw & Unheated' },
      ],
      variantAxes: ['Weight'],
      images: [
        'https://picsum.photos/seed/honey-1/800/800',
        'https://picsum.photos/seed/honey-2/800/800',
      ],
      isFeatured: true,
      isFreeDelivery: false,
      lowStockThreshold: 5,
      leadTimeDays: 3,
      commissionOverrideBp: null,
      totalSoldCount: 135,
      totalReturnedCount: 0,
      ratingAvgBp: 495,
      reviewCount: 51,
      status: 'active',
      variants: [
        {
          variantId: '00000000-0000-4000-8000-000000000205',
          productId: '00000000-0000-4000-8000-000000000103',
          internalVendorSku: 'VND003-HNY-500G',
          publicSku: 'BG-HNY-205',
          titleBn: '৫০০ গ্রাম কাঁচের জার',
          titleEn: '500g Glass Jar',
          attributes: { Weight: '৫০০ গ্রাম' },
          imageUrl: 'https://picsum.photos/seed/honey-1/800/800',
          supplierCostPoisha: 45000,
          supplierProfitPoisha: 10000,
          supplierPayablePoisha: 55000,
          platformMarginPoisha: 13000,
          salePricePoisha: 68000,
          compareAtPricePoisha: 75000,
          weightGrams: 750,
          stockOnHand: 30,
          stockReserved: 4,
          stockInTransit: 6,
          stockDamaged: 0,
          stockAvailable: 26,
        },
        {
          variantId: '00000000-0000-4000-8000-000000000206',
          productId: '00000000-0000-4000-8000-000000000103',
          internalVendorSku: 'VND003-HNY-1KG',
          publicSku: 'BG-HNY-206',
          titleBn: '১ কেজি ফ্যামিলি প্যাক',
          titleEn: '1 KG Family Jar',
          attributes: { Weight: '১ কেজি' },
          imageUrl: 'https://picsum.photos/seed/honey-2/800/800',
          supplierCostPoisha: 85000,
          supplierProfitPoisha: 18000,
          supplierPayablePoisha: 103000,
          platformMarginPoisha: 22000,
          salePricePoisha: 125000,
          compareAtPricePoisha: 140000,
          weightGrams: 1350,
          stockOnHand: 15,
          stockReserved: 1,
          stockInTransit: 2,
          stockDamaged: 0,
          stockAvailable: 14,
        },
      ],
    },
    {
      productId: '00000000-0000-4000-8000-000000000104',
      vendorId: '00000000-0000-4000-8000-000000000901',
      vendorCode: 'VND-001',
      vendorBusinessName: 'রূপগঞ্জ উইভার্স কনসাইনমেন্ট',
      categoryId: 'cat-home',
      slug: 'jamalpur-hand-stitched-nakshi-kantha',
      nameBn: 'জামালপুরের ঐতিহ্যবাহী হাতে সেলাই নকশিকাঁথা (কিং সাইজ)',
      nameEn: 'Jamalpur Hand-Stitched Cotton Nakshi Kantha (King Size)',
      descriptionBn:
        'জামালপুরের গ্রামীণ নারী শিল্পীদের নিখুঁত সূচিকর্মে তৈরি ১০০% সুতি কাপড়ের কিং সাইজ নকশিকাঁথা ও বেডকভার।',
      descriptionEn:
        '100% pure cotton king-size Nakshi Kantha hand-embroidered by rural women artisans of Jamalpur.',
      specs: [
        { labelBn: 'মাপ', labelEn: 'Dimensions', valueBn: '৭.৫ ফিট × ৮.৫ ফিট (কিং সাইজ)', valueEn: '7.5 ft x 8.5 ft (King Size)' },
        { labelBn: 'কাপড়', labelEn: 'Fabric', valueBn: '১০০% সুতি পপলিন ৩ পরত', valueEn: '3-Layer 100% Cotton Poplin' },
      ],
      variantAxes: ['Color'],
      images: [
        'https://picsum.photos/seed/kantha-1/800/800',
        'https://picsum.photos/seed/kantha-2/800/800',
      ],
      isFeatured: true,
      isFreeDelivery: true,
      lowStockThreshold: 5,
      leadTimeDays: 4,
      commissionOverrideBp: null,
      totalSoldCount: 29,
      totalReturnedCount: 0,
      ratingAvgBp: 480,
      reviewCount: 14,
      status: 'active',
      variants: [
        {
          variantId: '00000000-0000-4000-8000-000000000207',
          productId: '00000000-0000-4000-8000-000000000104',
          internalVendorSku: 'VND001-NK-RED',
          publicSku: 'BG-NK-207',
          titleBn: 'টেরাকোটা রেড ও মাল্টি-থ্রেড',
          titleEn: 'Terracotta Red & Multi-Thread',
          attributes: { Color: 'টেরাকোটা রেড' },
          imageUrl: 'https://picsum.photos/seed/kantha-1/800/800',
          supplierCostPoisha: 110000,
          supplierProfitPoisha: 25000,
          supplierPayablePoisha: 135000,
          platformMarginPoisha: 30000,
          salePricePoisha: 165000,
          compareAtPricePoisha: 190000,
          weightGrams: 1100,
          stockOnHand: 8,
          stockReserved: 1,
          stockInTransit: 1,
          stockDamaged: 0,
          stockAvailable: 7,
        },
      ],
    },
  ];

  const reviews: ProductReviewRecord[] = [
    {
      id: 'rev-1',
      productId: '00000000-0000-4000-8000-000000000101',
      customerName: 'সাদিয়া সুলতানা',
      rating: 5,
      comment: 'জামদানি শাড়িটির বুনন এবং রঙের মান অসাধারণ। প্যাকেজিং খুবই পরিপাটি ছিল।',
      isVerifiedPurchase: true,
      createdAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: 'rev-2',
      productId: '00000000-0000-4000-8000-000000000102',
      customerName: 'মাহমুদুল হাসান',
      rating: 5,
      comment: 'খাঁটি চামড়ার গন্ধ ও সেলাই দেখে খুব ভালো লেগেছে। দামের তুলনায় সেরা ওয়ালেট।',
      isVerifiedPurchase: true,
      createdAt: '2026-11-03T14:20:00.000Z',
    },
    {
      id: 'rev-3',
      productId: '00000000-0000-4000-8000-000000000103',
      customerName: 'রাশেদুল ইসলাম',
      rating: 5,
      comment: 'খলিশা ফুলের মধুর ঘ্রাণ ও স্বাদ একদম প্রাকৃতিক। কাঁচের জারে নিরাপদে হাতে পেয়েছি।',
      isVerifiedPurchase: true,
      createdAt: '2026-11-04T09:15:00.000Z',
    },
  ];

  const promoCodes: PromoRuleInput[] = [
    {
      code: 'EID10',
      discountType: 'percentage_bp',
      discountValue: 1000, // 10%
      maxDiscountPoisha: 30000, // Max 300 BDT
      minOrderSubtotalPoisha: 50000, // Min 500 BDT
      allowedVendorIds: [],
      isActive: true,
      expiresAt: null,
    },
    {
      code: 'SAVE100',
      discountType: 'fixed_poisha',
      discountValue: 10000, // 100 BDT
      maxDiscountPoisha: 10000,
      minOrderSubtotalPoisha: 100000, // Min 1,000 BDT
      allowedVendorIds: [],
      isActive: true,
      expiresAt: null,
    },
  ];

  const dDhaka = getDistrictById(47);
  const uDhanmondi = getUpazilaById(365) ?? { id: 365, name_bn: 'ধানমন্ডি' };
  const dComilla = getDistrictById(1);
  const uDebidwar = getUpazilaById(1);

  const orders: OrderGridRowDTO[] = [
    {
      id: '00000000-0000-4000-8000-000000000501',
      orderNo: 'ORD-261106-0001',
      customerName: 'তানভীর আহমেদ',
      customerPhone: '01712345678',
      districtId: 47,
      districtNameBn: dDhaka?.name_bn ?? 'ঢাকা',
      upazilaId: uDhanmondi.id,
      upazilaNameBn: uDhanmondi.name_bn,
      streetAddress: 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা',
      landmark: 'সাত মসজিদ রোড ওভারব্রিজের পাশে',
      addressQualityScore: 100,
      addressFlags: [],
      source: 'storefront',
      status: 'confirmed',
      deliveryMethod: 'free',
      courierProvider: 'steadfast',
      consignmentId: null,
      trackingCode: 'SF-982341',
      subtotalPoisha: 245000,
      discountPoisha: 0,
      deliveryChargePoisha: 0,
      totalPayablePoisha: 245000,
      advancePaidPoisha: 0,
      codCollectablePoisha: 245000,
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      manualPaymentTrxId: null,
      riskScore: 15,
      isAdvanceMandatory: false,
      isDuplicateFlagged: false,
      nextBestAction: 'READY_TO_PACK',
      printCount: 0,
      snapTotalSupplierPayablePoisha: 200000,
      estimatedNetProfitPoisha: 43500,
      secureTrackingToken: 'trk_501a9f8e7d6c5b4a3f2e1d0c9b8a7f6e',
      trackingTokenExpiresAt: '2027-12-31T23:59:59.000Z',
      createdAt: '2026-11-06T06:30:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      orderNo: 'ORD-261106-0002',
      customerName: 'নুসরাত জাহান',
      customerPhone: '01819876543',
      districtId: 1,
      districtNameBn: dComilla?.name_bn ?? 'কুমিল্লা',
      upazilaId: uDebidwar?.id ?? 1,
      upazilaNameBn: uDebidwar?.name_bn ?? 'দেবিদ্বার',
      streetAddress: 'বাড়ি ১২, কলেজ রোড, দেবিদ্বার সদর',
      landmark: 'সরকারি কলেজের পূর্ব গেট',
      addressQualityScore: 100,
      addressFlags: [],
      source: 'facebook',
      status: 'pending_confirmation',
      deliveryMethod: 'courier',
      courierProvider: 'pathao',
      consignmentId: null,
      trackingCode: null,
      subtotalPoisha: 143000,
      discountPoisha: 10000,
      deliveryChargePoisha: 13000,
      totalPayablePoisha: 146000,
      advancePaidPoisha: 13000,
      codCollectablePoisha: 133000,
      paymentMethod: 'bkash_manual',
      paymentStatus: 'partial_verified',
      manualPaymentTrxId: 'BK98234XZA',
      riskScore: 22,
      isAdvanceMandatory: false,
      isDuplicateFlagged: false,
      nextBestAction: 'CALL_TO_CONFIRM',
      printCount: 0,
      snapTotalSupplierPayablePoisha: 110000,
      estimatedNetProfitPoisha: 21500,
      secureTrackingToken: 'trk_502b8e7d6c5a4f3e2d1c0b9a8f7e6d5c',
      trackingTokenExpiresAt: '2027-12-31T23:59:59.000Z',
      createdAt: '2026-11-06T07:15:00.000Z',
    },
  ];

  const orderLines: InternalOrderLineRecord[] = [
    {
      orderId: '00000000-0000-4000-8000-000000000501',
      productId: '00000000-0000-4000-8000-000000000101',
      variantId: '00000000-0000-4000-8000-000000000201',
      vendorId: '00000000-0000-4000-8000-000000000901',
      productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
      variantTitleBn: 'মেরুন ও গোল্ডেন জরি',
      publicSku: 'BG-JAM-201',
      internalVendorSku: 'VND001-JAM-CRIMSON',
      quantity: 1,
      weightGrams: 550,
      snapSupplierCostPoisha: 160000,
      snapSupplierProfitPoisha: 40000,
      snapSupplierPayablePoisha: 200000,
      snapPlatformMarginPoisha: 45000,
      snapUnitSalePricePoisha: 245000,
      lineSubtotalPoisha: 245000,
      lineDiscountPoisha: 0,
      lineNetPlatformMarginPoisha: 45000,
    },
  ];

  const defaultInquiries: CustomerInquiryRecord[] = [
    {
      id: 'inq-1001',
      name: 'তানভীর আহমেদ',
      phone: '01712345678',
      subject: 'জামদানি শাড়ির বাল্ক কনসাইনমেন্ট অর্ডার',
      message: 'সালামু আলাইকুম। আমার ৫টি জামদানি শাড়ির জরুরি ডেলিভারি লাগবে। আপনারা কি বাল্ক অর্ডার ডিসকাউন্ট দেবেন?',
      status: 'unread',
      createdAt: '2026-11-08T05:30:00.000Z',
    },
  ];

  const defaultAboutContact: AboutContactPageSettings = {
    titleBn: 'যোগাযোগ ও আমাদের পরিচিতি',
    titleEn: 'Contact & About Us',
    subtitleBn: 'বাংলাদেশের তৃণমূল কারিগর ও গ্রাহকদের মাঝে নির্ভরযোগ্য, কিউসি-যাচাইকৃত কনসাইনমেন্ট প্ল্যাটফর্ম।',
    subtitleEn: 'Reliable, QC-verified consignment platform bridging authentic artisans and valued customers.',
    storyTitleBn: 'পঞ্চগড় (PANCHAGARH) কীভাবে কাজ করে?',
    storyTitleEn: 'How PANCHAGARH Works',
    storyParagraph1Bn: 'পঞ্চগড় একটি আধুনিক মাল্টি-ভেন্ডর কনসাইনমেন্ট কমার্স প্ল্যাটফর্ম। আমরা বাংলাদেশের স্থানীয় তাঁতি, চাষী ও কারিগরদের সাথে সরাসরি কাজ করি। প্রতিটি পণ্য আমাদের নিজস্ব সেন্ট্রাল ওয়্যারহাউসে রিসিভ করে অভিজ্ঞ টিম দ্বারা গুণগত মান (QC) নিশ্চিত করার পর প্যাকেজিং ও ডেলিভারি করা হয়।',
    storyParagraph1En: 'PANCHAGARH is a transparent consignment commerce platform connecting verified regional artisans with consumers nationwide. Every consignment lot undergoes strict physical quality checks at our central warehouse prior to customer dispatch.',
    storyParagraph2Bn: 'আমাদের প্রধান লক্ষ্য হলো—ক্রেতা যেন ঘরে বসেই শতভাগ খাঁটি পণ্য পান, এবং প্রান্তিক উৎপাদক যেন তাদের পণ্যের সঠিক ন্যায্যমূল্য ও সঠিক সময়ে পেমেন্ট পান।',
    storyParagraph2En: 'Our mission is simple: ensure authentic provenance and fair trade for suppliers, while guaranteeing pristine product quality and peace of mind for every customer.',
    warehouseAddressBn: 'প্লট ১২, রোড ৪/এ, ধানমন্ডি আ/এ, ঢাকা-১২০৯',
    warehouseAddressEn: 'Plot 12, Road 4/A, Dhanmondi R/A, Dhaka-1209',
    helplineHoursBn: 'সকাল ৯টা – রাত ১০টা (প্রতিদিন)',
    helplineHoursEn: '9 AM – 10 PM Everyday',
  };

  siteSettings.aboutContactPage = defaultAboutContact;

  return {
    siteSettings,
    categories,
    products,
    reviews,
    promoCodes,
    orders,
    orderLines,
    idempotencyKeys: {},
    abandonedCarts: [],
    inquiries: defaultInquiries,
    manualBkashSubmissions: [
      {
        submissionId: 'sub-ORD-261106-0002-BK98234XZA',
        orderNo: 'ORD-261106-0002',
        senderPhone: '01819876543',
        senderPhoneMasked: '018****6543',
        orderCustomerPhone: '01819876543',
        senderPhoneMatchesOrderPhone: true,
        trxId: 'BK98234XZA',
        submittedAmountPoisha: 13000,
        expectedPayablePoisha: 146000,
        status: 'approved',
        submittedByRole: 'customer',
        submittedByUsername: 'customer',
        reviewedByUsername: 'admin',
        reviewNoteBn: 'সিডেড বিকাশ অগ্রিম ডেলিভারি চার্জ ভেরিফাইড।',
        submittedAt: '2026-11-06T07:15:00.000Z',
        reviewedAt: '2026-11-06T07:20:00.000Z',
      },
    ],
  };
}

export function generateSecureOrderTrackingToken(orderNoSeed?: string): string {
  if (orderNoSeed === 'ORD-261106-0001') {
    return 'trk_501a9f8e7d6c5b4a3f2e1d0c9b8a7f6e';
  }
  if (orderNoSeed === 'ORD-261106-0002') {
    return 'trk_502b8e7d6c5a4f3e2d1c0b9a8f7e6d5c';
  }
  return `trk_${crypto.randomBytes(16).toString('hex')}`;
}

export function readErpState(): ErpPersistentState {
  const parsed = readLocalJsonStore<ErpPersistentState>(DATA_FILE, {
    arrays: ['categories', 'products', 'reviews', 'promoCodes', 'orders', 'orderLines'],
    objects: ['siteSettings', 'idempotencyKeys'],
    optionalArrays: ['abandonedCarts', 'inquiries', 'manualBkashSubmissions'],
  });
  if (parsed) {
      const fallback = getInitialSeedState();
      // Historical prices are evidence, not a read-time migration target.
      // Reject inconsistent snapshots without changing the file or issuing new tracking credentials.
      for (const line of parsed.orderLines) {
        const expectedPayable =
          line.snapSupplierCostPoisha + line.snapSupplierProfitPoisha;
        const expectedUnitSale =
          expectedPayable + line.snapPlatformMarginPoisha;
        const expectedLineSubtotal = expectedUnitSale * line.quantity;
        if (
          ![line.snapSupplierCostPoisha, line.snapSupplierProfitPoisha,
            line.snapSupplierPayablePoisha, line.snapPlatformMarginPoisha,
            line.snapUnitSalePricePoisha, line.lineSubtotalPoisha,
            expectedPayable, expectedUnitSale, expectedLineSubtotal]
            .every(Number.isSafeInteger) ||
          !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
          line.snapSupplierPayablePoisha !== expectedPayable ||
          line.snapUnitSalePricePoisha !== expectedUnitSale ||
          line.lineSubtotalPoisha !== expectedLineSubtotal
        ) {
          throw new Error('ORDER_PRICE_SNAPSHOT_INVALID: Historical pricing requires explicit reconciliation.');
        }
      }
      const state: ErpPersistentState = {
        mediaAssets: parsed.mediaAssets ?? [],
        siteSettings: {
          ...fallback.siteSettings,
          ...parsed.siteSettings,
          aboutContactPage:
            parsed.siteSettings?.aboutContactPage ??
            fallback.siteSettings.aboutContactPage,
        },
        categories: parsed.categories ?? fallback.categories,
        products: parsed.products ?? fallback.products,
        reviews: parsed.reviews ?? fallback.reviews,
        promoCodes: parsed.promoCodes ?? fallback.promoCodes,
        orders: parsed.orders,
        orderLines: parsed.orderLines,
        idempotencyKeys: parsed.idempotencyKeys ?? {},
        idempotencyPayloadHashes: parsed.idempotencyPayloadHashes ?? {},
        abandonedCarts: parsed.abandonedCarts ?? [],
        inquiries: parsed.inquiries ?? [],
        manualBkashSubmissions:
          parsed.manualBkashSubmissions ?? [],
      };
      return state;
  }

  const initial = getInitialSeedState();
  writeErpState(initial);
  return initial;
}

export function writeErpState(state: ErpPersistentState): void {
  writeLocalJsonStore(DATA_FILE, state);
}

const PUBLIC_SETTINGS_KEYS = [
  'brandNameBn', 'brandNameEn', 'taglineBn', 'taglineEn', 'accentColorHex',
  'supportPhone', 'supportEmail', 'whatsappNumber', 'freeDeliveryThresholdPoisha',
  'globalFreeDelivery', 'bdPostDefaultPerKgPoisha', 'bkashManualNumber',
  'bkashInstructionBn', 'bkashInstructionEn', 'maintenanceMode',
  'maintenanceMessageBn', 'maintenanceMessageEn', 'demoMode',
] as const satisfies readonly (keyof SiteSettingsRecord)[];

export type PublicSafeSiteSettingsDTO = Pick<SiteSettingsRecord,
  typeof PUBLIC_SETTINGS_KEYS[number] | 'delayBanner' | 'promoCampaign' |
  'trustBadges' | 'heroBanners' | 'homepageSections' | 'legalPages' | 'aboutContactPage' | 'storefront'>;

function pickFields<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}

function mapPublicCategory(value: CategoryRecord): CategoryRecord {
  return pickFields(value, ['id', 'parentId', 'slug', 'nameBn', 'nameEn', 'descriptionBn', 'descriptionEn', 'iconName', 'sortOrder', 'isActive']);
}

/**
 * Rule 5.5: Strips internal ERP commission, escrow hold, min payout, packaging cost,
 * and fraud risk threshold fields before exposing site_settings to public/anon readers.
 */
export function sanitizeSiteSettingsForPublic(
  settings: PublicSafeSiteSettingsDTO
): PublicSafeSiteSettingsDTO {
  // Operational flags stay private. Nested promo/countdown fields are excluded
  // by the explicit allowlist below, independently of stored legacy content.
  const { flashCampaignsEnabled: _flashCampaignsEnabled, ...publicStorefront } = getStorefrontConfig(settings);
  return {
    ...pickFields(settings, PUBLIC_SETTINGS_KEYS),
    storefront: publicStorefront,
    delayBanner: pickFields(settings.delayBanner, ['enabled', 'messageBn', 'messageEn']),
    promoCampaign: pickFields(settings.promoCampaign, ['enabled', 'titleBn', 'titleEn', 'code', 'discountLabelBn', 'discountLabelEn']),
    trustBadges: settings.trustBadges.map((v) => pickFields(v, ['id', 'labelBn', 'labelEn', 'descBn', 'descEn'])),
    heroBanners: settings.heroBanners.map((v) => pickFields(v, ['id', 'titleBn', 'titleEn', 'subtitleBn', 'subtitleEn', 'ctaLabelBn', 'ctaLabelEn', 'ctaHref', 'badgeBn', 'badgeEn', 'imageUrl'])),
    homepageSections: settings.homepageSections.map((v) => pickFields(v, ['id', 'type', 'enabled', 'order', 'titleBn', 'titleEn'])),
    legalPages: Object.fromEntries(Object.entries(settings.legalPages).map(([key, v]) => [key, pickFields(v, ['titleBn', 'titleEn', 'contentBn', 'contentEn'])])),
    aboutContactPage: settings.aboutContactPage ? pickFields(settings.aboutContactPage, ['titleBn', 'titleEn', 'subtitleBn', 'subtitleEn', 'storyTitleBn', 'storyTitleEn', 'storyParagraph1Bn', 'storyParagraph1En', 'storyParagraph2Bn', 'storyParagraph2En', 'warehouseAddressBn', 'warehouseAddressEn', 'helplineHoursBn', 'helplineHoursEn']) : undefined,
  };
}


function mapInternalProductToPublicDTO(p: InternalProductRecord): StorefrontProductDTO {
  sanitizeRecordForRole(p as unknown as Record<string, unknown>, 'public_customer');
  return {
    productId: p.productId,
    categoryId: p.categoryId,
    slug: p.slug,
    nameBn: p.nameBn,
    nameEn: p.nameEn,
    descriptionBn: p.descriptionBn,
    descriptionEn: p.descriptionEn,
    specs: p.specs.map((v) => pickFields(v, ['labelBn', 'labelEn', 'valueBn', 'valueEn'])),
    variantAxes: p.variantAxes.filter((v) => typeof v === 'string'),
    images: p.images.filter((v) => typeof v === 'string'),
    isFeatured: p.isFeatured,
    isFreeDelivery: p.isFreeDelivery,
    requiresAdvanceCourierCharge: p.requiresAdvanceCourierCharge ?? false,
    customAdvanceDepositPoisha: p.customAdvanceDepositPoisha ?? 0,
    lowStockThreshold: p.lowStockThreshold,
    totalSoldCount: p.totalSoldCount,
    ratingAvgBp: p.ratingAvgBp,
    reviewCount: p.reviewCount,
    variants: p.variants.map((v) => ({
      variantId: v.variantId,
      publicSku: v.publicSku,
      titleBn: v.titleBn,
      titleEn: v.titleEn,
      attributes: Object.fromEntries(Object.entries(v.attributes).filter(([key, value]) => p.variantAxes.includes(key) && typeof value === 'string')),
      imageUrl: v.imageUrl,
      salePricePoisha: v.salePricePoisha,
      compareAtPricePoisha: v.compareAtPricePoisha,
      weightGrams: v.weightGrams,
      stockAvailable: v.stockAvailable,
    })),
  };
}

/**
 * Returns Customer-Safe Storefront Data.
 * Rule A2: Strips ALL vendor_id, vendorCode, internalVendorSku, supplierCostPoisha,
 * supplierProfitPoisha, supplierPayablePoisha, and platformMarginPoisha before returning!
 */
export function getPublicStorefrontData(): {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  products: StorefrontProductDTO[];
} {
  const state = readErpState();
  const sanitizedProducts = state.products
    .filter((p) => p.status === 'active')
    .map(mapInternalProductToPublicDTO);

  return {
    siteSettings: sanitizeSiteSettingsForPublic(state.siteSettings),
    categories: state.categories
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder).map(mapPublicCategory),
    products: sanitizedProducts,
  };
}

export const getPublicStorefrontCatalog = getPublicStorefrontData;

/**
 * Fetches a single product by slug for the Product Detail Page (PDP),
 * along with its verified reviews and related products.
 */
export function getPublicProductBySlug(slug: string): {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  product: StorefrontProductDTO | null;
  leadTimeDays: number;
  reviews: ProductReviewRecord[];
  relatedProducts: StorefrontProductDTO[];
} {
  const state = readErpState();
  const internalProduct = state.products.find(
    (p) => p.slug === slug && p.status === 'active'
  );

  if (!internalProduct) {
    return {
      siteSettings: sanitizeSiteSettingsForPublic(state.siteSettings),
      categories: state.categories.filter((c) => c.isActive).map(mapPublicCategory),
      product: null,
      leadTimeDays: 3,
      reviews: [],
      relatedProducts: [],
    };
  }

  const publicProduct = mapInternalProductToPublicDTO(internalProduct);
  const productReviews = state.reviews.filter(
    (r) => r.productId === internalProduct.productId
  );
  const relatedProducts = state.products
    .filter(
      (p) =>
        p.status === 'active' &&
        p.productId !== internalProduct.productId
    )
    .slice(0, 4)
    .map(mapInternalProductToPublicDTO);

  return {
    siteSettings: sanitizeSiteSettingsForPublic(state.siteSettings),
    categories: state.categories.filter((c) => c.isActive).map(mapPublicCategory),
    product: publicProduct,
    leadTimeDays: internalProduct.leadTimeDays,
    reviews: productReviews.map((v) => pickFields(v, ['id', 'productId', 'customerName', 'rating', 'comment', 'isVerifiedPurchase', 'createdAt'])),
    relatedProducts,
  };
}

/**
 * Validates a promo code against cart items on the server.
 * Never exposes platform margin to the client!
 */
export function validatePromoForCart(
  code: string,
  items: Array<{ variantId: string; quantity: number }>
): {
  valid: boolean;
  code: string;
  discountPoisha: Poisha;
  reasonBn: string;
} {
  const state = readErpState();
  const normalizedCode = code.trim().toUpperCase();
  const rule = state.promoCodes.find((p) => p.code.toUpperCase() === normalizedCode);

  if (!rule) {
    return {
      valid: false,
      code: normalizedCode,
      discountPoisha: 0,
      reasonBn: 'প্রোমো কোডটি সঠিক নয়।',
    };
  }

  const snapshots: ThreeTierPriceSnapshot[] = [];
  const vendorIdsInCart: string[] = [];

  for (const item of items) {
    for (const prod of state.products) {
      const variant = prod.variants.find((v) => v.variantId === item.variantId);
      if (variant) {
        snapshots.push(
          buildOrderItemPricingSnapshot({
            unitSupplierCostPoisha: variant.supplierCostPoisha,
            unitSupplierProfitPoisha: variant.supplierProfitPoisha,
            unitPlatformMarginPoisha: variant.platformMarginPoisha,
            quantity: item.quantity,
            productCommissionOverrideBp: prod.commissionOverrideBp,
            globalDefaultCommissionBp: state.siteSettings.globalDefaultCommissionBp,
            globalHoldDays: state.siteSettings.globalEscrowHoldDays,
          })
        );
        vendorIdsInCart.push(prod.vendorId);
      }
    }
  }

  if (snapshots.length === 0) {
    return {
      valid: false,
      code: normalizedCode,
      discountPoisha: 0,
      reasonBn: 'কার্টে কোনো বৈধ পণ্য পাওয়া যায়নি।',
    };
  }

  const evaluation = calculatePromoDiscount({
    promo: rule,
    items: snapshots,
    itemVendorIds: vendorIdsInCart,
  });

  return {
    valid: evaluation.valid,
    code: normalizedCode,
    discountPoisha: evaluation.discountPoisha,
    reasonBn:
      evaluation.reasonBn ??
      (evaluation.valid
        ? 'প্রোমো কোড সফলভাবে প্রয়োগ হয়েছে।'
        : 'প্রোমো কোডটি প্রযোজ্য নয়।'),
  };
}

/**
 * Masks phone number for public tracking view (e.g., 01712****78)
 */
export function maskBdPhone(phone: string): string {
  if (phone.length < 11) return phone;
  return `${phone.slice(0, 5)}****${phone.slice(-2)}`;
}

/**
 * Creates a new order from the Storefront Checkout with:
 * - Idempotency key deduplication
 * - Stock availability check & reservation
 * - 3-tier price snapshot on each line
 * - Promo discount deducted strictly from platform margin
 * - Address quality & risk score calculation
 */
export function createStorefrontOrder(input: CreateOrderInput, customerSessionToken?: string): {
  success: boolean;
  errorBn?: string;
  order?: PublicOrderTrackingDTO;
} {
  const state = readErpState();

  const principal = customerSessionToken ? verifyCustomerSessionToken(customerSessionToken) : null;
  if (customerSessionToken && (!principal || principal.phone !== input.customerPhone)) {
    return { success: false, errorBn: 'অ্যাকাউন্টের পরিচয় যাচাই ব্যর্থ হয়েছে।' };
  }
  if (!['cod', 'bkash_manual'].includes(input.paymentMethod)) {
    return { success: false, errorBn: 'শুধু COD ও ম্যানুয়াল বিকাশ অনুমোদিত।' };
  }

  // 1. Check Idempotency Key
  const idempotencyKey = principal ? `customer:${principal.customerId}:${input.idempotencyKey}` : input.idempotencyKey;
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({
    phone: input.customerPhone, name: input.customerName, district: input.districtId,
    upazila: input.upazilaId, address: input.streetAddress, landmark: input.landmark,
    items: input.items.map(item => ({ variantId: item.variantId, quantity: item.quantity })),
    payment: input.paymentMethod, delivery: input.deliveryMethod, promo: input.promoCode,
    reference: input.manualPaymentTrxId,
  })).digest('hex');
  const existingOrderNo = state.idempotencyKeys[idempotencyKey];
  if (existingOrderNo) {
    if (state.idempotencyPayloadHashes?.[idempotencyKey] && state.idempotencyPayloadHashes[idempotencyKey] !== payloadHash) {
      return { success: false, errorBn: 'একই অনুরোধের চাবি দিয়ে ভিন্ন অর্ডার পাঠানো যাবে না।' };
    }
    const existingTracking = getPublicOrderTracking(existingOrderNo);
    if (existingTracking) {
      return { success: true, order: existingTracking };
    }
  }

  const district = getDistrictById(input.districtId);
  const upazila = getUpazilaById(input.upazilaId);
  if (!district || !upazila || upazila.district_id !== district.id) {
    return {
      success: false,
      errorBn: 'নির্বাচিত জেলা এবং উপজেলা সঠিক নয়।',
    };
  }

  // 1b. Duplicate Manual bKash TrxID Prevention (Rule Section 8.3 & 11.2)
  if (input.paymentMethod === 'bkash_manual' && input.manualPaymentTrxId) {
    const normalizedTrx = input.manualPaymentTrxId.trim().toUpperCase();
    const duplicateTrxOrder = state.orders.find(
      (o) =>
        o.manualPaymentTrxId &&
        o.manualPaymentTrxId.trim().toUpperCase() === normalizedTrx &&
        o.status !== 'cancelled'
    );
    if (duplicateTrxOrder) {
      return {
        success: false,
        errorBn: `এই বিকাশ TrxID (${normalizedTrx}) পূর্বে অন্য একটি অর্ডারে ব্যবহৃত হয়েছে। ডুপ্লিকেট TrxID গ্রহণযোগ্য নয়।`,
      };
    }
  }

  // 2. Resolve items and verify atomic stock availability (including cumulative quantity across duplicate variant lines)
  const resolvedLines: Array<{
    product: InternalProductRecord;
    variant: InternalVariantRecord;
    quantity: number;
    snapshot: ThreeTierPriceSnapshot;
  }> = [];
  const cumulativeRequestedByVariant = new Map<string, number>();

  for (const reqItem of input.items) {
    if (!Number.isInteger(reqItem.quantity) || reqItem.quantity <= 0) {
      return {
        success: false,
        errorBn: 'পণ্যের পরিমাণ কমপক্ষে ১টি পূর্ণসংখ্যা হতে হবে।',
      };
    }

    let foundProduct: InternalProductRecord | undefined;
    let foundVariant: InternalVariantRecord | undefined;

    for (const p of state.products) {
      const v = p.variants.find((vr) => vr.variantId === reqItem.variantId);
      if (v) {
        foundProduct = p;
        foundVariant = v;
        break;
      }
    }

    if (!foundProduct || !foundVariant) {
      return {
        success: false,
        errorBn: 'কার্টের একটি পণ্য খুঁজে পাওয়া যায়নি।',
      };
    }

    const trueAvailable = Math.max(
      0,
      Math.min(
        foundVariant.stockAvailable,
        foundVariant.stockOnHand - foundVariant.stockReserved
      )
    );
    const prevRequested =
      cumulativeRequestedByVariant.get(foundVariant.variantId) ?? 0;
    const nextRequestedTotal = prevRequested + reqItem.quantity;

    if (trueAvailable < nextRequestedTotal) {
      return {
        success: false,
        errorBn: `"${foundProduct.nameBn}" পণ্যের পর্যাপ্ত স্টক নেই (স্টকে আছে ${trueAvailable} টি)।`,
      };
    }
    cumulativeRequestedByVariant.set(
      foundVariant.variantId,
      nextRequestedTotal
    );

    const snapshot = buildOrderItemPricingSnapshot({
      unitSupplierCostPoisha: foundVariant.supplierCostPoisha,
      unitSupplierProfitPoisha: foundVariant.supplierProfitPoisha,
      unitPlatformMarginPoisha: foundVariant.platformMarginPoisha,
      quantity: reqItem.quantity,
      productCommissionOverrideBp: foundProduct.commissionOverrideBp,
      globalDefaultCommissionBp: state.siteSettings.globalDefaultCommissionBp,
      globalHoldDays: state.siteSettings.globalEscrowHoldDays,
    });

    resolvedLines.push({
      product: foundProduct,
      variant: foundVariant,
      quantity: reqItem.quantity,
      snapshot,
    });
  }

  // 3. Calculate Subtotal, Weight, Supplier Payable & Platform Margin
  const snapshots = resolvedLines.map((l) => l.snapshot);
  const vendorIds = resolvedLines.map((l) => l.product.vendorId);

  const subtotalPoisha = snapshots.reduce((sum, s) => sum + s.lineSubtotalPoisha, 0);
  const totalSupplierPayablePoisha = snapshots.reduce(
    (sum, s) => sum + s.lineSupplierPayablePoisha,
    0
  );
  const totalWeightGrams = resolvedLines.reduce(
    (sum, l) => sum + l.variant.weightGrams * l.quantity,
    0
  );
  const allItemsFreeDelivery = resolvedLines.every((l) => l.product.isFreeDelivery);

  // 4. Evaluate Promo Code if provided
  let appliedDiscountPoisha = 0;
  if (input.promoCode) {
    const codeUpper = input.promoCode.trim().toUpperCase();
    const rule = state.promoCodes.find((r) => r.code.toUpperCase() === codeUpper);
    if (rule) {
      const promoEval = calculatePromoDiscount({
        promo: rule,
        items: snapshots,
        itemVendorIds: vendorIds,
      });
      if (promoEval.valid) {
        appliedDiscountPoisha = promoEval.discountPoisha;
      }
    }
  }

  // 5. Calculate Delivery Charge
  const districtRates = getDistrictDeliveryRates(
    district.id,
    state.siteSettings.bdPostDefaultPerKgPoisha
  );
  const deliveryCalc = calculateDeliveryCharge({
    method: input.deliveryMethod,
    totalWeightGrams,
    orderSubtotalPoisha: subtotalPoisha,
    freeDeliveryThresholdPoisha: state.siteSettings.freeDeliveryThresholdPoisha,
    isGlobalFreeDelivery: state.siteSettings.globalFreeDelivery,
    isAllItemsFreeDelivery: allItemsFreeDelivery,
    courierBaseRate1KgPoisha: districtRates.base1KgPoisha,
    courierExtraPerKgPoisha: districtRates.extraPerKgPoisha,
    bdPostPerKgPoisha: districtRates.bdPostPerKgPoisha,
  });

  // 6. Address Quality & Risk Score
  const addrQuality = evaluateAddressQuality({
    districtId: district.id,
    upazilaId: upazila.id,
    streetAddress: input.streetAddress,
    landmark: input.landmark,
    customerPhone: input.customerPhone,
  });

  const totalPayablePoisha =
    subtotalPoisha - appliedDiscountPoisha + deliveryCalc.finalChargePoisha;

  // Rule 4.7: Unverified Manual bKash submissions NEVER count as paid/advance until verified by an admin checker.
  const submittedBkashPoisha =
    input.paymentMethod !== 'cod' && input.manualPaymentTrxId
      ? input.advancePaidPoisha > 0
        ? input.advancePaidPoisha
        : deliveryCalc.finalChargePoisha
      : 0;

  if (input.paymentMethod !== 'cod' && input.manualPaymentTrxId) {
    const cleanTrx = input.manualPaymentTrxId.trim().toUpperCase();
    const duplicateInOrders = state.orders.find(
      (o) =>
        o.manualPaymentTrxId &&
        o.manualPaymentTrxId.trim().toUpperCase() === cleanTrx &&
        o.status !== 'cancelled'
    );
    const duplicateInSubs = (state.manualBkashSubmissions ?? []).find(
      (s) => s.trxId.toUpperCase() === cleanTrx && s.status !== 'rejected'
    );
    if (duplicateInOrders || duplicateInSubs) {
      return {
        success: false,
        errorBn: `এই বিকাশ TrxID (${cleanTrx}) ইতোমধ্যে অন্য একটি অর্ডারে ব্যবহৃত হয়েছে।`,
      };
    }
  }

  const advancePaidPoisha = 0;
  const codCollectablePoisha = totalPayablePoisha;

  const isDuplicate = state.orders.some(
    (o) =>
      o.customerPhone === input.customerPhone &&
      o.status !== 'delivered' &&
      o.status !== 'cancelled'
  );

  const riskEval = calculateOrderRiskScore({
    customerTotalOrders: 0,
    customerReturnedOrders: 0,
    isCustomerBlacklisted: false,
    addressQualityScore: addrQuality.score,
    districtSuccessRateBp: 9000,
    totalPayablePoisha,
    source: input.source,
    mandatoryAdvanceThresholdScore: state.siteSettings.riskAdvanceMandatoryScore,
  });

  const codFeePoisha = applyBasisPointsHalfUp(codCollectablePoisha, 100); // 1% COD fee estimate
  const unrecoveredCourierPoisha = Math.max(
    0,
    deliveryCalc.actualCourierCostPoisha - deliveryCalc.finalChargePoisha
  );

  const netProfitEval = calculateAutoNetProfit({
    grossDeliveredSalesPoisha: subtotalPoisha,
    supplierPayablePoisha: totalSupplierPayablePoisha,
    promoDiscountPoisha: appliedDiscountPoisha,
    adSpendPoisha: 0,
    packagingCostPoisha: state.siteSettings.defaultPackagingCostPoisha,
    unrecoveredCourierChargePoisha: unrecoveredCourierPoisha,
    returnLossPoisha: 0,
    damageLossPoisha: 0,
    otherExpensePoisha: codFeePoisha,
  });

  // 7. Reserve Stock & Create Order Record
  const orderSeq = state.orders.length + 1;
  const orderNo = `ORD-261106-${String(orderSeq).padStart(4, '0')}`;
  const orderId = `00000000-0000-4000-8000-${String(500 + orderSeq).padStart(12, '0')}`;
  const nowIso = new Date().toISOString();
  const secureTrackingToken = generateSecureOrderTrackingToken();
  const trackingTokenExpiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  for (const line of resolvedLines) {
    line.variant.stockAvailable -= line.quantity;
    line.variant.stockReserved += line.quantity;
    line.product.totalSoldCount += line.quantity;
  }

  const newOrderRow: OrderGridRowDTO = {
    id: orderId,
    customerId: principal?.customerId ?? null,
    orderNo,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    districtId: district.id,
    districtNameBn: district.name_bn,
    upazilaId: upazila.id,
    upazilaNameBn: upazila.name_bn,
    streetAddress: input.streetAddress,
    landmark: input.landmark ?? '',
    addressQualityScore: addrQuality.score,
    addressFlags: addrQuality.flags,
    source: input.source,
    status: 'pending_confirmation',
    deliveryMethod: deliveryCalc.isFreeDeliveryApplied
      ? 'free'
      : input.deliveryMethod,
    courierProvider:
      input.deliveryMethod === 'post_office' ? 'bd_post' : 'steadfast',
    consignmentId: null,
    trackingCode: null,
    subtotalPoisha,
    discountPoisha: appliedDiscountPoisha,
    deliveryChargePoisha: deliveryCalc.finalChargePoisha,
    totalPayablePoisha,
    advancePaidPoisha,
    codCollectablePoisha,
    paymentMethod: input.paymentMethod,
    paymentStatus: 'unpaid',
    manualPaymentTrxId: input.manualPaymentTrxId
      ? input.manualPaymentTrxId.trim().toUpperCase()
      : null,
    riskScore: riskEval.riskScore,
    isAdvanceMandatory:
      riskEval.isAdvanceMandatory ||
      resolvedLines.some((l) => l.product.requiresAdvanceCourierCharge),
    isDuplicateFlagged: isDuplicate,
    nextBestAction:
      input.paymentMethod !== 'cod' && input.manualPaymentTrxId
        ? 'VERIFY_BKASH_TRX'
        : 'CALL_TO_CONFIRM',
    printCount: 0,
    snapTotalSupplierPayablePoisha: totalSupplierPayablePoisha,
    estimatedNetProfitPoisha: netProfitEval.netProfitPoisha,
    secureTrackingToken,
    trackingTokenExpiresAt,
    createdAt: nowIso,
  };

  if (input.paymentMethod !== 'cod' && input.manualPaymentTrxId && submittedBkashPoisha > 0) {
    const cleanTrx = input.manualPaymentTrxId.trim().toUpperCase();
    const provider: 'bkash' | 'nagad' | 'rocket' =
      input.paymentMethod === 'nagad_manual'
        ? 'nagad'
        : input.paymentMethod === 'rocket_manual'
        ? 'rocket'
        : 'bkash';
    state.manualBkashSubmissions = state.manualBkashSubmissions ?? [];
    state.manualBkashSubmissions.unshift({
      submissionId: `sub-${orderNo}-${cleanTrx}`,
      orderNo,
      senderPhone: input.customerPhone,
      senderPhoneMasked: maskBdPhone(input.customerPhone),
      orderCustomerPhone: input.customerPhone,
      senderPhoneMatchesOrderPhone: true,
      trxId: cleanTrx,
      provider,
      submittedAmountPoisha: Math.min(totalPayablePoisha, submittedBkashPoisha),
      expectedPayablePoisha: totalPayablePoisha,
      status: 'pending_verification',
      submittedByRole: 'customer',
      submittedByUsername: 'customer',
      reviewedByUsername: null,
      reviewNoteBn: null,
      submittedAt: nowIso,
      reviewedAt: null,
    });
  }

  let remainingOrderDiscount = appliedDiscountPoisha;
  const newOrderLines: InternalOrderLineRecord[] = resolvedLines.map((l) => {
    const lineSub = l.snapshot.lineSubtotalPoisha;
    const lineGrossMargin = l.snapshot.linePlatformMarginPoisha;
    const lineDisc = Math.min(remainingOrderDiscount, lineGrossMargin);
    remainingOrderDiscount -= lineDisc;
    return {
      orderId,
      productId: l.product.productId,
      variantId: l.variant.variantId,
      vendorId: l.product.vendorId,
      productNameBn: l.product.nameBn,
      productNameEn: l.product.nameEn,
      variantTitleBn: l.variant.titleBn,
      variantTitleEn: l.variant.titleEn,
      publicSku: l.variant.publicSku,
      internalVendorSku: l.variant.internalVendorSku,
      quantity: l.quantity,
      weightGrams: l.variant.weightGrams,
      snapSupplierCostPoisha: l.snapshot.unitSupplierCostPoisha,
      snapSupplierProfitPoisha: l.snapshot.unitSupplierProfitPoisha,
      snapSupplierPayablePoisha: l.snapshot.unitSupplierPayablePoisha,
      snapPlatformMarginPoisha: l.snapshot.unitPlatformMarginPoisha,
      snapUnitSalePricePoisha: l.snapshot.unitSalePricePoisha,
      lineSubtotalPoisha: lineSub,
      lineDiscountPoisha: lineDisc,
      lineNetPlatformMarginPoisha: Math.max(0, lineGrossMargin - lineDisc),
    };
  });

  state.orders.unshift(newOrderRow);
  state.orderLines.push(...newOrderLines);
  state.idempotencyKeys[idempotencyKey] = orderNo;
  state.idempotencyPayloadHashes ??= {};
  state.idempotencyPayloadHashes[idempotencyKey] = payloadHash;
  state.abandonedCarts = state.abandonedCarts.filter(
    (c) => c.customerPhone !== input.customerPhone
  );
  writeErpState(state);

  const trackingDTO = getPublicOrderTracking(orderNo);
  return {
    success: true,
    order: trackingDTO ?? undefined,
  };
}

function maskCustomerDisplayName(name: string): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length <= 2) return trimmed;
  const parts = trimmed.split(/\s+/);
  return parts
    .map((p, idx) => {
      if (idx === 0) return p;
      return `${p.slice(0, 1)}***`;
    })
    .join(' ');
}

function mapOrderRowToPublicTrackingDTO(
  order: OrderGridRowDTO,
  lines: InternalOrderLineRecord[]
): PublicOrderTrackingDTO {
  return {
    orderNo: order.orderNo,
    secureTrackingToken:
      order.secureTrackingToken ?? generateSecureOrderTrackingToken(order.orderNo),
    status: order.status,
    customerName: maskCustomerDisplayName(order.customerName),
    customerPhoneMasked: maskBdPhone(order.customerPhone),
    districtNameBn: order.districtNameBn,
    upazilaNameBn: order.upazilaNameBn,
    deliveryMethod: order.deliveryMethod,
    courierProvider: order.courierProvider,
    trackingCode: order.trackingCode,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotalPoisha: order.subtotalPoisha,
    discountPoisha: order.discountPoisha,
    deliveryChargePoisha: order.deliveryChargePoisha,
    totalPayablePoisha: order.totalPayablePoisha,
    advancePaidPoisha: order.advancePaidPoisha,
    codCollectablePoisha: order.codCollectablePoisha,
    createdAt: order.createdAt,
    items: lines.map((l) => ({
      productNameBn: l.productNameBn,
      productNameEn: l.productNameEn,
      variantTitleBn: l.variantTitleBn,
      variantTitleEn: l.variantTitleEn,
      publicSku: l.publicSku,
      quantity: l.quantity,
      unitSalePricePoisha: l.snapUnitSalePricePoisha,
      lineSubtotalPoisha: l.lineSubtotalPoisha,
    })),
  };
}

/**
 * Public Order Tracking lookup strictly requiring a cryptographically random `secureTrackingToken`.
 * Rejects sequential `ORD-...` order numbers to prevent public PII/order enumeration.
 */
export function getPublicOrderTrackingByToken(secureToken: string): {
  allowed: boolean;
  code?: 'INVALID_TOKEN' | 'SEQUENTIAL_ORDER_NO_FORBIDDEN' | 'TOKEN_EXPIRED' | 'NOT_FOUND';
  errorBn?: string;
  order?: PublicOrderTrackingDTO;
} {
  const trimmed = (secureToken ?? '').trim();
  if (!trimmed) {
    return {
      allowed: false,
      code: 'INVALID_TOKEN',
      errorBn: 'ট্র্যাকিং টোকেন প্রদান করা হয়নি।',
    };
  }
  if (/^ORD-/i.test(trimmed)) {
    return {
      allowed: false,
      code: 'SEQUENTIAL_ORDER_NO_FORBIDDEN',
      errorBn:
        'গোপনীয়তা সুরক্ষার কারণে শুধু ক্রমিক অর্ডার নম্বর (Order No) দিয়ে পাবলিক অর্ডার ট্র্যাকিং অনুমোদিত নয়। অনুগ্রহ করে আপনার সিকিউর ট্র্যাকিং লিংক অথবা কাস্টমার অ্যাকাউন্টে ওটিপি ভেরিফিকেশন ব্যবহার করুন।',
    };
  }
  if (!/^trk_[a-f0-9]{24,64}$/i.test(trimmed)) {
    return {
      allowed: false,
      code: 'INVALID_TOKEN',
      errorBn: 'সিকিউর ট্র্যাকিং টোকেন ফরম্যাট সঠিক নয়।',
    };
  }

  const state = readErpState();
  const order = state.orders.find((o) => o.secureTrackingToken === trimmed);
  if (!order) {
    return {
      allowed: false,
      code: 'NOT_FOUND',
      errorBn: 'প্রদত্ত ট্র্যাকিং টোকেনের বিপরীতে কোনো অর্ডার পাওয়া যায়নি।',
    };
  }

  if (
    order.trackingTokenExpiresAt &&
    order.trackingTokenExpiresAt <= new Date().toISOString()
  ) {
    return {
      allowed: false,
      code: 'TOKEN_EXPIRED',
      errorBn: 'এই ট্র্যাকিং লিংকের মেয়াদ শেষ হয়ে গেছে। কাস্টমার অ্যাকাউন্টে লগইন করে অর্ডার দেখুন।',
    };
  }

  const lines = state.orderLines.filter((l) => l.orderId === order.id);
  return {
    allowed: true,
    order: mapOrderRowToPublicTrackingDTO(order, lines),
  };
}

/**
 * Returns a Customer-Safe PII-Redacted Order Tracking DTO.
 * Rule A2 & 4.5: Never returns vendorId, internalVendorSku, supplierCostPoisha, netProfit, streetAddress, landmark, or unmasked phone!
 */
export function getPublicOrderTracking(
  tokenOrOrderNo: string
): PublicOrderTrackingDTO | null {
  const state = readErpState();
  const trimmed = (tokenOrOrderNo ?? '').trim();
  if (!trimmed) return null;

  const order = state.orders.find(
    (o) =>
      o.secureTrackingToken === trimmed ||
      o.orderNo.toUpperCase() === trimmed.toUpperCase()
  );
  if (!order) return null;

  const lines = state.orderLines.filter((l) => l.orderId === order.id);
  return mapOrderRowToPublicTrackingDTO(order, lines);
}

/**
 * Returns sanitized customer order history by phone.
 * Rule A2: Zero cost, vendorId, or margin leaks.
 */
export function getCustomerOrdersByPhone(
  phone: string
): PublicOrderTrackingDTO[] {
  const state = readErpState();
  const normalizedPhone = phone.trim();
  const matchingOrders = state.orders.filter(
    (o) => o.customerPhone === normalizedPhone
  );

  return matchingOrders
    .map((o) => getPublicOrderTracking(o.orderNo))
    .filter((t): t is PublicOrderTrackingDTO => t !== null);
}

/**
 * Returns full customer order details (including streetAddress & landmark) ONLY for an authenticated
 * customer session whose verified phone matches `order.customerPhone`.
 */
export function getAuthenticatedCustomerOrdersByPhone(
  verifiedPhone: string
): AuthenticatedCustomerOrderDTO[] {
  const state = readErpState();
  const cleanPhone = verifiedPhone.trim();
  const matchingOrders = state.orders.filter(
    (o) => o.customerPhone === cleanPhone
  );

  return matchingOrders.map((o) => {
    const lines = state.orderLines.filter((l) => l.orderId === o.id);
    const base = mapOrderRowToPublicTrackingDTO(o, lines);
    return {
      ...base,
      customerName: o.customerName,
      streetAddress: o.streetAddress,
      landmark: o.landmark || null,
    };
  });
}

/**
 * Submits a customer product review.
 * Checks if customerPhone matches an existing order for that product to set isVerifiedPurchase.
 */
export function getAuthenticatedCustomerOrders(sessionToken: string | undefined): AuthenticatedCustomerOrderDTO[] {
  const session = verifyCustomerSessionToken(sessionToken);
  if (!session) return [];
  const state = readErpState();
  return state.orders.filter((o) => o.customerId === session.customerId).map((o) => ({
    ...mapOrderRowToPublicTrackingDTO(o, state.orderLines.filter((l) => l.orderId === o.id)),
    streetAddress: o.streetAddress,
    landmark: o.landmark || null,
  }));
}

export function customerOwnsOrder(sessionToken: string | undefined, orderNo: string): boolean {
  const session = verifyCustomerSessionToken(sessionToken);
  return Boolean(session && readErpState().orders.some((o) => o.customerId === session.customerId && o.orderNo.toUpperCase() === orderNo.trim().toUpperCase()));
}

export function submitProductReview(input: {
  productId: string;
  customerName: string;
  customerPhone: string;
  rating: number;
  comment: string;
}, customerSessionToken?: string): {
  success: boolean;
  errorBn?: string;
  review?: ProductReviewRecord;
} {
  const state = readErpState();
  const product = state.products.find((p) => p.productId === input.productId);
  if (!product) {
    return { success: false, errorBn: 'পণ্যটি খুঁজে পাওয়া যায়নি।' };
  }

  const principal = verifyCustomerSessionToken(customerSessionToken);
  const customerOrders = state.orders.filter(
    (o) => principal && o.customerId === principal.customerId && o.status === 'delivered'
  );
  const customerOrderIds = new Set(customerOrders.map((o) => o.id));
  const hasPurchasedProduct = state.orderLines.some(
    (line) =>
      customerOrderIds.has(line.orderId) && line.productId === input.productId
  );

  const clampedRating = Math.min(5, Math.max(1, Math.round(input.rating)));
  const newReview: ProductReviewRecord = {
    id: `rev-${Date.now()}`,
    productId: input.productId,
    customerName: input.customerName.trim(),
    rating: clampedRating,
    comment: input.comment.trim(),
    isVerifiedPurchase: hasPurchasedProduct,
    createdAt: new Date().toISOString(),
  };

  state.reviews.unshift(newReview);
  const prodReviews = state.reviews.filter((r) => r.productId === input.productId);
  const avgBp = Math.round(
    (prodReviews.reduce((s, r) => s + r.rating, 0) / prodReviews.length) * 100
  );
  product.reviewCount = prodReviews.length;
  product.ratingAvgBp = avgBp;

  writeErpState(state);
  return { success: true, review: newReview };
}

/**
 * Saves an abandoned cart snapshot when a customer enters their phone number on Checkout.
 */
export function saveAbandonedCartSnapshot(input: {
  customerPhone: string;
  customerName: string;
  districtId: number;
  items: Array<{ variantId: string; quantity: number }>;
}): { saved: boolean } {
  const state = readErpState();
  const resolvedItems: AbandonedCartSnapshot['items'] = [];
  let subtotalPoisha = 0;

  for (const item of input.items) {
    for (const prod of state.products) {
      const variant = prod.variants.find((v) => v.variantId === item.variantId);
      if (variant) {
        const lineSub = variant.salePricePoisha * item.quantity;
        subtotalPoisha += lineSub;
        resolvedItems.push({
          productId: prod.productId,
          variantId: variant.variantId,
          productNameBn: prod.nameBn,
          variantTitleBn: variant.titleBn,
          quantity: item.quantity,
          unitSalePricePoisha: variant.salePricePoisha,
        });
      }
    }
  }

  if (resolvedItems.length === 0) {
    return { saved: false };
  }

  const snapshot: AbandonedCartSnapshot = {
    customerPhone: input.customerPhone,
    customerName: input.customerName.trim() || 'সম্ভাব্য ক্রেতা',
    districtId: input.districtId,
    subtotalPoisha,
    items: resolvedItems,
    updatedAt: new Date().toISOString(),
  };

  const existingIdx = state.abandonedCarts.findIndex(
    (c) => c.customerPhone === input.customerPhone
  );
  if (existingIdx >= 0) {
    state.abandonedCarts[existingIdx] = snapshot;
  } else {
    state.abandonedCarts.unshift(snapshot);
  }

  writeErpState(state);
  return { saved: true };
}

/**
 * Admin Product & Multi-Variant CRUD with 3-Tier Poisha Validation
 */
export function upsertAdminProduct(input: {
  productId?: string;
  vendorId: string;
  categoryId: string;
  nameBn: string;
  nameEn: string;
  slug?: string;
  descriptionBn: string;
  descriptionEn?: string;
  isFeatured?: boolean;
  isFreeDelivery?: boolean;
  requiresAdvanceCourierCharge?: boolean;
  customAdvanceDepositPoisha?: Poisha;
  lowStockThreshold?: number;
  leadTimeDays?: number;
  commissionOverrideBp?: number | null;
  status?: 'draft' | 'active' | 'archived';
  images?: string[];
  specs?: Array<{ labelBn: string; labelEn: string; valueBn: string; valueEn: string }>;
  variants: Array<{
    variantId?: string;
    internalVendorSku?: string;
    publicSku: string;
    titleBn: string;
    titleEn?: string;
    attributes?: Record<string, string>;
    imageUrl?: string | null;
    supplierCostPoisha: Poisha;
    supplierProfitPoisha?: Poisha;
    platformMarginPoisha?: Poisha;
    salePricePoisha: Poisha;
    compareAtPricePoisha?: Poisha | null;
    weightGrams?: number;
    stockOnHand?: number;
  }>;
}): { success: boolean; errorBn?: string; product?: InternalProductRecord } {
  const state = readErpState();

  const nameBn = input.nameBn.trim();
  if (!nameBn) {
    return { success: false, errorBn: 'পণ্যের বাংলা নাম আবশ্যক।' };
  }

  const category = state.categories.find((c) => c.id === input.categoryId);
  if (!category) {
    return { success: false, errorBn: 'নির্বাচিত ক্যাটাগরি খুঁজে পাওয়া যায়নি।' };
  }

  if (!input.variants || input.variants.length === 0) {
    return { success: false, errorBn: 'কমপক্ষে ১টি ভ্যারিয়েন্ট যোগ করতে হবে।' };
  }

  // Derive or validate slug
  const baseSlug = (input.slug?.trim() || input.nameEn?.trim() || nameBn)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
  const targetSlug = baseSlug || `prod-${Date.now().toString().slice(-6)}`;

  const isEditing = Boolean(input.productId);
  const productId = input.productId || `prod-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;

  // Never invent a vendor when the registry is missing, invalid or the ID is unknown.
  const p4b = readLocalJsonStore<{
    vendors: Array<{ vendorId: string; vendorCode: string; businessNameBn: string; status: string }>;
  }>(path.join(DATA_DIR, 'erp-phase4b-store.json'), { arrays: ['vendors'] });
  const vendor = p4b?.vendors.find((entry) => entry.vendorId === input.vendorId && entry.status === 'active');
  if (!vendor) return { success: false, errorBn: 'সক্রিয় ভেন্ডর পাওয়া যায়নি। ভেন্ডর পরিচয় যাচাই করুন।' };
  const vendorCode = vendor.vendorCode;
  const vendorBusinessName = vendor.businessNameBn;

  const existingProduct = state.products.find((product) => product.productId === productId);
  if (state.products.some(product => product.slug === targetSlug && product.productId !== productId)) {
    return { success: false, errorBn: 'এই পণ্যের slug ইতিমধ্যে ব্যবহৃত হয়েছে। অন্য slug দিন।' };
  }
  const normalizedVariants: InternalVariantRecord[] = [];
  const variantIds = new Set<string>();
  const publicSkus = new Set<string>();

  for (const v of input.variants) {
    const costPoisha = v.supplierCostPoisha;
    const salePoisha = v.salePricePoisha;
    const profitPoisha = v.supplierProfitPoisha ?? 0;
    if (![costPoisha, salePoisha, profitPoisha, v.stockOnHand ?? 0].every(Number.isSafeInteger) ||
        profitPoisha < 0 || (v.stockOnHand !== undefined && v.stockOnHand < 0)) {
      return { success: false, errorBn: 'মূল্য ও স্টক সঠিক পূর্ণসংখ্যা হতে হবে।' };
    }

    if (costPoisha <= 0 || salePoisha <= 0) {
      return { success: false, errorBn: 'ক্রয়মূল্য এবং বিক্রয়মূল্য শূন্যের বেশি হতে হবে।' };
    }

    if (salePoisha < costPoisha) {
      return { success: false, errorBn: `বিক্রয়মূল্য (${salePoisha / 100} ৳) অবশ্যই সাপ্লায়ার কস্টের (${costPoisha / 100} ৳) চেয়ে বেশি হতে হবে।` };
    }

    const payablePoisha = costPoisha + profitPoisha;
    const marginPoisha = salePoisha - payablePoisha;
    if (!Number.isSafeInteger(payablePoisha) || marginPoisha < 0 ||
        (v.platformMarginPoisha !== undefined && v.platformMarginPoisha !== marginPoisha)) {
      return { success: false, errorBn: 'বিক্রয়মূল্য সাপ্লায়ার প্রদেয় ও প্ল্যাটফর্ম মার্জিনের সমান হতে হবে।' };
    }

    const variantId = v.variantId || `var-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;
    const publicSku = v.publicSku.trim().toUpperCase() || `BG-${targetSlug.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
    const internalVendorSku = v.internalVendorSku?.trim().toUpperCase() || `${vendorCode}-${publicSku}`;

    const previousVariant = existingProduct?.variants.find((variant) => variant.variantId === variantId);
    if (variantIds.has(variantId) || publicSkus.has(publicSku) ||
        state.products.some((product) => product.variants.some((variant) =>
          (variant.publicSku === publicSku && variant.variantId !== variantId) ||
          (product.productId !== productId && variant.variantId === variantId)))) {
      return { success: false, errorBn: 'একই ভ্যারিয়েন্ট বা SKU একাধিকবার ব্যবহার করা যাবে না।' };
    }
    variantIds.add(variantId);
    publicSkus.add(publicSku);
    const stockOnHand = previousVariant?.stockOnHand ?? v.stockOnHand ?? 0;
    if (previousVariant && v.stockOnHand !== undefined && v.stockOnHand !== previousVariant.stockOnHand) {
      return { success: false, errorBn: 'স্টক পরিবর্তনের জন্য কারণসহ ইনভেন্টরি সমন্বয় ব্যবহার করুন।' };
    }

    normalizedVariants.push({
      variantId,
      productId,
      internalVendorSku,
      publicSku,
      titleBn: v.titleBn.trim() || 'স্ট্যান্ডার্ড',
      titleEn: v.titleEn?.trim() || v.titleBn.trim() || 'Standard',
      attributes: v.attributes ?? { Version: 'Standard' },
      imageUrl: v.imageUrl || input.images?.[0] || 'https://picsum.photos/seed/bongo-prod/800/800',
      supplierCostPoisha: costPoisha,
      supplierProfitPoisha: profitPoisha,
      supplierPayablePoisha: payablePoisha,
      platformMarginPoisha: marginPoisha,
      salePricePoisha: salePoisha,
      compareAtPricePoisha: v.compareAtPricePoisha ? Math.round(v.compareAtPricePoisha) : null,
      weightGrams: Math.max(100, Math.round(v.weightGrams ?? 500)),
      stockOnHand,
      stockReserved: previousVariant?.stockReserved ?? 0,
      stockInTransit: previousVariant?.stockInTransit ?? 0,
      stockDamaged: previousVariant?.stockDamaged ?? 0,
      stockAvailable: previousVariant?.stockAvailable ?? stockOnHand,
    });
  }

  const existingIdx = state.products.findIndex((p) => p.productId === productId);
  if (existingProduct?.variants.some((variant) => !variantIds.has(variant.variantId) &&
      (variant.stockOnHand > 0 || variant.stockReserved > 0 || variant.stockInTransit > 0 ||
       state.orderLines.some((line) => line.variantId === variant.variantId)))) {
    return { success: false, errorBn: 'স্টক বা অর্ডারযুক্ত ভ্যারিয়েন্ট মুছে ফেলা যাবে না।' };
  }

  const productRecord: InternalProductRecord = {
    productId,
    vendorId: input.vendorId,
    vendorCode,
    vendorBusinessName,
    categoryId: input.categoryId,
    slug: targetSlug,
    nameBn,
    nameEn: input.nameEn?.trim() || nameBn,
    descriptionBn: input.descriptionBn.trim() || 'প্রিমিয়াম কনসাইনমেন্ট পণ্য।',
    descriptionEn: input.descriptionEn?.trim() || input.descriptionBn.trim(),
    specs: input.specs && input.specs.length > 0 ? input.specs : [
      { labelBn: 'মান নিয়ন্ত্রণ', labelEn: 'Quality QC', valueBn: '১০০% অরিজিনাল ও ভেরিফাইড', valueEn: '100% Original & Verified' }
    ],
    variantAxes: Object.keys(normalizedVariants[0]?.attributes ?? { Version: 'Standard' }),
    images: input.images && input.images.length > 0 ? input.images : [
      normalizedVariants[0]?.imageUrl || 'https://picsum.photos/seed/bongo-prod/800/800'
    ],
    isFeatured: input.isFeatured ?? true,
    isFreeDelivery: input.isFreeDelivery ?? false,
    requiresAdvanceCourierCharge: input.requiresAdvanceCourierCharge ?? false,
    customAdvanceDepositPoisha: input.customAdvanceDepositPoisha ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? 5,
    leadTimeDays: input.leadTimeDays ?? 3,
    commissionOverrideBp: input.commissionOverrideBp ?? null,
    totalSoldCount: existingProduct?.totalSoldCount ?? 0,
    totalReturnedCount: existingProduct?.totalReturnedCount ?? 0,
    ratingAvgBp: existingProduct?.ratingAvgBp ?? 500,
    reviewCount: existingProduct?.reviewCount ?? 0,
    status: input.status ?? 'active',
    variants: normalizedVariants,
  };

  if (existingIdx >= 0) {
    state.products[existingIdx] = productRecord;
  } else {
    state.products.unshift(productRecord);
  }

  writeErpState(state);
  return { success: true, product: productRecord };
}

/**
 * Deletes or archives a product from the ERP
 */
export function deleteAdminProduct(productId: string): { success: boolean; errorBn?: string } {
  const state = readErpState();
  const idx = state.products.findIndex((p) => p.productId === productId);
  if (idx < 0) {
    return { success: false, errorBn: 'পণ্যটি খুঁজে পাওয়া যায়নি।' };
  }

  state.products.splice(idx, 1);
  writeErpState(state);
  return { success: true };
}

/**
 * Admin Category CRUD: Create or update storefront category
 */
export function upsertAdminCategory(input: {
  id?: string;
  nameBn: string;
  nameEn: string;
  slug?: string;
  descriptionBn: string;
  descriptionEn?: string;
  iconName?: string;
  sortOrder?: number;
  isActive?: boolean;
}): { success: boolean; errorBn?: string; category?: CategoryRecord } {
  const state = readErpState();

  const nameBn = input.nameBn.trim();
  if (!nameBn) {
    return { success: false, errorBn: 'ক্যাটাগরির বাংলা নাম আবশ্যক।' };
  }

  const categoryId = input.id || `cat-${Date.now().toString().slice(-6)}`;
  const slug = (input.slug?.trim() || input.nameEn?.trim() || nameBn)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

  const catRecord: CategoryRecord = {
    id: categoryId,
    parentId: null,
    slug: slug || categoryId,
    nameBn,
    nameEn: input.nameEn?.trim() || nameBn,
    descriptionBn: input.descriptionBn.trim() || 'প্রিমিয়াম কালেকশন।',
    descriptionEn: input.descriptionEn?.trim() || input.descriptionBn.trim(),
    iconName: input.iconName || 'Package',
    sortOrder: input.sortOrder ?? state.categories.length + 1,
    isActive: input.isActive ?? true,
  };

  const existingIdx = state.categories.findIndex((c) => c.id === categoryId);
  if (existingIdx >= 0) {
    state.categories[existingIdx] = catRecord;
  } else {
    state.categories.push(catRecord);
  }

  writeErpState(state);
  return { success: true, category: catRecord };
}

export interface ManualBkashSubmissionDTO {
  submissionId: string;
  orderNo: string;
  senderPhoneMasked: string;
  senderPhoneMatchesOrderPhone: boolean;
  trxId: string;
  submittedAmountPoisha: Poisha;
  submittedAmountPaisaStr: string;
  expectedPayablePoisha: Poisha;
  verificationStatus: ManualBkashSubmissionStatus;
  submittedAt: string;
}

/**
 * Submits a Manual bKash TrxID for an existing order (Rule 4.7):
 * - Enforces idempotency by idempotencyKey
 * - Validates submittedAmountPoisha > 0 and <= remaining unpaid balance (totalPayablePoisha - advancePaidPoisha)
 * - Enforces Duplicate TrxID Prevention across all orders and submissions
 * - Records senderPhoneMatchesOrderPhone flag
 * - NEVER adds submittedAmountPoisha to advancePaidPoisha or reduces codCollectablePoisha before admin verification!
 */
export function submitManualBkashPayment(input: {
  orderNo: string;
  senderPhone: string;
  trxId: string;
  provider?: 'bkash' | 'nagad' | 'rocket';
  submittedAmountPoisha: number;
  idempotencyKey: string;
  submittedByRole?: 'customer' | SystemRoleSlug;
  submittedByUsername?: string;
}): {
  success: boolean;
  code?: 'ORDER_NOT_FOUND' | 'DUPLICATE_TRX_ID' | 'INVALID_AMOUNT';
  errorBn?: string;
  submission?: ManualBkashSubmissionDTO;
} {
  if (input.provider && input.provider !== 'bkash') return { success: false, errorBn: 'শুধু ম্যানুয়াল বিকাশ অনুমোদিত।' };
  const state = readErpState();
  state.manualBkashSubmissions = state.manualBkashSubmissions ?? [];
  const normalizedTrx = input.trxId.trim().toUpperCase();
  const orderNoTrimmed = input.orderNo.trim().toUpperCase();

  if (
    !Number.isSafeInteger(input.submittedAmountPoisha) ||
    input.submittedAmountPoisha <= 0
  ) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      errorBn: 'জমাকৃত টাকার পরিমাণ পূর্ণসংখ্যা পয়সায় (Poisha > 0) হতে হবে।',
    };
  }

  const targetOrder = state.orders.find(
    (o) => o.orderNo.toUpperCase() === orderNoTrimmed
  );
  if (!targetOrder) {
    return {
      success: false,
      code: 'ORDER_NOT_FOUND',
      errorBn: 'প্রদত্ত অর্ডার নম্বরটি খুঁজে পাওয়া যায়নি।',
    };
  }

  const remainingDuePoisha = Math.max(
    0,
    targetOrder.totalPayablePoisha - targetOrder.advancePaidPoisha
  );
  if (
    remainingDuePoisha <= 0 ||
    input.submittedAmountPoisha > remainingDuePoisha
  ) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      errorBn: `জমাকৃত অর্থ (${Math.round(input.submittedAmountPoisha / 100)} টাকা) অর্ডারের বকেয়া অর্থের (${Math.round(remainingDuePoisha / 100)} টাকা) চেয়ে বেশি হতে পারবে না।`,
    };
  }

  const cleanSenderPhone = input.senderPhone.replace(/\D/g, '').slice(-11);
  const cleanOrderPhone = targetOrder.customerPhone.replace(/\D/g, '').slice(-11);
  const senderPhoneMatchesOrderPhone = cleanSenderPhone === cleanOrderPhone;

  // Idempotent replay check on same order + same TrxID
  const idempKey = `bkash_sub_${input.idempotencyKey.trim()}`;
  if (
    state.idempotencyKeys[idempKey] === targetOrder.orderNo &&
    targetOrder.manualPaymentTrxId?.toUpperCase() === normalizedTrx
  ) {
    const existingSub = state.manualBkashSubmissions.find(
      (s) =>
        s.orderNo.toUpperCase() === orderNoTrimmed &&
        s.trxId.toUpperCase() === normalizedTrx
    );
    return {
      success: true,
      submission: {
        submissionId:
          existingSub?.submissionId ?? `sub-${targetOrder.orderNo}-${normalizedTrx}`,
        orderNo: targetOrder.orderNo,
        senderPhoneMasked: maskBdPhone(cleanSenderPhone),
        senderPhoneMatchesOrderPhone,
        trxId: normalizedTrx,
        submittedAmountPoisha: input.submittedAmountPoisha,
        submittedAmountPaisaStr: String(input.submittedAmountPoisha),
        expectedPayablePoisha: remainingDuePoisha,
        verificationStatus: existingSub?.status ?? 'pending_verification',
        submittedAt: existingSub?.submittedAt ?? targetOrder.createdAt,
      },
    };
  }

  // Duplicate TrxID check across all orders and non-rejected submissions
  const duplicateOrder = state.orders.find(
    (o) =>
      o.orderNo.toUpperCase() !== orderNoTrimmed &&
      o.manualPaymentTrxId &&
      o.manualPaymentTrxId.trim().toUpperCase() === normalizedTrx &&
      o.status !== 'cancelled'
  );
  const duplicateSub = state.manualBkashSubmissions.find(
    (s) =>
      s.trxId.toUpperCase() === normalizedTrx &&
      s.status !== 'rejected'
  );

  if (duplicateOrder || duplicateSub) {
    return {
      success: false,
      code: 'DUPLICATE_TRX_ID',
      errorBn: `এই বিকাশ TrxID (${normalizedTrx}) ইতোমধ্যে অন্য একটি অর্ডারে ব্যবহৃত হয়েছে। একই TrxID একাধিক অর্ডারে ব্যবহার করা যাবে না।`,
    };
  }

  const nowIso = new Date().toISOString();
  const chosenProvider: 'bkash' | 'nagad' | 'rocket' = input.provider ?? 'bkash';
  const submissionRecord: ManualBkashSubmissionRecord = {
    submissionId: `sub-${targetOrder.orderNo}-${normalizedTrx}`,
    orderNo: targetOrder.orderNo,
    senderPhone: cleanSenderPhone,
    senderPhoneMasked: maskBdPhone(cleanSenderPhone),
    orderCustomerPhone: cleanOrderPhone,
    senderPhoneMatchesOrderPhone,
    trxId: normalizedTrx,
    provider: chosenProvider,
    submittedAmountPoisha: input.submittedAmountPoisha,
    expectedPayablePoisha: remainingDuePoisha,
    status: 'pending_verification',
    submittedByRole: input.submittedByRole ?? 'customer',
    submittedByUsername: input.submittedByUsername ?? 'customer',
    reviewedByUsername: null,
    reviewNoteBn: null,
    submittedAt: nowIso,
    reviewedAt: null,
  };

  state.manualBkashSubmissions.unshift(submissionRecord);

  // Rule 4.7: Do NOT increase advancePaidPoisha or reduce codCollectablePoisha before admin verification!
  targetOrder.paymentMethod = 'bkash_manual';
  targetOrder.manualPaymentTrxId = normalizedTrx;
  if (targetOrder.paymentStatus !== 'paid_verified' && targetOrder.paymentStatus !== 'partial_verified') {
    targetOrder.paymentStatus = 'unpaid';
  }
  targetOrder.nextBestAction = 'VERIFY_BKASH_TRX';

  state.idempotencyKeys[idempKey] = targetOrder.orderNo;
  writeErpState(state);

  return {
    success: true,
    submission: {
      submissionId: submissionRecord.submissionId,
      orderNo: submissionRecord.orderNo,
      senderPhoneMasked: submissionRecord.senderPhoneMasked,
      senderPhoneMatchesOrderPhone: submissionRecord.senderPhoneMatchesOrderPhone,
      trxId: submissionRecord.trxId,
      submittedAmountPoisha: submissionRecord.submittedAmountPoisha,
      submittedAmountPaisaStr: String(submissionRecord.submittedAmountPoisha),
      expectedPayablePoisha: submissionRecord.expectedPayablePoisha,
      verificationStatus: submissionRecord.status,
      submittedAt: submissionRecord.submittedAt,
    },
  };
}

/**
 * Reviews, approves, rejects, or reverses a Manual bKash submission (Rule 4.7):
 * - Enforces Maker-Checker separation (submitter cannot self-approve)
 * - Only credits `advancePaidPoisha` and reduces `codCollectablePoisha` when `decision === 'approved'`
 * - Reverses credit if `decision === 'reversed'`
 */
export function reviewManualBkashSubmission(
  checkerCtx: ActorSecurityContext,
  input: {
    orderNo: string;
    trxId?: string;
    decision: 'under_review' | 'approved' | 'rejected' | 'reversed';
    reviewNoteBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  submission?: ManualBkashSubmissionRecord;
} {
  if (checkerCtx.roleSlug === 'vendor' || checkerCtx.roleSlug === 'packaging_manager') {
    return {
      success: false,
      errorBn: 'ভেন্ডর বা প্যাকেজিং ম্যানেজার বিকাশ পেমেন্ট অনুমোদন বা প্রত্যাখ্যান করতে পারবেন না।',
    };
  }

  const state = readErpState();
  state.manualBkashSubmissions = state.manualBkashSubmissions ?? [];
  const orderNoUpper = input.orderNo.trim().toUpperCase();

  const targetOrder = state.orders.find(
    (o) => o.orderNo.toUpperCase() === orderNoUpper
  );
  if (!targetOrder) {
    return { success: false, errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।' };
  }

  const sub = state.manualBkashSubmissions.find(
    (s) =>
      s.orderNo.toUpperCase() === orderNoUpper &&
      (!input.trxId || s.trxId.toUpperCase() === input.trxId.trim().toUpperCase())
  );

  if (!sub) {
    return {
      success: false,
      errorBn: 'এই অর্ডারের কোনো বিকাশ পেমেন্ট সাবমিশন পাওয়া যায়নি।',
    };
  }

  // Maker-Checker guard: staff member who created/submitted the bKash entry cannot approve it themselves
  if (
    input.decision === 'approved' &&
    sub.submittedByRole !== 'customer'
  ) {
    const mc = checkMakerCheckerSeparation({
      makerUsername: sub.submittedByUsername,
      checkerCtx,
    });
    if (!mc.allowed) {
      return {
        success: false,
        errorBn: mc.errorBn,
      };
    }
  }

  const prevStatus = sub.status;
  const nowIso = new Date().toISOString();
  if (prevStatus === 'approved' && input.decision !== 'approved') {
    return { success: false, errorBn: 'অনুমোদিত পেমেন্ট সংশোধনে অনুমোদিত লেজার রিভার্সাল প্রক্রিয়া ব্যবহার করুন।' };
  }

  if (input.decision === 'approved' && prevStatus !== 'approved' &&
      (!['pending_verification', 'under_review'].includes(prevStatus) ||
       !Number.isSafeInteger(sub.submittedAmountPoisha) || sub.submittedAmountPoisha <= 0 ||
       sub.submittedAmountPoisha > targetOrder.totalPayablePoisha - targetOrder.advancePaidPoisha ||
       !input.reviewNoteBn?.trim())) {
    return { success: false, errorBn: 'যাচাইয়ের প্রমাণ, সঠিক পরিমাণ ও বৈধ পেমেন্ট অবস্থা প্রয়োজন।' };
  }
  if (input.decision === 'approved' && prevStatus !== 'approved') {
    const newAdvance = Math.min(
      targetOrder.totalPayablePoisha,
      targetOrder.advancePaidPoisha + sub.submittedAmountPoisha
    );
    targetOrder.advancePaidPoisha = newAdvance;
    targetOrder.codCollectablePoisha = Math.max(
      0,
      targetOrder.totalPayablePoisha - newAdvance
    );
    targetOrder.paymentStatus =
      targetOrder.codCollectablePoisha === 0
        ? 'paid_verified'
        : 'partial_verified';
  } else if (input.decision === 'reversed' && prevStatus === 'approved') {
    const newAdvance = Math.max(
      0,
      targetOrder.advancePaidPoisha - sub.submittedAmountPoisha
    );
    targetOrder.advancePaidPoisha = newAdvance;
    targetOrder.codCollectablePoisha = Math.max(
      0,
      targetOrder.totalPayablePoisha - newAdvance
    );
    targetOrder.paymentStatus = newAdvance > 0 ? 'partial_verified' : 'unpaid';
  } else if (input.decision === 'rejected') {
    if (prevStatus === 'approved') {
      const newAdvance = Math.max(
        0,
        targetOrder.advancePaidPoisha - sub.submittedAmountPoisha
      );
      targetOrder.advancePaidPoisha = newAdvance;
      targetOrder.codCollectablePoisha = Math.max(
        0,
        targetOrder.totalPayablePoisha - newAdvance
      );
    }
    targetOrder.paymentStatus =
      targetOrder.advancePaidPoisha > 0 ? 'partial_verified' : 'unpaid';
  }

  sub.status = input.decision;
  sub.reviewedByUsername = checkerCtx.username;
  sub.reviewNoteBn = input.reviewNoteBn?.trim() || null;
  sub.reviewedAt = nowIso;

  if (input.decision === 'approved' && prevStatus !== 'approved') {
    const posting = postVerifiedManualBkashPaymentJournal({ submissionId: sub.submissionId, orderNo: targetOrder.orderNo,
      trxId: sub.trxId, verifiedAmountPoisha: sub.submittedAmountPoisha,
      makerUsername: sub.submittedByUsername, checkerUsername: checkerCtx.username,
    });
    if (!posting.success) return { success: false, errorBn: posting.errorBn ?? 'পেমেন্টের জার্নাল পোস্ট করা যায়নি।' };
  }

  writeErpState(state);
  return {
    success: true,
    submission: sub,
  };
}

/**
 * Handles a customer-initiated order cancellation request (Section 9.4 & 21.1):
 * - Verifies normalized customer phone matches the order
 * - Blocks direct cancellation if order is already shipped/delivered (requires Return Workflow)
 * - Records cancellation request for admin review and stock release
 */
export function requestOrderCancellation(input: {
  orderNo: string;
  customerPhone: string;
  reasonBn: string;
}): {
  success: boolean;
  code?: 'ORDER_NOT_FOUND' | 'PHONE_MISMATCH' | 'ALREADY_DISPATCHED';
  errorBn?: string;
  order?: PublicOrderTrackingDTO;
} {
  const state = readErpState();
  const orderNoTrimmed = input.orderNo.trim().toUpperCase();
  const targetOrder = state.orders.find(
    (o) => o.orderNo.toUpperCase() === orderNoTrimmed
  );

  if (!targetOrder) {
    return {
      success: false,
      code: 'ORDER_NOT_FOUND',
      errorBn: 'প্রদত্ত অর্ডার নম্বরটি খুঁজে পাওয়া যায়নি।',
    };
  }

  const cleanOrderPhone = targetOrder.customerPhone.replace(/\D/g, '').slice(-11);
  const cleanInputPhone = input.customerPhone.replace(/\D/g, '').slice(-11);
  if (cleanOrderPhone !== cleanInputPhone) {
    return {
      success: false,
      code: 'PHONE_MISMATCH',
      errorBn: 'অর্ডারের মোবাইল নম্বরের সাথে প্রদত্ত নম্বরটি মেলেনি।',
    };
  }

  if (!['pending_confirmation', 'confirmed', 'cancelled'].includes(targetOrder.status)) {
    return {
      success: false,
      code: 'ALREADY_DISPATCHED',
      errorBn:
        'অর্ডারটি ইতোমধ্যে কুরিয়ারে ডিসপ্যাচ হয়েছে। এই পর্যায়ে সরাসরি ক্যানসেল না করে রিটার্ন ওয়ার্কফ্লো অনুসরণ করতে হবে।',
    };
  }

  // Release reserved stock if transitioning to cancelled
  if (targetOrder.status !== 'cancelled') {
    const orderLines = state.orderLines.filter(
      (l) => l.orderId === targetOrder.id
    );
    for (const line of orderLines) {
      for (const prod of state.products) {
        const variant = prod.variants.find(
          (v) => v.variantId === line.variantId
        );
        if (variant) {
          if (variant.stockReserved < line.quantity) return {
            success: false, code: 'ALREADY_DISPATCHED', errorBn: 'স্টক সংরক্ষণ মেলেনি। অর্ডার বাতিলের আগে ইনভেন্টরি সমন্বয় প্রয়োজন।',
          };
          variant.stockReserved -= line.quantity;
          variant.stockAvailable = variant.stockOnHand - variant.stockReserved;
        }
      }
    }
    targetOrder.status = 'cancelled';
  }

  writeErpState(state);
  const tracking = getPublicOrderTracking(targetOrder.orderNo);
  return {
    success: true,
    order: tracking ?? undefined,
  };
}

export function submitCustomerInquiry(input: {
  name: string;
  phone: string;
  subject?: string;
  message: string;
}): { success: boolean; inquiry?: CustomerInquiryRecord; errorBn?: string } {
  if (!input.name.trim() || !input.phone.trim() || !input.message.trim()) {
    return {
      success: false,
      errorBn: 'নাম, মোবাইল নম্বর এবং বার্তা প্রদান করা আবশ্যক।',
    };
  }

  const state = readErpState();
  if (!state.inquiries) state.inquiries = [];

  const newInquiry: CustomerInquiryRecord = {
    id: `inq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: input.name.trim(),
    phone: input.phone.trim(),
    subject: input.subject?.trim() || 'সাধারণ জিজ্ঞাসা',
    message: input.message.trim(),
    status: 'unread',
    createdAt: new Date().toISOString(),
  };

  state.inquiries.unshift(newInquiry);
  writeErpState(state);

  return {
    success: true,
    inquiry: newInquiry,
  };
}

export function getCustomerInquiries(): CustomerInquiryRecord[] {
  const state = readErpState();
  return state.inquiries ?? [];
}

export function updateCustomerInquiryStatus(
  id: string,
  status: 'unread' | 'replied' | 'resolved',
  adminNotes?: string
): { success: boolean; inquiry?: CustomerInquiryRecord; errorBn?: string } {
  const state = readErpState();
  if (!state.inquiries) state.inquiries = [];

  const target = state.inquiries.find((i) => i.id === id);
  if (!target) {
    return {
      success: false,
      errorBn: 'বার্তাটি খুঁজে পাওয়া যায়নি।',
    };
  }

  target.status = status;
  if (adminNotes !== undefined) {
    target.adminNotes = adminNotes;
  }

  writeErpState(state);
  return {
    success: true,
    inquiry: target,
  };
}

export function updateAboutContactPageSettings(
  input: Partial<AboutContactPageSettings>
): { success: boolean; siteSettings: SiteSettingsRecord } {
  const state = readErpState();
  const current = state.siteSettings.aboutContactPage ?? {
    titleBn: 'যোগাযোগ ও আমাদের পরিচিতি',
    titleEn: 'Contact & About Us',
    subtitleBn: 'বাংলাদেশের তৃণমূল কারিগর ও গ্রাহকদের মাঝে নির্ভরযোগ্য, কিউসি-যাচাইকৃত কনসাইনমেন্ট প্ল্যাটফর্ম।',
    subtitleEn: 'Reliable, QC-verified consignment platform bridging authentic artisans and valued customers.',
    storyTitleBn: 'পঞ্চগড় (PANCHAGARH) কীভাবে কাজ করে?',
    storyTitleEn: 'How PANCHAGARH Works',
    storyParagraph1Bn: 'পঞ্চগড় একটি আধুনিক মাল্টি-ভেন্ডর কনসাইনমেন্ট কমার্স প্ল্যাটফর্ম। আমরা বাংলাদেশের স্থানীয় তাঁতি, চাষী ও কারিগরদের সাথে সরাসরি কাজ করি। প্রতিটি পণ্য আমাদের নিজস্ব সেন্ট্রাল ওয়্যারহাউসে রিসিভ করে অভিজ্ঞ টিম দ্বারা গুণগত মান (QC) নিশ্চিত করার পর প্যাকেজিং ও ডেলিভারি করা হয়।',
    storyParagraph1En: 'PANCHAGARH is a transparent consignment commerce platform connecting verified regional artisans with consumers nationwide. Every consignment lot undergoes strict physical quality checks at our central warehouse prior to customer dispatch.',
    storyParagraph2Bn: 'আমাদের প্রধান লক্ষ্য হলো—ক্রেতা যেন ঘরে বসেই শতভাগ খাঁটি পণ্য পান, এবং প্রান্তিক উৎপাদক যেন তাদের পণ্যের সঠিক ন্যায্যমূল্য ও সঠিক সময়ে পেমেন্ট পান।',
    storyParagraph2En: 'Our mission is simple: ensure authentic provenance and fair trade for suppliers, while guaranteeing pristine product quality and peace of mind for every customer.',
    warehouseAddressBn: 'প্লট ১২, রোড ৪/এ, ধানমন্ডি আ/এ, ঢাকা-১২০৯',
    warehouseAddressEn: 'Plot 12, Road 4/A, Dhanmondi R/A, Dhaka-1209',
    helplineHoursBn: 'সকাল ৯টা – রাত ১০টা (প্রতিদিন)',
    helplineHoursEn: '9 AM – 10 PM Everyday',
  };

  state.siteSettings.aboutContactPage = {
    ...current,
    ...input,
  };

  writeErpState(state);
  return {
    success: true,
    siteSettings: state.siteSettings,
  };
}

