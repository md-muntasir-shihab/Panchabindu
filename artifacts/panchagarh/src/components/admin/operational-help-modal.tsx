'use client';

import React from 'react';
import { HelpCircle, X, CheckCircle2, ShieldAlert, Zap, Layers } from 'lucide-react';
import type { AdminTabKey } from './admin-erp-client';

interface OperationalHelpGuideItem {
  titleBn: string;
  titleEn: string;
  purposeBn: string;
  purposeEn: string;
  workflowBn: string[];
  workflowEn: string[];
  rulesBn: string[];
  rulesEn: string[];
}

export const OPERATIONAL_HELP_GUIDE: Record<AdminTabKey, OperationalHelpGuideItem> = {
  today_screen: {
    titleBn: 'আজকের অপারেশনাল কমান্ড সেন্টার (Today Command)',
    titleEn: 'Today Operational Command Center',
    purposeBn: 'দৈনিক অর্ডারের লাইভ ভেরিফিকেশন, অ্যাড্রেস ফিক্স, বিকাশ TrxID অটো-ম্যাচিং এবং ১-ক্লিক কুরিয়ার বুকিং প্রসেসিং।',
    purposeEn: 'Daily order live verification, address quality score checks, bKash manual TrxID verification, and 1-click courier booking.',
    workflowBn: [
      '১. ফোন কনফার্মেশন কিউ থেকে অর্ডারসমূহ ডায়াল করে নিশ্চিত করুন।',
      '২. ঠিকানা স্কোরে লাল থাকলে বাসা/রোড নম্বর গ্রাহকের সাথে কথা বলে আপডেট করুন।',
      '৩. ম্যানুয়াল বিকাশ টাকা জমা নিশ্চিত করে TrxID স্টেটমেন্ট ভেরিফাই করুন।',
      '৪. প্যাকিং ও পিকআপ চালানের জন্য প্রস্তুত অর্ডারে "বুক কুরিয়ার" ক্লিক করুন।',
    ],
    workflowEn: [
      '1. Process call verification queue by dialing pending customer orders.',
      '2. If address score shows warning, confirm street & house details with the customer.',
      '3. Match manual bKash TrxID entries against official transaction statement.',
      '4. Dispatch packed orders directly into Steadfast or Pathao courier pickup batch.',
    ],
    rulesBn: [
      '• প্রতিটি পেমেন্ট ট্রানজেকশন ডুপ্লিকেট চেকিং দিয়ে সুরক্ষিত।',
      '• অর্ডারের স্ট্যাটাস এবং পেমেন্ট স্ট্যাটাস ডাবল-এন্ট্রি নীতি অনুযায়ী পৃথক।',
    ],
    rulesEn: [
      '• Duplicate transaction check prevents double payment posting.',
      '• Order status and payment ledger status are independently audited.',
    ],
  },
  orders_grid: {
    titleBn: 'অর্ডার মাস্টার গ্রিড ও ভেরিফিকেশন (Orders Grid)',
    titleEn: 'Orders Master Grid & Verification',
    purposeBn: 'সকল অর্ডারের কেন্দ্রীয় মাস্টার ড্যাশবোর্ড, ফিল্টারিং, বাল্ক একশন এবং লাইভ কুরিয়ার ট্র্যাকিং।',
    purposeEn: 'Central master dashboard for filtering, bulk state transitions, customer history and real-time courier tracking.',
    workflowBn: [
      '১. স্ট্যাটাস ড্রপডাউন ও পরবর্তী অ্যাকশন চিপস ব্যবহার করে ফিল্টার করুন।',
      '২. বাল্ক চেকবক্স দিয়ে একাধিক অর্ডার নির্বাচন করে এক ক্লিকে বুকিং বা কনফার্মেশন প্রসেস করুন।',
      '৩. কুরিয়ার ট্র্যাকিং কোডে ক্লিক করে পাঠাও/স্টিডফাস্ট লাইভ পোর্টাল থেকে ট্র্যাকিং দেখুন।',
    ],
    workflowEn: [
      '1. Filter orders using Next Action chips (Pending Call, Fix Address, Verify bKash, Ready to Pack).',
      '2. Select multiple orders for bulk courier booking or confirmation.',
      '3. Click live tracking codes to inspect real-time courier movement.',
    ],
    rulesBn: [
      '• কাস্টমার ফোন নম্বরের ইতিহাস অটোমেটিক ফ্রেড স্কোর প্রকাশ করে।',
      '• ডুপ্লিকেট অর্ডার প্রতিরোধে ২৪ ঘণ্টার ফোন অটো-গার্ড সক্রিয় রয়েছে।',
    ],
    rulesEn: [
      '• Customer phone history calculates risk score automatically.',
      '• 24-hour phone duplicate guard protects against accidental re-orders.',
    ],
  },
  smart_order_entry: {
    titleBn: 'নতুন স্মার্ট অর্ডার এন্ট্রি (Smart Order Entry)',
    titleEn: 'Smart Order Entry (Phone & Social Sales)',
    purposeBn: 'ফেসবুক/ফোন কলের গ্রাহকের জন্য দ্রুত অর্ডার প্লেসমেন্ট, অটো লাইভ প্রফিট ক্যালকুলেটর ও জেলা ক্যাসকেড।',
    purposeEn: 'Fast order placement for phone and Facebook sales agents with instant net profit calculation and address dropdowns.',
    workflowBn: [
      '১. ফোন নম্বর দিয়ে সার্চ দিলে পূর্বের কাস্টমার হিস্ট্রি ও অ্যাড্রেস লোড হবে।',
      '২. জেলা এবং উপজেলা সিলেক্ট করলে কুরিয়ার চার্জ স্বয়ংক্রিয়ভাবে হিসাব হবে।',
      '৩. পণ্য ও ভ্যারিয়েন্ট যোগ করা মাত্র ৩-স্তরীয় প্রফিট ব্রেকডাউন লাইভ দেখা যাবে।',
    ],
    workflowEn: [
      '1. Typing customer phone auto-populates past address and order history.',
      '2. Selecting District and Upazila automatically sets delivery charges.',
      '3. Live 3-tier pricing breakdown shows supplier cost, platform margin, and net profit.',
    ],
    rulesBn: [
      '• কোনো অবস্থাতেই গ্রাহক সাপ্লায়ারের আসল কেনা দাম দেখতে পারবে না।',
      '• পাইসা ইন্টিজার হিস্ট্রি নীতি অনুযায়ী বিডিটি ভগ্নাংশ গণনা নিষিদ্ধ।',
    ],
    rulesEn: [
      '• Vendor cost and margin details are strictly hidden from storefront DTOs.',
      '• Financial calculation uses integer Poisha to prevent floating-point drift.',
    ],
  },
  product_studio: {
    titleBn: 'প্রোডাক্ট ও ক্যাটাগরি স্টুডিও (Product Studio & Catalog)',
    titleEn: 'Product Studio & Catalog Management',
    purposeBn: 'মাল্টি-ভ্যারিয়েন্ট ক্যাটালগ, ৩-স্তরীয় পয়সা প্রাইসিং, ক্যাটাগরি ম্যানেজার এবং ৮-মুখী ইকোসিস্টেম লিংকেজ।',
    purposeEn: 'Catalog creation, multi-variant SKUs, 3-tier Poisha pricing calculator, category manager and 8-way ecosystem linkage.',
    workflowBn: [
      '১. নতুন পণ্য যুক্ত করুন বাটনে ক্লিক করে সাপ্লায়ার কস্ট, ভেন্ডর প্রফিট ও রিটেইল সেল প্রাইস লিখুন।',
      '২. পাবলিক SKU (ইনভয়েসের জন্য) এবং ইন্টারনাল SKU (ওয়্যারহাউস প্যাকিং স্লিপের জন্য) সেট করুন।',
      '৩. ক্যাটাগরি ম্যানেজারে স্টোরফ্রন্ট ফিল্টারের সর্ট অর্ডার পরিবর্তন করুন।',
    ],
    workflowEn: [
      '1. Click "Add New Product" to define supplier cost, supplier profit, and retail sale price.',
      '2. Set Public SKU (for invoices) and Internal Vendor SKU (for warehouse packing slips).',
      '3. Manage category display order and active visibility for storefront navigation.',
    ],
    rulesBn: [
      '• সাপ্লায়ার খরচ + ভেন্ডর লাভ = ভেন্ডর প্রদেয় (Payable)।',
      '• ভেন্ডর প্রদেয় + প্ল্যাটফর্ম মার্জিন = খুচরা সেলস প্রাইজ।',
    ],
    rulesEn: [
      '• Supplier Cost + Supplier Profit = Supplier Payable.',
      '• Supplier Payable + Platform Margin = Retail Sale Price.',
    ],
  },
  vendor_escrow: {
    titleBn: 'ভেন্ডর ডাইরেক্টরি, এসক্রো লেজার ও পেআউট (Vendor Escrow & Payout Engine)',
    titleEn: 'Vendor Directory, Escrow Ledger & Payout Engine',
    purposeBn: 'ভেন্ডর প্রোফাইল অনবোর্ডিং, রিয়েল-টাইম এসক্রো ব্যালেন্স ট্যাকিং এবং পেআউট প্রসেসিং।',
    purposeEn: 'Vendor profiles onboarding, real-time Escrow balance tracking (Pending -> Locked -> Available), and payout approvals.',
    workflowBn: [
      '১. ভেন্ডরের ৩টি ব্যালেন্স বকেয়া দেখুন: পেন্ডিং, লকড (৭-দিন ম্যাচুরিটি) এবং উত্তোলনযোগ্য (Available)।',
      '২. পেআউট রিকোয়েস্টে এপ্রুভ বাটনে ক্লিক করে ব্যাংক বা বিকাশ মারফত পেমেন্ট সম্পন্ন করুন।',
      '৩. ১৫-প্রশ্নের কনসাইনমেন্ট অনবোর্ডিং কন্ট্রাক্ট সম্পূর্ণ নিশ্চিত করুন।',
    ],
    workflowEn: [
      '1. Monitor vendor balances: Pending (in transit), Locked (7-day maturity), and Available (withdrawable).',
      '2. Review and approve payout requests via bank transfer or bKash manual remittance.',
      '3. Verify 15-question consignment onboarding agreement before activating new vendors.',
    ],
    rulesBn: [
      '• মিনিমাম ৫০০ টাকা Available ব্যালেন্স থাকা সাপেক্ষে পেআউট রিকোয়েস্ট তৈরি করা যায়।',
      '• রিটার্ন ঘটিত দায় ভেন্ডর লেজার থেকে ডেবিট/ক্লব্যাক হিসেবে সমন্বয় হয়।',
    ],
    rulesEn: [
      '• Minimum ৳500 Available balance required for payout requests.',
      '• Return faults debit vendor ledger balances automatically.',
    ],
  },
  phase7_portal: {
    titleBn: 'সেলফ-সার্ভিস ভেন্ডর পোর্টাল, প্রোমো ক্যাম্পেইন ও এক্সিকিউটিভ একাউন্টিং',
    titleEn: 'Self-Service Vendor Portal, Promo Campaigns & Executive Accounting',
    purposeBn: 'কনসাইনমেন্ট স্টক চালান, কিউসি অনুমোদন, মূল্য পরিবর্তন প্রস্তাব, প্রোমো ক্যাম্পেইন ও ভ্যাট ডাবল-এন্ট্রি লেজার।',
    purposeEn: 'Consignment dispatch lots & QC queue, price change proposals, margin-safe flash sale guard, and VAT double-entry ledger.',
    workflowBn: [
      '১. ভেন্ডর গুদামে পণ্য পাঠালে চালান (Lot) কিউসি পেন্ডিং মোডে তৈরি হবে। কিউসি এপ্রুভ করলে স্টক অন-হ্যান্ড বৃদ্ধি পাবে।',
      '২. ভেন্ডর প্রাইস চেঞ্জ প্রপোজাল জমা দিলে অ্যাডমিন ৩-স্তরের হিসাব মেলাবে।',
      '৩. ফ্ল্যাশ সেল যোগ করার সময় প্ল্যাটফর্ম মার্জিন গার্ড নিশ্চিত করবে যেন সাপ্লায়ার খরচ অক্ষুণ্ণ থাকে।',
    ],
    workflowEn: [
      '1. Vendor submits consignment dispatch lots. Warehouse QC approval automatically increases active stock.',
      '2. Vendor submits price change proposal for admin review and 3-tier split verification.',
      '3. Flash sale campaign rules protect supplier payable from promotional discounts.',
    ],
    rulesBn: [
      '• Golden Rule Guard: প্রমোশনাল ডিসকাউন্ট শুধুমাত্র প্ল্যাটফর্ম মার্জিন থেকে কাটা যাবে।',
      '• মেকার-চেকার নীতি ছাড়া লেজার রিভার্সাল অনুমোদন করা যাবে না।',
    ],
    rulesEn: [
      '• Golden Rule Guard: Promo discounts deduct strictly from platform margin.',
      '• Maker-checker rule enforces dual-user approval for ledger reversals.',
    ],
  },
  courier_360: {
    titleBn: 'কুরিয়ার ৩৬০, ম্যানিফেস্ট ও ৬৪ জেলার রেট (Courier 360 & Logistics Hub)',
    titleEn: 'Courier 360, Manifests & 64-District Delivery Rates',
    purposeBn: 'পাঠাও/স্টিডফাস্ট কুরিয়ারের পাওনা সিওডি ট্র্যাকিং, রেমিট্যান্স এন্ট্রি ও প্রুফ ভল্ট এবং ৬৪ জেলার চার্জ ম্যানেজমেন্ট।',
    purposeEn: 'Tracking courier COD receivables, logging bank remittance proofs, managing claims and 64-district delivery overrides.',
    workflowBn: [
      '১. ইন-ট্রানজিট ও ডেলিভারড অন-সেটেলড ব্যালেন্স কুরিয়ার অনুযায়ী ফিল্টার করে পর্যবেক্ষণ করুন।',
      '২. কুরিয়ার থেকে ব্যাংক ট্রান্সফার পাওয়ার পর রেমিট্যান্স প্রুফ এন্ট্রি ও ফাইল স্ক্যান আপলোড করুন।',
      '৩. পিকআপ চালান (Manifest) প্রিন্ট করে কুরিয়ার রাইডারের স্বাক্ষর সহ রিসিভ কপি সংরক্ষণ করুন।',
    ],
    workflowEn: [
      '1. Monitor in-transit and delivered unsettled COD balances across Pathao, Steadfast and RedX.',
      '2. Log incoming courier bank remittance statements with transaction receipt proofs.',
      '3. Generate printable pickup handover manifests with barcodes for courier rider verification.',
    ],
    rulesBn: [
      '• শর্ট-পেমেন্ট বা ঘাটতি থাকলে কুরিয়ার ক্লেম ফ্ল্যাগ চালু হবে।',
      '• রেমিট্যান্স জমা হওয়া মাত্র কাস্টমার অর্ডার স্ট্যাটাস "Remitted" এ উন্নীত হবে।',
    ],
    rulesEn: [
      '• Short-payments automatically trigger courier dispute claims.',
      '• Logged remittance promotes order payment status to "remitted".',
    ],
  },
  finance_product360: {
    titleBn: 'ফাইন্যান্স, মানি-ম্যাপ, প্রোমো ও প্রোডাক্ট ৩৬০ (Finance & Product 360)',
    titleEn: 'Finance, Money Map, Promo & Product 360 Performance',
    purposeBn: 'প্ল্যাটফর্মের লাভ-ক্ষতি (P&L) মানি ম্যাপ, ফেসবুক অ্যাড স্পেন্ড ROAS, প্রফিট-এট-এন্ট্রি ও পণ্য ৩৬০ স্কোর।',
    purposeEn: 'Financial P&L money map, ad spend ROAS calculation, itemized operating expense ledger and product 360 analytics.',
    workflowBn: [
      '১. গ্রস সেলস, কুরিয়ার চার্জ, ভেন্ডর প্রদেয় ও অপারেটিং খরচের মানি ম্যাপ দেখুন।',
      '২. ফেসবুক ও গুগল অ্যাড স্পেন্ড এন্ট্রি দিয়ে দৈনিক ROAS এবং CPO মেজার করুন।',
      '৩. প্রোমো কোড ফিল্ডে নতুন ডিসকাউন্ট কুপন তৈরি করুন (যা প্ল্যাটফর্ম মার্জিন সেফ)।',
    ],
    workflowEn: [
      '1. Review Gross Revenue, Courier Fees, Supplier Payable and Net Operating Profit breakdown.',
      '2. Log marketing ad spend to evaluate ROAS and Cost Per Order (CPO).',
      '3. Create custom promo coupon codes backed by platform margin guard.',
    ],
    rulesBn: [
      '• নিট প্রফিট = প্ল্যাটফর্ম মার্জিন - প্রোমো ছাড় - কুরিয়ার ঘাটতি - অ্যাড স্পেন্ড - ভ্যাট ৫%।',
      '• কেবল সুপার অ্যাডমিন ও একাউন্টস ম্যানেজারের ফাইন্যান্সিয়াল ডেটা অ্যাক্সেস থাকবে।',
    ],
    rulesEn: [
      '• Net Profit = Platform Margin - Promo Subsidies - Courier Losses - Ad Spend - 5% VAT.',
      '• Financial metrics are restricted to Super Admin and Finance Manager roles.',
    ],
  },
  phase6_ops: {
    titleBn: 'লাইভ অপারেশনস, কার্ট রিকভারি সিআরএম, কুরিয়ার ওয়েবহুক ও ব্যাকআপ',
    titleEn: 'Live Operations, Cart Recovery CRM, Courier Webhooks & System Backup',
    purposeBn: 'পরিত্যক্ত কার্ট রিকভারি (WhatsApp/Call), লাইভ কুরিয়ার ওয়েবহুক রিসিভার এবং ব্যাকআপ স্ন্যাপশট।',
    purposeEn: 'Abandoned cart recovery suite via WhatsApp/call, live courier webhooks receiver, customer CRM and disaster recovery.',
    workflowBn: [
      '১. চেকআউটে অসম্পন্ন অর্ডারসমূহ নির্বাচন করে WhatsApp এ রিকভারি লিঙ্ক পাঠান।',
      '২. কুরিয়ার ওয়েবহুক ফিডে পাঠাও/স্টিডফাস্ট রিয়েল-টাইম ডেলিভারি আপডেট পর্যবেক্ষণ করুন।',
      '৩. ভেরিফায়েড প্রোডাক্ট রিভিউ অনুমোদন করুন যা স্টোরফ্রন্টে ব্যাজ হিসেবে দেখাবে।',
    ],
    workflowEn: [
      '1. Review abandoned cart sessions and trigger 1-click WhatsApp recovery messages.',
      '2. Monitor incoming webhook signatures for real-time courier status updates.',
      '3. Moderate verified customer product reviews and ratings.',
    ],
    rulesBn: [
      '• ওয়েবহুক সিকিউরিটি HMAC-SHA256 হ্যাশ চেক ছাড়া ডাটা প্রসেস করবে না।',
      '• সিস্টেমের সম্পূর্ণ স্ন্যাপশট SHA-256 চেকসাম সহ ব্যাকআপ হিসেবে ডাউনলোডযোগ্য।',
    ],
    rulesEn: [
      '• Webhook signatures are verified using HMAC-SHA256.',
      '• Full system JSON backup incorporates SHA-256 integrity checksums.',
    ],
  },
  messaging_automation: {
    titleBn: 'মেসেজিং টেমপ্লেট, ট্রিপল-গার্ড অটোমেশন ও শিট সিঙ্ক (Messaging & Sync)',
    titleEn: 'Messaging Templates, Automation Rules & Google Sheets Sync',
    purposeBn: 'গ্রাহক এসএমএস/ওয়াটসঅ্যাপ মেসেজ টেমপ্লেট, সিকিউরিটি ট্রিপল-গার্ড অটোমেশন ও ১-মুখী গুগল শিট মিরর।',
    purposeEn: 'Dynamic customer SMS/WhatsApp message templates, automation rules matrix, customer blacklist and 1-way Google Sheets mirror.',
    workflowBn: [
      '১. অর্ডার কনফার্মেশন ও ট্র্যাকিং লিঙ্কের দ্বিভাষিক মেসেজ টেমপ্লেট তৈরি ও এডিট করুন।',
      '২. অটোমেশন রুলে Dry-Run সিমুলেশন চালিয়ে নিশ্চিত হোন বা Global Kill-Switch অন করুন।',
      '৩. গুগল শিট ১-মুখী সিঙ্ক বাটনে ক্লিক করে ডেটাবেসের কপি স্কিপ্ট মারফত শিটে পাঠাল।',
    ],
    workflowEn: [
      '1. Edit dynamic variables in customer SMS/WhatsApp templates (Tracking URL, COD amount, items).',
      '2. Test automation rules in Dry-Run mode or toggle Global Kill-Switch in emergencies.',
      '3. Trigger Incremental or Full Resync to mirror ERP tables to Google Sheets via Code.gs.',
    ],
    rulesBn: [
      '• গুগল শিট ইন্টিগ্রেশন শুধুমাত্র One-Way Mirror (শিটে এডিট করলে মূল ডাটাবেস পরিবর্তন হবে না)।',
      '• ব্ল্যাকলিস্টেড গ্রাহকদের অর্ডার অটো-ফ্ল্যাগ করা হয়।',
    ],
    rulesEn: [
      '• Google Sheets sync is strictly One-Way Mirror (edits in Sheets never overwrite ERP).',
      '• Blacklisted phone numbers auto-flag risk on incoming orders.',
    ],
  },
  print_engine: {
    titleBn: 'প্রিন্ট ইঞ্জিন ও ইনভয়েস স্টুডিও (Print Engine & Invoice Studio)',
    titleEn: 'Print Engine & Invoice Studio (3-Part A4 & 4x6 Thermal)',
    purposeBn: 'থ্রি-পার্ট A4 অপস প্রিন্ট স্লিপ (গ্রাহক, ওয়্যারহাউস, এসক্রো অডিট) এবং ৪x৬ কুরিয়ার থার্মাল স্টিকার।',
    purposeEn: 'Three-part operational A4 print slips (Customer Copy, Warehouse Packing Slip, Accounts Audit Copy) and 4x6 thermal barcode labels.',
    workflowBn: [
      '১. অর্ডার সেকশন বা প্রিন্ট ইঞ্জিনে প্রিন্ট করার জন্য অর্ডার সিলেক্ট করুন।',
      '২. A4 ৩-পার্ট স্লিপ নির্বাচন করলে গ্রাহক কপি, প্যাকেজিং স্লিপ এবং এসক্রো কপি পৃথক কালারে প্রিন্ট হবে।',
      '৩. ৪x৬ থার্মাল স্টিকার মোডে কুরিয়ার বারকোড স্টিকার প্রিন্ট করুন।',
    ],
    workflowEn: [
      '1. Select orders for single or bulk operational printing.',
      '2. Choose A4 3-Part mode to render Customer Invoice, Warehouse Packing Slip, and Accounts Copy.',
      '3. Choose 4x6 Thermal mode for adhesive courier shipping labels with Code128 barcodes.',
    ],
    rulesBn: [
      '• গ্রাহক কপিতে ইন্টারনাল ভেন্ডর SKU এবং সাপ্লায়ার কেনা দাম সম্পূর্ণ গোপন থাকবে।',
      '• প্যাকিং স্লিপে ইন্টারনাল SKU সহ প্যাকেজিং কিউসি আইটেম লিস্ট দেখানো হবে।',
    ],
    rulesEn: [
      '• Customer copy strictly redacts internal vendor SKUs and supplier cost fields.',
      '• Packing slips display internal vendor SKUs to warehouse pickers.',
    ],
  },
  phase5_readiness: {
    titleBn: 'প্রি-লঞ্চ অডিট ও সিকিউরিটি রিপোর্টস (Pre-Launch Audit & Security)',
    titleEn: 'Pre-Launch Audit, Security & Go-Live Readiness Center',
    purposeBn: 'প্রোডাকশন লাইভ হওয়ার আগে ১২-দফা সিকিউরিটি ও ফাইনান্সিয়াল অডিট চেক, রোল টেস্ট ও লাইফসাইকেল ড্রাই-রান।',
    purposeEn: 'Automated 12-point security and financial audit gate, role inspection matrix, and 9-stage lifecycle dry-run test.',
    workflowBn: [
      '১. অডিট ড্যাশবোর্ডে ১২টি চেকের স্টেটাস দেখুন (RLS, Integer Poisha, RBAC, Dup Guard)।',
      '২. রোল পারমিশন স্যানিটাইজারে ৫টি রোলের ডাটা গোপন রাখার পরীক্ষা চালান।',
      '৩. ৯-ধাপের ফুল অর্ডার ড্রাই-রান টেস্টে সিমুলেট করে নিশ্চিত হোন।',
    ],
    workflowEn: [
      '1. Inspect 12 automated checks (RLS policies, integer Poisha math, RBAC, duplicate guards).',
      '2. Execute role isolation tests across Super Admin, Marketing, Operations, Finance, and Vendor.',
      '3. Run full 9-stage order lifecycle dry-run to verify money & inventory integrity.',
    ],
    rulesBn: [
      '• ১২/১২ পয়েন্ট পাস না করা পর্যন্ত অ্যাপ প্রোডাকশন মোডে নেওয়া নিষেধ।',
      '• ভেন্ডর এবং মার্কেটিং রোল কখনো প্রাইভেট অ্যাকাউন্টিং রিপোর্ট দেখতে পারবে না।',
    ],
    rulesEn: [
      '• 100% (12/12) audit score required before production deployment.',
      '• Vendor and Marketing roles are restricted from accessing financial accounting ledgers.',
    ],
  },
  users_and_rbac: {
    titleBn: 'ইউজার ও RBAC সিকিউরিটি ম্যাট্রিক্স (Users & Access Control)',
    titleEn: 'Users & Access Control (RBAC)',
    purposeBn: 'অ্যাডমিন ইউজার একাউন্ট তৈরি, টেম্পোরারি পাসওয়ার্ড, রোল পারমিশন এডিটর এবং অডিট ট্রেইল।',
    purposeEn: 'Admin user creation, temporary password generation, RBAC policy editor, and append-only audit trail.',
    workflowBn: [
      '১. নতুন স্টাফ বা ভেন্ডরের জন্য ইউজার আইডি ও টেম্পোরারি পাসওয়ার্ড তৈরি করুন।',
      '২. রোল ড্রপডাউন থেকে Super Admin, Marketing, Operations, Finance বা Vendor বেছে নিন।',
      '৩. অডিট লগে যেকোনো ইউজার ক্রিয়েশন বা পারমিশন পরিবর্তনের স্থায়ী রেকর্ড ট্র্যাকিং নিশ্চিত করুন।',
    ],
    workflowEn: [
      '1. Create staff or vendor user accounts with temporary login passwords.',
      '2. Assign roles: Super Admin, Marketing Manager, Operations Manager, Finance Manager, or Vendor.',
      '3. Monitor system audit logs for append-only records of permission changes.',
    ],
    rulesBn: [
      '• শুধুমাত্র সুপার অ্যাডমিন ইউজার তৈরি ও পাসওয়ার্ড রিসেট করতে পারবেন।',
      '• অডিট লগ পরিবর্তন বা ডিলিট করা ডাটাবেস লেভেলে সম্পূর্ণ ব্লকড।',
    ],
    rulesEn: [
      '• Only Super Admin can provision users or issue password resets.',
      '• Audit log records are immutable and append-only at the database level.',
    ],
  },
  control_center: {
    titleBn: 'কন্ট্রোল সেন্টার ও সিকিউরিটি (Control Center & Security)',
    titleEn: 'Super Admin Control Center, Credentials Vault & Scheduled Jobs',
    purposeBn: 'ডায়নামিক স্টোর ব্র্যান্ডিং, মেইনটেন্যান্স মোড টগল, এনক্রিপ্টেড ক্রেডেনশিয়াল ভল্ট এবং ক্রন জবস।',
    purposeEn: 'Dynamic store branding, maintenance mode control, encrypted API credentials vault, and background scheduled cron jobs.',
    workflowBn: [
      '১. ব্র্যান্ডের নাম, হেল্পলাইন ফোন নম্বর এবং ফ্রি ডেলিভারি সীমা পরিবর্তন করুন।',
      '২. সাইট আপগ্রেডের সময় মেইনটেন্যান্স মোড সুইচে ক্লিক করে অ্যাপ সুরক্ষিত করুন।',
      '৩. কুরিয়ার এপিআই কি ও সিক্রেট টোকেন মাস্কড ভল্টে এনক্রিপ্ট করে সংরক্ষণ করুন।',
    ],
    workflowEn: [
      '1. Update brand name, support phone line, and free delivery thresholds.',
      '2. Toggle maintenance mode during core system updates or database migrations.',
      '3. Save encrypted API keys (Steadfast, Pathao, bKash) into masked credentials vault.',
    ],
    rulesBn: [
      '• এপিআই সিক্রেট কখনো ব্রাউজার বান্ডেল বা ক্লায়েন্ট রেসপন্সে প্রকাশ করা যাবে না।',
      '• সিস্টেমের সম্পূর্ণ ডেটাবেস JSON ব্যাকআপ হিসেবে এনক্রিপ্ট ডাউনলোডযোগ্য।',
    ],
    rulesEn: [
      '• API secrets are encrypted server-side and never exposed to browser bundles.',
      '• Full JSON backup incorporates SHA-256 integrity checksum verification.',
    ],
  },
};

