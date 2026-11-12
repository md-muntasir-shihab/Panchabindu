'use client';

// src/components/storefront/contact-client.tsx
// Botanical Heritage Calm — Contact & About Showcase
// Features:
//   - Editorial Company Story & Consignment Provenance
//   - Transparent QC & Warehouse Trust Guarantees
//   - Verified Support Channels (Phone, WhatsApp, Email, Hub Address)
//   - Interactive Message & Inquiry Form with Toast confirmation

import * as React from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  Mail,
  MapPin,
  Clock,
  ShieldCheck,
  Truck,
  RotateCcw,
  Send,
  CheckCircle2,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicSafeSiteSettingsDTO,
} from '@/src/lib/db/repository';
import { useLocaleStore } from '@/src/store/use-locale-store';
import { StorefrontShell } from './storefront-shell';

export interface ContactClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
}

export function ContactClient({
  siteSettings,
  categories,
}: ContactClientProps) {
  const locale = useLocaleStore((s) => s.locale);
  const brandName =
    locale === 'bn' ? siteSettings.brandNameBn : siteSettings.brandNameEn;

  const aboutSettings = siteSettings.aboutContactPage;

  const titleText =
    locale === 'bn'
      ? aboutSettings?.titleBn || 'যোগাযোগ ও আমাদের পরিচিতি'
      : aboutSettings?.titleEn || 'Contact & About Us';

  const subtitleText =
    locale === 'bn'
      ? aboutSettings?.subtitleBn ||
        'বাংলাদেশের তৃণমূল কারিগর ও গ্রাহকদের মাঝে নির্ভরযোগ্য, কিউসি-যাচাইকৃত কনসাইনমেন্ট প্ল্যাটফর্ম।'
      : aboutSettings?.subtitleEn ||
        'Reliable, QC-verified consignment platform bridging authentic artisans and valued customers.';

  const storyTitle =
    locale === 'bn'
      ? aboutSettings?.storyTitleBn || 'পঞ্চগড় (PANCHAGARH) কীভাবে কাজ করে?'
      : aboutSettings?.storyTitleEn || 'How PANCHAGARH Works';

  const storyP1 =
    locale === 'bn'
      ? aboutSettings?.storyParagraph1Bn ||
        `${brandName} একটি আধুনিক মাল্টি-ভেন্ডর কনসাইনমেন্ট কমার্স প্ল্যাটফর্ম। আমরা বাংলাদেশের স্থানীয় তাঁতি, চাষী ও কারিগরদের সাথে সরাসরি কাজ করি। প্রতিটি পণ্য আমাদের নিজস্ব সেন্ট্রাল ওয়্যারহাউসে রিসিভ করে অভিজ্ঞ টিম দ্বারা গুণগত মান (QC) নিশ্চিত করার পর প্যাকেজিং ও ডেলিভারি করা হয়।`
      : aboutSettings?.storyParagraph1En ||
        `${brandName} is a transparent consignment commerce platform connecting verified regional artisans with consumers nationwide. Every consignment lot undergoes strict physical quality checks at our central warehouse prior to customer dispatch.`;

  const storyP2 =
    locale === 'bn'
      ? aboutSettings?.storyParagraph2Bn ||
        'আমাদের প্রধান লক্ষ্য হলো—ক্রেতা যেন ঘরে বসেই শতভাগ খাঁটি পণ্য পান, এবং প্রান্তিক উৎপাদক যেন তাদের পণ্যের সঠিক ন্যায্যমূল্য ও সঠিক সময়ে পেমেন্ট পান।'
      : aboutSettings?.storyParagraph2En ||
        'Our mission is simple: ensure authentic provenance and fair trade for suppliers, while guaranteeing pristine product quality and peace of mind for every customer.';

  const warehouseAddress =
    locale === 'bn'
      ? aboutSettings?.warehouseAddressBn ||
        'প্লট ১২, রোড ৪/এ, ধানমন্ডি আ/এ, ঢাকা-১২০৯'
      : aboutSettings?.warehouseAddressEn ||
        'Plot 12, Road 4/A, Dhanmondi R/A, Dhaka-1209';

  const helplineHours =
    locale === 'bn'
      ? aboutSettings?.helplineHoursBn || 'সকাল ৯টা – রাত ১০টা (প্রতিদিন)'
      : aboutSettings?.helplineHoursEn || '9 AM – 10 PM Everyday';

  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !message.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/storefront/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setName('');
        setPhone('');
        setSubject('');
        setMessage('');
        window.setTimeout(() => setSubmitted(false), 5000);
      } else {
        setSubmitError(data.error?.message || 'বার্তা পাঠাতে ত্রুটি ঘটেছে।');
      }
    } catch {
      setSubmitError('সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 space-y-12">
        {/* Breadcrumb & Title */}
        <div className="space-y-2 border-b border-[#E4E2DC] pb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#5A655D] hover:text-[#1B4332] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{locale === 'bn' ? 'হোমে ফিরে যান' : 'Back to Home'}</span>
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-[#1B4332] uppercase tracking-wider">
                {locale === 'bn' ? 'আমাদের পরিচয় ও গ্রাহক সেবা' : 'About Us & Support'}
              </p>
              <h1 className="text-2xl sm:text-4xl font-bold text-[#162119] tracking-tight mt-1">
                {titleText}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#5A655D] max-w-md">
              {subtitleText}
            </p>
          </div>
        </div>

        {/* 2-Column Split: Left Story / Right Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left Column: About Our Heritage & Consignment Model (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            {/* Story Card */}
            <div className="p-6 sm:p-8 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-4">
              <span className="text-xs font-semibold text-[#1B4332] tracking-wide">
                {locale === 'bn' ? 'আমাদের গল্প ও দর্শন' : 'Our Story & Heritage'}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#162119] leading-snug">
                {storyTitle}
              </h2>
              <p className="text-sm text-[#5A655D] leading-relaxed">
                {storyP1}
              </p>
              <p className="text-sm text-[#5A655D] leading-relaxed">
                {storyP2}
              </p>

              {/* Trust Pillars Inside Story */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                <div className="p-3.5 rounded-xl border border-[#E4E2DC] bg-[#FAF9F5]">
                  <ShieldCheck className="w-4 h-4 text-[#1B4332]" />
                  <p className="text-xs font-bold text-[#162119] mt-2">
                    {locale === 'bn' ? '১০০% কিউসি ভেরিফাইড' : '100% QC Verified'}
                  </p>
                  <p className="text-[11px] text-[#5A655D] mt-0.5">
                    {locale === 'bn' ? 'ছবি ও ভিডিও সহ যাচাই' : 'Inspected before dispatch'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-[#E4E2DC] bg-[#FAF9F5]">
                  <Truck className="w-4 h-4 text-[#1B4332]" />
                  <p className="text-xs font-bold text-[#162119] mt-2">
                    {locale === 'bn' ? '৬৪ জেলায় ডেলিভারি' : 'Nationwide Courier'}
                  </p>
                  <p className="text-[11px] text-[#5A655D] mt-0.5">
                    {locale === 'bn' ? 'পাঠাও, স্টেডফাস্ট ও ডাক' : 'Pathao & Steadfast'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-[#E4E2DC] bg-[#FAF9F5]">
                  <RotateCcw className="w-4 h-4 text-[#1B4332]" />
                  <p className="text-xs font-bold text-[#162119] mt-2">
                    {locale === 'bn' ? '৭ দিনের সহজ রিটার্ন' : '7-Day Easy Return'}
                  </p>
                  <p className="text-[11px] text-[#5A655D] mt-0.5">
                    {locale === 'bn' ? 'ঝামেলাহীন সমাধান' : 'Hassle-free guarantee'}
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Contact Channels Card */}
            <div className="p-6 sm:p-8 rounded-2xl border border-[#E4E2DC] bg-[#FAF9F5] space-y-4">
              <h3 className="text-base font-bold text-[#162119]">
                {locale === 'bn' ? 'সরাসরি যোগাযোগের ঠিকানা ও মাধ্যম' : 'Contact Channels & Hub'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9]">
                  <PhoneCall className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#162119]">
                      {locale === 'bn' ? 'হেল্পলাইন ও কল সাপোর্ট' : 'Customer Helpline'}
                    </p>
                    <p className="text-sm font-bold text-[#162119] tabular-nums mt-0.5">
                      {siteSettings.supportPhone}
                    </p>
                    <p className="text-[11px] text-[#5A655D] mt-0.5">
                      {helplineHours}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9]">
                  <Mail className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#162119]">
                      {locale === 'bn' ? 'অফিসিয়াল ইমেইল' : 'Email Support'}
                    </p>
                    <p className="font-medium text-[#162119] mt-0.5">
                      {siteSettings.supportEmail || 'support@panchagarh.com.bd'}
                    </p>
                    <p className="text-[11px] text-[#5A655D] mt-0.5">
                      {locale === 'bn' ? '২৪ ঘণ্টার মধ্যে রিপ্লাই' : 'Response within 24h'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9]">
                  <MapPin className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#162119]">
                      {locale === 'bn' ? 'সেন্ট্রাল ওয়্যারহাউস ও অফিস' : 'Central Warehouse Hub'}
                    </p>
                    <p className="text-muted mt-0.5 leading-snug">
                      {warehouseAddress}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9]">
                  <Clock className="w-4 h-4 text-[#1B4332] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#162119]">
                      {locale === 'bn' ? 'ডেলিভারি ট্র্যাকিং সাপোর্ট' : 'Delivery Tracking'}
                    </p>
                    <p className="text-muted mt-0.5 leading-snug">
                      {locale === 'bn'
                        ? 'অর্ডার নম্বর দিয়ে লাইভ ট্র্যাকিং পেজ দেখুন'
                        : 'Track parcel status with order number'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Customer Message & Inquiry Form (5 cols) */}
          <div className="lg:col-span-5">
            <div className="p-6 sm:p-8 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-5">
              <div>
                <p className="text-xs font-semibold text-[#1B4332]">
                  {locale === 'bn' ? 'বার্তা পাঠান' : 'Send a Message'}
                </p>
                <h3 className="text-xl font-bold text-[#162119] mt-0.5">
                  {locale === 'bn'
                    ? 'আপনার জিজ্ঞাসা বা মতামত জানান'
                    : 'Customer Inquiry / Feedback'}
                </h3>
                <p className="text-xs text-[#5A655D] mt-1 leading-relaxed">
                  {locale === 'bn'
                    ? 'যেকোনো পণ্য, কাস্টম অর্ডার বা ডেলিভারি বিষয়ে জানতে নিচের ফর্মটি পূরণ করুন।'
                    : 'Fill out the form below for product inquiries, custom requests or order feedback.'}
                </p>
              </div>

              {submitted && (
                <div className="p-4 rounded-xl border border-[#15803D]/30 bg-[#E8F0EC] flex items-center gap-2.5 text-xs text-[#15803D] font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {locale === 'bn'
                      ? 'আপনার বার্তাটি সফলভাবে পাঠানো হয়েছে। আমাদের টিম দ্রুত আপনার সাথে যোগাযোগ করবে।'
                      : 'Your message has been received. Our team will contact you shortly.'}
                  </span>
                </div>
              )}

              {submitError && (
                <div className="p-3.5 rounded-xl border border-red-300 bg-red-50 text-xs text-red-700 font-medium">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-[#162119] mb-1">
                    {locale === 'bn' ? 'আপনার নাম *' : 'Your Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={locale === 'bn' ? 'যেমন: তানভীর আহমেদ' : 'e.g. Tanvir Ahmed'}
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] rounded-xl focus:outline-none focus:border-[#1B4332]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#162119] mb-1">
                    {locale === 'bn' ? 'মোবাইল নম্বর *' : 'Phone Number *'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] rounded-xl focus:outline-none focus:border-[#1B4332]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#162119] mb-1">
                    {locale === 'bn' ? 'বিষয়' : 'Subject'}
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={locale === 'bn' ? 'যেমন: পণ্য সম্পর্কে জিজ্ঞাসা' : 'e.g. Product inquiry'}
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] rounded-xl focus:outline-none focus:border-[#1B4332]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#162119] mb-1">
                    {locale === 'bn' ? 'আপনার বার্তা *' : 'Your Message *'}
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      locale === 'bn'
                        ? 'আপনার বার্তা বিস্তারিত লিখুন...'
                        : 'Write your message details here...'
                    }
                    className="w-full p-3.5 text-sm bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] rounded-xl focus:outline-none focus:border-[#1B4332]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[46px] px-5 py-3 rounded-xl bg-[#1B4332] text-[#FAF9F5] hover:bg-[#143325] text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isSubmitting
                      ? locale === 'bn'
                        ? 'পাঠানো হচ্ছে...'
                        : 'Sending...'
                      : locale === 'bn'
                      ? 'বার্তা পাঠান'
                      : 'Send Message'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </StorefrontShell>
  );
}
