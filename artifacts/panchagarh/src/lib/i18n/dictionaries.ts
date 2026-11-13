// src/lib/i18n/dictionaries.ts
// Bilingual Dictionary (বাংলা Default + English Toggle) & Native Date/Number Formatters
// Rule Negative #12: Use native Intl.DateTimeFormat('bn-BD') instead of heavy date libraries.

export type Locale = 'bn' | 'en';

export interface Dictionary {
  common: {
    searchPlaceholder: string;
    cart: string;
    wishlist: string;
    account: string;
    categories: string;
    home: string;
    adminPanel: string;
    inStock: string;
    lowStockRemaining: (count: number) => string;
    outOfStock: string;
    notifyMe: string;
    addToCart: string;
    buyNow: string;
    freeDelivery: string;
    codAvailable: string;
    continueShopping: string;
    retry: string;
    loading: string;
    noResults: string;
    undo: string;
    close: string;
    apply: string;
    remove: string;
    total: string;
    subtotal: string;
    discount: string;
    deliveryCharge: string;
    confirmOrder: string;
    languageToggle: string;
  };
  cart: {
    title: string;
    emptyTitle: string;
    emptySubtitle: string;
    addMoreForFreeDelivery: (amountFormatted: string) => string;
    unlockedFreeDelivery: string;
    proceedToCheckout: string;
    itemRemovedToast: string;
  };
  admin: {
    todayScreen: string;
    ordersGrid: string;
    printStation: string;
    courier360: string;
    vendorEscrow: string;
    catalog360: string;
    financeMoneyMap: string;
    messaging: string;
    automationRules: string;
    googleSync: string;
    controlCenter: string;
    viewAsRole: string;
    demoModeActive: string;
    notConnectedSetupGuide: string;
  };
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function formatLocaleNumber(num: number, locale: Locale = 'bn'): string {
  if (locale === 'en') {
    return new Intl.NumberFormat('en-BD').format(num);
  }
  return new Intl.NumberFormat('bn-BD').format(num);
}

export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)]);
}

export function formatLocaleDateTime(
  isoDate: string | Date,
  locale: Locale = 'bn',
  includeTime = true
): string {
  const dateObj = typeof isoDate === 'string' ? new Date(isoDate) : isoDate;
  if (Number.isNaN(dateObj.getTime())) return '';

  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(dateObj);
}