interface OperationalHelpModalProps {
  tabKey: AdminTabKey | null;
  locale: 'bn' | 'en';
  onClose: () => void;
}

export function OperationalHelpModal({
  tabKey,
  locale,
  onClose,
}: OperationalHelpModalProps) {
  if (!tabKey) return null;
  const guide = OPERATIONAL_HELP_GUIDE[tabKey];
  if (!guide) return null;

  const isBn = locale === 'bn';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 bg-bg border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-mono font-bold text-sm">
              !
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink">
                {isBn ? guide.titleBn : guide.titleEn}
              </h2>
              <p className="text-[11px] font-mono text-muted uppercase tracking-wider">
                {isBn ? 'কার্যপ্রণালী ও ম্যানুয়াল গাইড' : 'Operational Function & Workflow Guide'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md border border-border bg-surface text-ink hover:bg-bg transition-colors"
            title={isBn ? 'বন্ধ করুন' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
          {/* Purpose */}
          <div className="p-3 bg-bg border border-border rounded-md space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-ink text-xs">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span>{isBn ? 'মূল উদ্দেশ্য ও পরিচিতি:' : 'Core Purpose & Overview:'}</span>
            </div>
            <p className="text-muted leading-relaxed">
              {isBn ? guide.purposeBn : guide.purposeEn}
            </p>
          </div>

          {/* Workflow */}
          <div className="space-y-2">
            <h3 className="font-bold text-ink text-xs flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-info" />
              <span>{isBn ? 'ধাপ-ভিত্তিক কার্যপ্রণালী (Step-by-Step Workflow):' : 'Step-by-Step Workflow:'}</span>
            </h3>
            <ul className="space-y-1.5 pl-1 text-ink">
              {(isBn ? guide.workflowBn : guide.workflowEn).map((step, idx) => (
                <li key={idx} className="flex items-start gap-2 bg-surface p-2 border border-border rounded-md">
                  <span className="font-mono text-accent font-bold shrink-0">{idx + 1}.</span>
                  <span className="leading-snug">{step.replace(/^\d+\.\s*/, '')}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Rules & Guards */}
          <div className="space-y-2">
            <h3 className="font-bold text-ink text-xs flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-success" />
              <span>{isBn ? 'সিকিউরিটি ও ফাইন্যান্সিয়াল নিয়মাবলী:' : 'Security & Financial Safeguards:'}</span>
            </h3>
            <div className="p-3 bg-surface border border-border rounded-md space-y-1 text-muted">
              {(isBn ? guide.rulesBn : guide.rulesEn).map((rule, idx) => (
                <p key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  <span>{rule.replace(/^•\s*/, '')}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-bg border-t border-border flex items-center justify-between text-xs">
          <span className="text-[11px] font-mono text-muted">
            {isBn ? 'পঞ্চগড় (Panchagarh) F-Commerce ERP' : 'Panchagarh Consignment F-Commerce ERP'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-ink text-bg font-bold text-xs rounded-md border border-ink hover:opacity-90 transition-opacity"
          >
            {isBn ? 'ঠিক আছে (Close)' : 'Got it (Close)'}
          </button>
        </div>
      </div>
    </div>
  );
}
