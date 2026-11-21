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
  dashboard: {
    titleBn: 'কমান্ড ড্যাশবোর্ড (Command Dashboard)',
    titleEn: 'Command Dashboard',
    purposeBn: 'আজকের বিক্রি, অর্ডারের অবস্থা, করণীয় কাজ, স্টক ও সাম্প্রতিক অর্ডার এক পর্দায় দেখে সিদ্ধান্ত নিন। প্রতিটি সংখ্যা আপনার রোল-অনুযায়ী ফিল্টার করা ডেটা থেকে আসে।',
    purposeEn: 'See today’s revenue, order status mix, open work, stock pressure and recent orders on one screen. Every number comes from the role-filtered workspace data you are allowed to see.',
    workflowBn: [
      '১. উপরের কার্ডে ক্লিক করে সংশ্লিষ্ট অর্ডার তালিকা বা পেজে যান (আজকের বিক্রি, লো-স্টক, সিওডি ইত্যাদি)।',
      '২. “আজকের করণীয়” টালি থেকে কল কনফার্মেশন, ঠিকানা সংশোধন, বিকাশ যাচাই বা কুরিয়ার বুকিংয়ের কিউ খুলুন।',
      '৩. সাম্প্রতিক অর্ডার টেবিলে কলাম হেডারে ক্লিক করে সাজান; সার্চ বক্সে অর্ডার নম্বর, নাম বা জেলা লিখে খুঁজুন।',
      '৪. “লাইভ” চালু থাকলে প্রতি মিনিটে ডেটা নিজে নিজে রিফ্রেশ হয়; ম্যানুয়াল রিফ্রেশেও সর্বশেষ স্ন্যাপশট আসে।',
    ],
    workflowEn: [
      '1. Use the summary cards to jump to the matching order list or page (today’s revenue, low stock, COD, and so on).',
      '2. Open the call confirmation, address fix, bKash verification or courier booking queue from the work-queue tiles.',
      '3. Sort the recent-orders table from its column headers and search by order number, customer name or district.',
      '4. With “Live” on, the snapshot refreshes every minute; the refresh button pulls the latest one immediately.',
    ],
    rulesBn: [
      '• ড্যাশবোর্ড কোনো নতুন ডেটা তৈরি করে না; শুধু বিদ্যমান ওয়ার্কস্পেস স্ন্যাপশট ও অডিট লগ দেখায়।',
      '• বাতিল ও ফেরত আসা অর্ডার বিক্রির হিসাবে ধরা হয় না; সিওডি ও পেআউট সংখ্যা হিসাব মিলিয়ে দেখার আগে প্রাপ্ত টাকা নয়।',
      '• কুরিয়ার বুকিং ও লাইভ ট্র্যাকিং এখনো সংযুক্ত নয়, তাই এখানে কোনো ডেলিভারি প্রতিশ্রুতি দেখানো হয় না।',
    ],
    rulesEn: [
      '• The dashboard creates no data; it only presents the existing workspace snapshot and audit log.',
      '• Cancelled and returned orders are excluded from revenue; COD and payout figures are not received funds until reconciled.',
      '• Courier booking and live tracking are not connected, so no delivery promise is shown here.',
    ],
  },
  crm_contacts: {
    titleBn: 'সিআরএম ও কন্টাক্টস (CRM & Contacts)',
    titleEn: 'CRM & Contacts Directory',
    purposeBn: 'গ্রাহক ডিরেক্টরি, অর্ডার ইতিহাস, ঝুঁকি বিশ্লেষণ, পরিত্যক্ত কার্ট রিকভারি এবং ব্ল্যাকলিস্ট এক জায়গায় পরিচালনা করুন।',
    purposeEn: 'Manage the unified customer directory, order history, risk score, abandoned cart recovery, and fraud blacklist in one place.',
    workflowBn: [
      '১. কন্টাক্ট ডিরেক্টরি থেকে নাম, ফোন বা অর্ডার দিয়ে গ্রাহকের ৩৬০ প্রোফাইল দেখুন।',
      '২. পরিত্যক্ত কার্ট ট্যাব থেকে WhatsApp বা SMS রিমাইন্ডার পাঠান অথবা এক ক্লিকে অর্ডারে কনভার্ট করুন।',
      '৩. ভুয়া অর্ডার বা ফ্রড নম্বর ব্ল্যাকলিস্ট ট্যাবে যুক্ত বা অপসারণ করুন।',
    ],
    workflowEn: [
      '1. Inspect any customer 360 profile by name, phone, or order number in the Contacts Directory.',
      '2. Follow up on abandoned carts via WhatsApp/SMS or convert directly to an order.',
      '3. Add or remove fraudulent phone numbers from the Blacklist tab.',
    ],
    rulesBn: [
      '• ব্ল্যাকলিস্টেড নম্বর চেকআউট ও স্মার্ট অর্ডার এন্ট্রিতে স্বয়ংক্রিয়ভাবে সতর্কতা দেখায়।',
      '• ব্ল্যাকলিস্ট পরিবর্তন শুধুমাত্র সুপার অ্যাডমিনের জন্য সংরক্ষিত।',
    ],
    rulesEn: [
      '• Blacklisted numbers automatically flag risk during checkout and smart order entry.',
      '• Blacklist mutations are restricted to Super Admin accounts.',
    ],
  },
  today_screen: {
    titleBn: 'আজকের অপারেশনাল কমান্ড সেন্টার (Today Command)',
    titleEn: 'Today Operational Command Center',
    purposeBn: 'দৈনিক অর্ডারের লাইভ ভেরিফিকেশন, অ্যাড্রেস ফিক্স, বিকাশ TrxID যাচাই এবং ম্যানুয়াল কুরিয়ার ট্র্যাকিং ও হ্যান্ডওভার প্রসেসিং।',
    purposeEn: 'Daily order live verification, address quality score checks, bKash manual TrxID verification, and manual courier tracking & handover.',
    workflowBn: [
      '১. ফোন কনফার্মেশন কিউ থেকে অর্ডারসমূহ ডায়াল করে নিশ্চিত করুন।',
      '২. ঠিকানা স্কোরে লাল থাকলে বাসা/রোড নম্বর গ্রাহকের সাথে কথা বলে আপডেট করুন।',
      '৩. ম্যানুয়াল বিকাশ টাকা জমা নিশ্চিত করে TrxID স্টেটমেন্ট ভেরিফাই করুন।',
      '৪. প্যাকড অর্ডারে কুরিয়ার ট্র্যাকিং কোড যুক্ত করে ম্যানুয়াল হ্যান্ডওভার সম্পন্ন করুন।',
    ],
    workflowEn: [
      '1. Process call verification queue by dialing pending customer orders.',
      '2. If address score shows warning, confirm street & house details with the customer.',
      '3. Match manual bKash TrxID entries against official transaction statement.',
      '4. Attach manual courier tracking codes to packed orders for pickup handover.',
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
    purposeBn: 'মাল্টি-ভ্যারিয়েন্ট ক্যাটালগ, ৩-স্তরীয় পয়সা প্রাইসিং, ক্যাটাগরি ম্যানেজার এবং পণ্যের সংরক্ষিত সংযোগ তথ্য।',
    purposeEn: 'Catalog creation, multi-variant SKUs, 3-tier Poisha pricing, category manager and stored product linkage details.',
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
  vendors_hub: {
    titleBn: 'ভেন্ডর ডাইরেক্টরি, ৩৬০° প্রোফাইল ও অনুমোদন',
    titleEn: 'Vendors Directory, 360° Profiles & Approvals',
    purposeBn: 'সব ভেন্ডরের তালিকা, কমিশন ও এসক্রো শর্তাবলি, পোর্টাল অনুমতি, প্রোডাক্ট ও স্টক চালান ইতিহাস, যুক্ত অর্ডার-পেআউট এবং অনুমোদন কিউ এক জায়গায়।',
    purposeEn: 'Unified workspace for vendor directory, commission & escrow terms, portal permissions, supplied products & stock intake history, linked orders/payouts, and the approval queue.',
    workflowBn: [
      '১. যেকোনো ভেন্ডরের নাম ক্লিক করলে তার ৩৬০° প্রোফাইল ড্রয়ার খুলবে — প্রোফাইল ও শর্ত, পোর্টাল অনুমতি, প্রোডাক্ট ও স্টক ইতিহাস, অর্ডার ও পেআউট এবং KYC/চুক্তি।',
      '২. অনুমোদন ও স্টক ট্যাব থেকে পেন্ডিং কনসাইনমেন্ট চালান QC, মূল্য পরিবর্তন প্রস্তাব, প্রোফাইল পরিবর্তন ও KYC ডকুমেন্ট অনুমোদন করুন।',
      '৩. প্রোফাইল থেকে এক ক্লিকে সরাসরি পেআউট, ফুল লেজার, ভেন্ডর ইনবক্স বা অর্ডার ডিটেইলসে চলে যান।',
    ],
    workflowEn: [
      '1. Click any vendor to open their 360° profile drawer covering terms, portal permissions, products & stock intake history, orders & payouts, and KYC/contract.',
      '2. Review pending consignment stock lots, price change proposals, profile requests, and KYC documents in the Approvals & Stock tab.',
      '3. Jump directly from any vendor profile to Payouts, Escrow Ledger, Vendor Inbox, Product Studio, or linked Order Details.',
    ],
    rulesBn: [
      '• পোর্টাল অনুমতি শুধু UI নয়, সার্ভার-সাইডেও যাচাই হয়।',
      '• ভেন্ডর স্ট্যাটাস স্থগিত করলে ভেন্ডর পোর্টাল থেকে সব পরিবর্তন তাৎক্ষণিক বন্ধ হয়ে যায়।',
    ],
    rulesEn: [
      '• Portal permissions are enforced server-side on every vendor API route.',
      '• Suspending a vendor immediately blocks all mutations from the vendor portal.',
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
    titleBn: 'ফাইন্যান্স, একাউন্টিং, ভ্যাট ও প্রোডাক্ট ৩৬০',
    titleEn: 'Finance, Accounting, VAT & Product 360',
    purposeBn: 'মানি ম্যাপ, লাভ-ক্ষতি (P&L), ৫% ভ্যাট লেজার, গ্রাহক রিফান্ড, অ্যাড স্পেন্ড ROAS, প্রোমো কোড এবং প্রোডাক্ট ৩৬০ ইনভেন্টরি।',
    purposeEn: 'Money map, net P&L, 5% VAT accounting ledger, customer refunds, ad spend ROAS, margin-safe promo codes, and Product 360 inventory.',
    workflowBn: [
      '১. মানি ম্যাপ ও খরচ ট্যাবে গ্রস সেলস, কুরিয়ার রিসিভেবল, অ্যাড স্পেন্ড ও প্রোমো কোড পরিচালনা করুন।',
      '২. একাউন্টিং, ভ্যাট ও রিফান্ড ট্যাবে ডাবল-এন্ট্রি ৫% ভ্যাট হিসাব, পেআউট ফি শিডিউল ও গ্রাহক রিফান্ড প্রসেস করুন।',
      '৩. প্রোডাক্ট ৩৬০ ও স্টক ট্যাবে প্রতিটি ভ্যারিয়েন্টের স্টক কভারেজ ও QC স্টক রিসিপ্ট পরিচালনা করুন।',
    ],
    workflowEn: [
      '1. Track gross sales, courier receivables, ad spend ROAS, and promo rules in Money Map & P&L.',
      '2. Inspect 5% VAT accounting, payout channel fees, and execute customer refunds in Accounting, VAT & Refunds.',
      '3. Monitor variant stock coverage and record QC receipts in Product 360 & Stock.',
    ],
    rulesBn: [
      '• ৫% ভ্যাট শুধুমাত্র প্ল্যাটফর্মের নিট কমিশন মার্জিনের ওপর প্রযোজ্য, ভেন্ডর প্রদেয়ের ওপর নয়।',
      '• প্রোমো ডিসকাউন্ট কেবল প্ল্যাটফর্ম মার্জিন থেকে কাটা যায়।',
    ],
    rulesEn: [
      '• 5% VAT applies strictly to net platform commission margin, never vendor principal.',
      '• Promo discounts deduct strictly from platform margin.',
    ],
  },
  messaging_hub: {
    titleBn: 'মেসেজিং ইনবক্স ও টেমপ্লেট (Messaging)',
    titleEn: 'Messaging — Customer Inbox, Vendor Inbox & Templates',
    purposeBn: 'কাস্টমার ইনকোয়ারি, ভেন্ডর সাপোর্ট মেসেজ এবং দ্বিভাষিক অর্ডার মেসেজ টেমপ্লেট ও অটোমেশন রুলস।',
    purposeEn: 'Unified inbox for customer inquiries and vendor support threads, plus bilingual order templates and automation rules.',
    workflowBn: [
      '১. কাস্টমার ইনবক্সে স্টোরফ্রন্ট থেকে আসা মেসেজের স্ট্যাটাস, অগ্রাধিকার ও অভ্যন্তরীণ নোট আপডেট করুন।',
      '২. ভেন্ডর ইনবক্সে ভেন্ডরদের সাপোর্ট টিকিটের উত্তর দিন বা সমাধান হলে টিকিট বন্ধ করুন।',
      '৩. টেমপ্লেট ট্যাবে অর্ডারের জন্য ফ্রি wa.me / SMS মেসেজ তৈরি ও অটোমেশন রুলস পরিচালনা করুন।',
    ],
    workflowEn: [
      '1. Triage storefront customer inquiries in Customer Inbox with status, priority, and internal notes.',
      '2. Reply to or close vendor support tickets directly inside Vendor Inbox.',
      '3. Generate free wa.me / SMS order messages and manage automation rules in Templates.',
    ],
    rulesBn: [
      '• কল বা WhatsApp ডিপ-লিংক বাইরের অ্যাপে খোলে; স্বয়ংক্রিয়ভাবে কোনো মেসেজ পাঠানো হয় না।',
      '• অটোমেশন রুলস ডিফল্টে Dry-Run মোডে থাকে এবং কিল-সুইচ দিয়ে তাৎক্ষণিক বন্ধ করা যায়।',
    ],
    rulesEn: [
      '• Call and WhatsApp links open externally; no customer message is dispatched silently.',
      '• Automation rules default to Dry-Run and can be halted immediately via the global kill-switch.',
    ],
  },
  sync_health: {
    titleBn: 'সিঙ্ক ও লাইভ কানেকশন হেলথ (Sync & Health)',
    titleEn: 'Google Sheets Sync & Live Connectivity Health',
    purposeBn: 'Supabase, Vercel, কুরিয়ার, Cron এবং ফ্রন্টএন্ড-ব্যাকএন্ড সংযোগের লাইভ অবস্থা যাচাই এবং Google Sheets ওয়ান-ওয়ে মিরর সিঙ্ক।',
    purposeEn: 'Live connectivity diagnostics for Supabase, Vercel, couriers, cron, and API bridge alongside Google Sheets one-way mirror sync.',
    workflowBn: [
      '১. লাইভ হেলথ ট্যাবে Supabase RPC ল্যাটেন্সি, Vercel রানটাইম, মিডিয়া স্টোরেজ ও Env ক্রেডেনশিয়াল অবস্থা দেখুন।',
      '২. Google Sheets সিঙ্ক ট্যাবে ইনক্রিমেন্টাল বা ফুল রিসিঙ্ক চালান অথবা ৮-ট্যাব JSON স্ন্যাপশট ডাউনলোড করুন।',
      '৩. Apps Script (Code.gs) কপি করে Google Sheet-এ ডিপ্লয় করুন এবং URL সার্ভার Env-এ সেট করুন।',
    ],
    workflowEn: [
      '1. Inspect live Supabase RPC latency, Vercel runtime, storage, and env readiness in Live Health.',
      '2. Run Incremental or Full Resync in Google Sheets Sync, or download an 8-tab JSON snapshot.',
      '3. Deploy the Code.gs Web App script in Google Sheets and set GOOGLE_SHEETS_APPS_SCRIPT_URL in server env.',
    ],
    rulesBn: [
      '• এই ডায়াগনস্টিকে কখনোই কোনো API Key বা সিক্রেটের আসল মান দেখানো হয় না।',
      '• গুগল শিট সিঙ্ক strictly One-Way Mirror — শিটে এডিট করলে ERP ডাটাবেজ বদলায় না।',
    ],
    rulesEn: [
      '• Diagnostics never expose raw API keys or environment secrets.',
      '• Google Sheets mirror is strictly one-way — edits in Sheets never overwrite the ERP database.',
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
  vendor_payouts: {
    titleBn: 'ভেন্ডর পেআউট রেজিস্টার, এসক্রো লেজার ও রিটার্ন',
    titleEn: 'Vendor Payouts, Escrow Ledger & Returns',
    purposeBn:
      'কোন ভেন্ডরকে কবে, কত টাকা, কোন মাধ্যমে পরিশোধ করা হয়েছে তার পূর্ণ রেজিস্টার, এসক্রো ম্যাচুরিটি ও লেজার রিভার্সাল, এবং ৪-মুখী রিটার্ন সমন্বয় এক জায়গায়।',
    purposeEn:
      'Complete vendor payout register, real-time escrow balances (Pending -> Locked -> Withdrawable), 7-day maturity promotion, Maker-Checker ledger reversals, and 4-way return liability settlement.',
    workflowBn: [
      '১. পেআউট রেজিস্টারে নতুন পেআউট অনুরোধ তৈরি বা সরাসরি পরিশোধ করুন; অনুমোদনের পর TrxID দিয়ে পরিশোধিত চিহ্নিত করুন।',
      '২. এসক্রো লেজার ও ম্যাচুরিটি ট্যাবে ভেন্ডরভিত্তিক ব্যালেন্স ওয়াটারফল দেখুন, ৭-দিন পূর্ণ হওয়া লকড টাকা উত্তোলনযোগ্য করুন এবং প্রয়োজনে রিভার্সাল প্রসেস করুন।',
      '৩. রিটার্ন ও দায় ট্যাবে ৪-মুখী রিটার্ন ইঞ্জিন দিয়ে স্টক ও ভেন্ডর লেজার সমন্বয় করুন।',
    ],
    workflowEn: [
      '1. Create payout requests or direct payouts in Payout Register; approve and mark paid with a mandatory TrxID.',
      '2. Inspect per-vendor escrow balances, promote matured 7-day holds, and handle Maker-Checker ledger reversals in Escrow Ledger & Maturity.',
      '3. Settle returns across inventory and vendor escrow using the 4-way Return Engine.',
    ],
    rulesBn: [
      '• অনুরোধের সাথে সাথেই টাকা হোল্ড হয়, তাই একই ব্যালেন্সে দুইবার পেআউট সম্ভব নয়।',
      '• মেকার-চেকার নীতি: নিজে তৈরি করা পেআউট বা লেজার রিভার্সাল সাধারণভাবে নিজে অনুমোদন করা যায় না।',
      '• পরিশোধ সম্পন্ন করতে TrxID বাধ্যতামূলক; বাতিল করলে হোল্ড টাকা ভেন্ডরের ব্যালেন্সে ফিরে যায়।',
    ],
    rulesEn: [
      '• Funds are held immediately upon payout request to prevent double disbursement.',
      '• Maker-checker separation applies to payout approvals and ledger reversals.',
      '• A TrxID is mandatory to mark a payout paid; rejection restores held funds.',
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
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!tabKey) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabKey]);
  if (!tabKey) return null;
  const guide = OPERATIONAL_HELP_GUIDE[tabKey];
  if (!guide) return null;

  const isBn = locale === 'bn';

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="operational-help-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface border border-border rounded-lg shadow-xl animate-in fade-in zoom-in-95"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 bg-bg border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-mono font-bold text-sm">
              !
            </span>
            <div>
              <h2 id="operational-help-modal-title" className="text-sm font-bold text-ink">
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
            aria-label={isBn ? 'বন্ধ করুন' : 'Close'}
            className="min-w-11 min-h-11 flex items-center justify-center rounded-md border border-border bg-surface text-ink hover:bg-bg transition-colors cursor-pointer"
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
            {isBn ? 'পঞ্চবিন্দু (Panchabindu) F-Commerce ERP' : 'Panchabindu Consignment F-Commerce ERP'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-1.5 bg-ink text-bg font-bold text-xs rounded-md border border-ink hover:opacity-90 transition-opacity cursor-pointer"
          >
            {isBn ? 'ঠিক আছে (Close)' : 'Got it (Close)'}
          </button>
        </div>
      </div>
    </div>
  );
}