export const DICTIONARIES: Record<Locale, Dictionary> = {
  bn: {
    common: {
      searchPlaceholder: 'পণ্য বা ক্যাটাগরি খুঁজুন...',
      cart: 'কার্ট',
      wishlist: 'পছন্দের তালিকা',
      account: 'অ্যাকাউন্ট',
      categories: 'ক্যাটাগরি',
      home: 'হোম',
      adminPanel: 'অ্যাডমিন ড্যাশবোর্ড',
      inStock: 'স্টকে আছে',
      lowStockRemaining: (count: number) => `মাত্র ${toBanglaDigits(count)} টি বাকি`,
      outOfStock: 'স্টক আউট',
      notifyMe: 'স্টকে এলে জানান',
      addToCart: 'কার্টে যোগ করুন',
      buyNow: 'এখনই কিনুন',
      freeDelivery: 'ফ্রি ডেলিভারি',
      codAvailable: 'ক্যাশ অন ডেলিভারি',
      continueShopping: 'কেনাকাটা চালিয়ে যান',
      retry: 'আবার চেষ্টা করুন',
      loading: 'লোড হচ্ছে...',
      noResults: 'কোনো ফলাফল পাওয়া যায়নি',
      undo: 'ফিরিয়ে আনুন',
      close: 'বন্ধ করুন',
      apply: 'প্রয়োগ করুন',
      remove: 'মুছে ফেলুন',
      total: 'সর্বমোট',
      subtotal: 'উপমোট',
      discount: 'ডিসকাউন্ট',
      deliveryCharge: 'ডেলিভারি চার্জ',
      confirmOrder: 'অর্ডার নিশ্চিত করুন',
      languageToggle: 'EN',
    },
    cart: {
      title: 'আপনার শপিং কার্ট',
      emptyTitle: 'আপনার কার্ট বর্তমানে খালি',
      emptySubtitle: 'পছন্দের পণ্য কার্টে যোগ করে সহজেই ক্যাশ অন ডেলিভারিতে অর্ডার করুন।',
      addMoreForFreeDelivery: (amountFormatted: string) =>
        `ফ্রি ডেলিভারি পেতে আরও ${amountFormatted} মূল্যের পণ্য যোগ করুন`,
      unlockedFreeDelivery: 'অভিনন্দন! আপনি ফ্রি ডেলিভারি সুবিধা পেয়েছেন',
      proceedToCheckout: 'চেকআউট করুন',
      itemRemovedToast: 'পণ্যটি কার্ট থেকে সরানো হয়েছে',
    },
    admin: {
      todayScreen: 'আজকের কাজ (Today)',
      ordersGrid: 'অর্ডার গ্রিড',
      printStation: 'প্রিন্ট স্টেশন (A4/4x6)',
      courier360: 'কুরিয়ার ৩৬০ ও রেমিট্যান্স',
      vendorEscrow: 'ভেন্ডর ও এসক্রো লেজার',
      catalog360: 'পণ্য ও স্টক ৩৬০',
      financeMoneyMap: 'মানি ম্যাপ ও প্রফিট',
      messaging: 'মেসেজিং ও টেমপ্লেট',
      automationRules: 'অটোমেশন রুলস',
      googleSync: 'গুগল শিট সিঙ্ক',
      controlCenter: 'কন্ট্রোল সেন্টার ও সেটিংস',
      viewAsRole: 'রোল প্রিভিউ মোড',
      demoModeActive: 'ডেমো মোড চালু আছে',
      notConnectedSetupGuide: 'সংযুক্ত নয় — সেটআপ গাইড দেখুন',
    },
  },
  en: {
    common: {
      searchPlaceholder: 'Search products or categories...',
      cart: 'Cart',
      wishlist: 'Wishlist',
      account: 'Account',
      categories: 'Categories',
      home: 'Home',
      adminPanel: 'Admin Dashboard',
      inStock: 'In Stock',
      lowStockRemaining: (count: number) => `Only ${count} left`,
      outOfStock: 'Out of Stock',
      notifyMe: 'Notify Me',
      addToCart: 'Add to Cart',
      buyNow: 'Buy Now',
      freeDelivery: 'Free Delivery',
      codAvailable: 'Cash on Delivery',
      continueShopping: 'Continue Shopping',
      retry: 'Retry',
      loading: 'Loading...',
      noResults: 'No matching items found',
      undo: 'Undo',
      close: 'Close',
      apply: 'Apply',
      remove: 'Remove',
      total: 'Total Payable',
      subtotal: 'Subtotal',
      discount: 'Discount',
      deliveryCharge: 'Delivery Charge',
      confirmOrder: 'Confirm Order',
      languageToggle: 'বাংলা',
    },
    cart: {
      title: 'Your Shopping Cart',
      emptyTitle: 'Your cart is currently empty',
      emptySubtitle: 'Browse our categories and add items to order with Cash on Delivery.',
      addMoreForFreeDelivery: (amountFormatted: string) =>
        `Add ${amountFormatted} more to unlock Free Delivery`,
      unlockedFreeDelivery: 'You have unlocked Free Delivery on this order',
      proceedToCheckout: 'Proceed to Checkout',
      itemRemovedToast: 'Item removed from cart',
    },
    admin: {
      todayScreen: 'Today Screen',
      ordersGrid: 'Orders Master Grid',
      printStation: 'Print Station (A4/4x6)',
      courier360: 'Courier 360 & Remittance',
      vendorEscrow: 'Vendors & Escrow Ledger',
      catalog360: 'Product & Stock 360',
      financeMoneyMap: 'Money Map & Net Profit',
      messaging: 'Messaging & Templates',
      automationRules: 'Automation Rules',
      googleSync: 'Google Sheets Sync',
      controlCenter: 'Control Center & Settings',
      viewAsRole: 'View as Role Mode',
      demoModeActive: 'Demo Mode Active',
      notConnectedSetupGuide: 'Not Connected — Click to view Setup Guide',
    },
  },
};
