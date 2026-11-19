'use client';

// src/components/ui/primitives.tsx
// 4-Solid Color Locked Core Component System (Button, Card, Badge, Input, Select, Skeleton, EmptyState)
// Strict Negative Rules Enforced:
//   - NO gradients, NO blurs, NO heavy shadows
//   - ONLY tokens from tokens.css (bg-bg, bg-surface, border-border, text-ink, text-muted, and semantic status tokens)
//   - Minimum 44px touch target height on interactive controls
//   - Monochrome lucide-react icons only (zero emojis)

import * as React from 'react';
import { Loader2, Inbox, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-[var(--color-primary,var(--color-ink))] text-bg border border-[var(--color-primary,var(--color-ink))] hover:opacity-90 active:scale-[0.99]',
      secondary:
        'bg-surface text-ink border border-border hover:bg-border/60 active:scale-[0.99]',
      outline:
        'bg-bg text-ink border border-border hover:bg-surface active:scale-[0.99]',
      ghost:
        'bg-transparent text-ink border border-transparent hover:bg-surface active:scale-[0.99]',
      danger:
        'bg-danger text-bg border border-danger hover:opacity-90 active:scale-[0.99]',
    };

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'min-h-[44px] px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)]',
      md: 'min-h-[44px] px-4 py-2.5 text-sm font-medium rounded-[var(--radius-md)]',
      lg: 'min-h-[48px] px-6 py-3 text-base font-semibold rounded-[var(--radius-md)]',
      icon: 'min-h-[44px] min-w-[44px] p-2.5 rounded-[var(--radius-md)]',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
          aria-busy={isLoading || undefined}
        className={cn(
          'inline-flex items-center justify-center gap-2 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: 'bg' | 'surface';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, surface = 'bg', padding = 'md', children, ...props }, ref) => {
    const paddingMap = {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4 sm:p-6',
      lg: 'p-6 sm:p-8',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'border border-border rounded-[var(--radius-lg)]',
          surface === 'surface' ? 'bg-surface' : 'bg-bg',
          paddingMap[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export type BadgeStatus =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
}

export function Badge({
  className,
  status = 'neutral',
  children,
  ...props
}: BadgeProps) {
  const statusStyles: Record<BadgeStatus, string> = {
    neutral: 'bg-surface text-ink border-border',
    success: 'bg-bg text-success border-success',
    warning: 'bg-bg text-warning border-warning',
    danger: 'bg-bg text-danger border-danger',
    info: 'bg-bg text-info border-info',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium border rounded-[var(--radius-sm)] whitespace-nowrap',
        statusStyles[status],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const messageId = `${inputId}-message`;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-ink"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'w-full min-h-[44px] px-3.5 py-2 text-sm bg-bg text-ink border rounded-[var(--radius-md)] placeholder:text-muted focus:outline-2 focus:outline-offset-0 focus:outline-ink disabled:bg-surface disabled:opacity-60',
            error ? 'border-danger' : 'border-border',
            className
          )}
          {...props}
          aria-invalid={Boolean(error)}
          aria-describedby={[props['aria-describedby'], error || helperText ? messageId : null].filter(Boolean).join(' ') || undefined}
        />
        {error ? (
          <p id={messageId} className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        ) : helperText ? (
          <p id={messageId} className="text-xs text-muted">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: readonly SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;
    const messageId = `${selectId}-message`;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-ink"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={cn(
            'w-full min-h-[44px] px-3.5 py-2 text-sm bg-bg text-ink border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink disabled:bg-surface disabled:opacity-60',
            error ? 'border-danger' : 'border-border',
            className
          )}
          {...props}
          aria-invalid={Boolean(error)}
          aria-describedby={[props['aria-describedby'], error ? messageId : null].filter(Boolean).join(' ') || undefined}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={String(opt.value)} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={messageId} className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse bg-surface border border-border/50 rounded-[var(--radius-md)]',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-border rounded-[var(--radius-lg)] bg-surface/40',
        className
      )}
    >
      <div className="w-12 h-12 flex items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg text-ink mb-4">
        {icon ?? <Inbox className="w-6 h-6" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted max-w-md">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export type FinancialGlossaryKey =
  | 'supplier_payable'
  | 'platform_margin'
  | 'cod_receivable'
  | 'escrow_holding'
  | 'reconciliation'
  | 'stock_reservation'
  | 'available_stock'
  | 'refund_liability'
  | 'settlement_pending'
  | 'fraud_risk'
  | 'pathao_store_name'
  | 'item_weight'
  | 'amount_to_collect'
  | 'bd_post_vpp'
  | 'post_code'
  | 'pathao_city_zone';

export interface FinancialTermDefinition {
  termKey: FinancialGlossaryKey;
  titleBn: string;
  termEn: string;
  explanationBn: string;
  explanationEn: string;
  formula?: string;
  impactBn: string;
  impactEn: string;
}

export const FINANCIAL_TERM_GLOSSARY: Record<
  FinancialGlossaryKey,
  FinancialTermDefinition
> = {
  supplier_payable: {
    termKey: 'supplier_payable',
    titleBn: 'সাপ্লায়ার প্রদেয় (Supplier Payable)',
    termEn: 'Supplier Payable',
    explanationBn:
      'পণ্য বিক্রি ও কালেকশন সম্পন্ন হওয়ার পর ভেন্ডর বা সাপ্লায়ারকে যে পরিমাণ অর্থ পরিশোধ করতে হবে।',
    explanationEn:
      'Amount payable to the vendor or supplier after order delivery and payment collection are completed.',
    formula: 'Supplier Cost + Supplier Profit = Supplier Payable',
    impactBn:
      'প্রোমো ডিসকাউন্ট প্ল্যাটফর্ম মার্জিন থেকে কাটা হয়; অনুমোদন ছাড়া সাপ্লায়ার প্রদেয় কমে না।',
    impactEn:
      'Promo discounts are absorbed by platform margin; supplier payable is never reduced without explicit approval.',
  },
  platform_margin: {
    termKey: 'platform_margin',
    titleBn: 'প্ল্যাটফর্ম মার্জিন (Platform Margin)',
    termEn: 'Platform Margin',
    explanationBn:
      'চূড়ান্ত বিক্রয়মূল্য থেকে সাপ্লায়ার প্রদেয় বাদ দেওয়ার পর পঞ্চবিন্দু প্ল্যাটফর্মের যে গ্রস কমিশন থাকে।',
    explanationEn:
      'Gross platform commission remaining after deducting Supplier Payable from the retail sale price.',
    formula: 'Final Sale Price - Supplier Payable = Platform Margin',
    impactBn:
      'এটি অভ্যন্তরীণ গোপনীয় তথ্য; গ্রাহক বা ভেন্ডর ভিউতে কখনোই প্রদর্শিত হয় না।',
    impactEn:
      'Strictly internal confidential figure; never exposed to storefront customers or vendor portals.',
  },
  cod_receivable: {
    termKey: 'cod_receivable',
    titleBn: 'কুরিয়ার সিওডি প্রাপ্য (COD Receivable)',
    termEn: 'Courier COD Receivable',
    explanationBn:
      'ডেলিভারিকৃত অর্ডারের বিপরীতে কুরিয়ার গ্রাহকের কাছ থেকে টাকা সংগ্রহ করেছে কিন্তু এখনো প্ল্যাটফর্ম ব্যাংকে রেমিট করেনি।',
    explanationEn:
      'Cash collected by the courier from customers on delivered orders that has not yet been remitted to the platform bank account.',
    formula: 'Delivered COD Total - Remitted Bank Receipt = COD Receivable',
    impactBn:
      'কুরিয়ার কালেকশন এবং ব্যাংক রেমিট্যান্স আলাদাভাবে রিকনসাইল না হওয়া পর্যন্ত সেটেলমেন্ট ছাড় হয় না।',
    impactEn:
      'Vendor settlement is held until courier collection and bank remittance are reconciled.',
  },
  escrow_holding: {
    termKey: 'escrow_holding',
    titleBn: 'এসক্রো-ধাঁচের হোল্ডিং লেজার (Escrow-style Holding)',
    termEn: 'Escrow-style Holding Liability',
    explanationBn:
      'অভ্যন্তরীণ অ্যাকাউন্টিং লায়াবিলিটি ট্র্যাকিং যেখানে ভেন্ডরের প্রাপ্য অর্থ রিটার্ন হোল্ড পিরিয়ড উত্তীর্ণ না হওয়া পর্যন্ত সংরক্ষিত থাকে।',
    explanationEn:
      'Internal accounting liability tracking where supplier earnings remain held until the return hold window matures.',
    formula: 'Pending (In-Flight) → Locked (Hold Window) → Available (Matured)',
    impactBn:
      'এটি অভ্যন্তরীণ হিসাবরক্ষণ দায় (Internal Accounting Liability); পৃথক ব্যাংক এসক্রো অ্যাকাউন্টের দাবি নয়।',
    impactEn:
      'Represents an internal accounting liability bucket rather than an external bank escrow account.',
  },
  reconciliation: {
    termKey: 'reconciliation',
    titleBn: 'আর্থিক সমন্বয় (Reconciliation)',
    termEn: 'Financial Reconciliation',
    explanationBn:
      'প্রত্যাশিত সিওডি কালেকশন, ম্যানুয়াল বিকাশ সাবমিশন এবং কুরিয়ারের ব্যাংক রেমিট্যান্সের মধ্যকার মিল ও গরমিল যাচাই।',
    explanationEn:
      'Verification and matching between expected COD collections, manual bKash claims, and actual courier bank remittances.',
    formula: 'Expected Collectable - Verified Remittance = Discrepancy',
    impactBn:
      'শর্ট-পেমেন্ট বা অমিল থাকলে অটো-কারেকশন না করে কুরিয়ার ক্লেইম বা ডিসক্রিপেন্সি তৈরি হয়।',
    impactEn:
      'Short payments or mismatches open an auditable courier discrepancy claim instead of silently auto-adjusting.',
  },
  stock_reservation: {
    termKey: 'stock_reservation',
    titleBn: 'সংরক্ষিত স্টক (Stock Reservation)',
    termEn: 'Stock Reservation',
    explanationBn:
      'গ্রাহক অর্ডার প্লেস করার সাথে সাথে ওভারসেলিং রোধে যে পরিমাণ স্টক অ্যাটমিকভাবে রিজার্ভ করা হয়।',
    explanationEn:
      'Inventory units atomically reserved when an order is placed to prevent overselling across concurrent checkouts.',
    formula: 'Reserved Stock = Active Unshipped Order Quantities',
    impactBn:
      'অর্ডার ক্যানসেল বা মেয়াদোত্তীর্ণ হলে রিজার্ভেশন স্বয়ংক্রিয়ভাবে রিলিজ হয়ে অ্যাভেইলেবল স্টকে ফিরে যায়।',
    impactEn:
      'Cancelled orders automatically release reserved units back into Available Stock.',
  },
  available_stock: {
    termKey: 'available_stock',
    titleBn: 'বিক্রয়যোগ্য স্টক (Available Stock)',
    termEn: 'Available Stock',
    explanationBn:
      'ওয়্যারহাউসে থাকা মোট ভালো স্টক থেকে চলমান অর্ডারের রিজার্ভড স্টক বাদ দিয়ে যা নতুন অর্ডারের জন্য উন্মুক্ত।',
    explanationEn:
      'Good warehouse stock on hand minus active order reservations, open for new customer orders.',
    formula: 'Available Stock = On Hand Stock - Reserved Stock',
    impactBn:
      'একই পণ্যের শেষ স্টক দুইজন গ্রাহক একসঙ্গে অর্ডার করলেও নেগেটিভ স্টক হতে দেয় না।',
    impactEn:
      'Prevents negative inventory even when two customers attempt to buy the final unit simultaneously.',
  },
  refund_liability: {
    termKey: 'refund_liability',
    titleBn: 'রিফান্ড দায় (Refund Liability)',
    termEn: 'Customer Refund Payable',
    explanationBn:
      'প্রিপেইড বা রিটার্নকৃত অর্ডারের বিপরীতে গ্রাহককে ফেরত দেওয়ার জন্য অনুমোদিত কিন্তু এখনো অপরিশোধিত অর্থ।',
    explanationEn:
      'Approved customer refund amount for prepaid or returned orders that has not yet been disbursed.',
    formula: 'Refund Amount <= Original Verified Payment',
    impactBn:
      'বাস্তবে টাকা ফেরত না দেওয়া পর্যন্ত অর্ডার স্ট্যাটাস Refunded হয় না।',
    impactEn:
      'Order payment status is not marked Refunded until actual payout proof is recorded.',
  },
  settlement_pending: {
    termKey: 'settlement_pending',
    titleBn: 'অপেক্ষমাণ ভেন্ডর সেটেলমেন্ট (Settlement Pending)',
    termEn: 'Supplier Settlement Pending',
    explanationBn:
      'ভেন্ডরের অ্যাভেইলেবল ব্যালেন্স থেকে পেআউট রিকোয়েস্ট করার পর মেকার-চেকার অনুমোদনের অপেক্ষায় লককৃত অর্থ।',
    explanationEn:
      'Funds locked from a vendor’s Available balance upon payout request while awaiting maker-checker approval and disbursement.',
    formula: 'Payout Hold Deducted Immediately from Available Bucket',
    impactBn:
      'ডাবল-রিকোয়েস্ট প্রতিরোধ করে এবং মেকার-চেকার অনুমোদন ছাড়া কোনো অর্থ ছাড় হয় না।',
    impactEn:
      'Prevents duplicate withdrawal requests and enforces maker-checker approval before funds are released.',
  },
  fraud_risk: {
    termKey: 'fraud_risk',
    titleBn: 'ফ্রড ও ডেলিভারি ঝুঁকি (Fraud Risk)',
    termEn: 'Order Fraud & Refusal Risk',
    explanationBn:
      'পূর্বে বারবার ডেলিভারি রিফিউজাল, অসম্পূর্ণ ঠিকানা বা ডুপ্লিকেট অর্ডারের ওপর ভিত্তি করে নির্ণীত ঝুঁকি সূচক।',
    explanationEn:
      'Risk indicator derived from past delivery refusals, incomplete address quality, or duplicate orders within 24 hours.',
    formula: 'Risk Classification: Low | Medium | High | Critical',
    impactBn:
      'শুধু স্কোরের ভিত্তিতে স্থায়ী ব্যান করা হয় না; ম্যানুয়াল রিভিউ বা অগ্রিম পেমেন্ট শর্ত আরোপ করা যায়।',
    impactEn:
      'Never triggers an automatic permanent ban alone; used to require call review or mandatory advance delivery deposit.',
  },
  pathao_store_name: {
    termKey: 'pathao_store_name',
    titleBn: 'পাঠাও স্টোর নেম (StoreName)',
    termEn: 'Pathao Merchant StoreName',
    explanationBn:
      'আপনার পাঠাও মার্চেন্ট প্যানেলে নিবন্ধিত স্টোরের হুবহু নাম, যা বাল্ক সিএসভি ইমপোর্টের সময় পিকআপ স্টোর শনাক্ত করতে ব্যবহৃত হয়।',
    explanationEn:
      'Exact store name registered in your Pathao Merchant panel, required during bulk CSV import to match the pickup store.',
    formula: 'CSV Column: StoreName',
    impactBn:
      'কন্ট্রোল সেন্টারে একবার সেট করলে সব অর্ডার ও সিএসভি এক্সপোর্টে স্বয়ংক্রিয়ভাবে পূরণ হয়।',
    impactEn:
      'Configured once in Settings and auto-filled across all orders and bulk CSV exports.',
  },
  item_weight: {
    termKey: 'item_weight',
    titleBn: 'পার্সেল ওজন (ItemWeight)',
    termEn: 'Parcel Weight (kg / grams)',
    explanationBn:
      'অর্ডারের সকল পণ্যের ভ্যারিয়েন্ট ওজন এবং এককের গুণফল থেকে স্বয়ংক্রিয়ভাবে হিসাবকৃত মোট পার্সেল ওজন।',
    explanationEn:
      'Total parcel weight automatically computed from ordered variant weights multiplied by quantities.',
    formula: 'ItemWeight (kg) = max(0.1, sum(variant.weightGrams × qty) / 1000)',
    impactBn:
      'পাঠাও ও বাংলাদেশ ডাক বিভাগের ডেলিভারি চার্জ এবং ম্যানিফেস্টে সঠিক ওজন নিশ্চিত করে।',
    impactEn:
      'Ensures accurate courier weight tiers and manifest compliance for Pathao and BD Post.',
  },
  amount_to_collect: {
    termKey: 'amount_to_collect',
    titleBn: 'ডেলিভারিতে আদায়যোগ্য টাকা (AmountToCollect)',
    termEn: 'COD AmountToCollect (BDT)',
    explanationBn:
      'গ্রাহকের মোট প্রদেয় থেকে ভেরিফাইড অগ্রিম পেমেন্ট বাদ দেওয়ার পর ডেলিভারিম্যান যে পূর্ণসংখ্যা টাকা সংগ্রহ করবেন।',
    explanationEn:
      'Exact integer BDT the courier collects upon delivery after subtracting verified advance payments.',
    formula: 'AmountToCollect = round((TotalPayablePoisha - AdvancePaidPoisha) / 100)',
    impactBn:
      'পূর্ণ প্রিপেইড অর্ডারে স্বয়ংক্রিয়ভাবে 0 সেট হয় যাতে ডাবল কালেকশন না ঘটে।',
    impactEn:
      'Automatically set to 0 on fully prepaid orders to prevent double collection.',
  },
  bd_post_vpp: {
    termKey: 'bd_post_vpp',
    titleBn: 'ডাক বিভাগ সার্ভিস ও ভিপিপি (BD Post GEP / VPP)',
    termEn: 'BD Post Service & VPP Parcel',
    explanationBn:
      'বাংলাদেশ ডাক বিভাগের ক্যাশ-অন-ডেলিভারি পার্সেলের জন্য VPP_PARCEL এবং প্রিপেইড পার্সেলের জন্য GEP বা REGISTERED_PARCEL ব্যবহৃত হয়।',
    explanationEn:
      'Bangladesh Post uses VPP_PARCEL for cash-on-delivery collections and GEP or REGISTERED_PARCEL for prepaid dispatches.',
    formula: 'COD > 0 ? VPP_PARCEL : REGISTERED_PARCEL / GEP',
    impactBn:
      'ডাকঘর কাউন্টার বুকিং ম্যানিফেস্টে প্রাপক ও প্রেরকের ৪ সংখ্যার পোস্ট কোড বাধ্যতামূলক।',
    impactEn:
      'Requires 4-digit sender and recipient post codes on the postal counter manifest.',
  },
  post_code: {
    termKey: 'post_code',
    titleBn: '৪-সংখ্যার পোস্ট কোড (Post Code)',
    termEn: '4-Digit Bangladesh Post Code',
    explanationBn:
      'বাংলাদেশের ৬৪ জেলা ও ৬০৭ উপজেলা/থানা থেকে স্বয়ংক্রিয়ভাবে নির্ণীত ৪ সংখ্যার সরকারি ডাকঘর কোড।',
    explanationEn:
      'Official 4-digit postal code automatically resolved from 64 districts and 607 upazilas/thanas.',
    formula: 'Format: 4 Digits (e.g. 1209, 1216, 4000)',
    impactBn:
      'বাংলাদেশ ডাক বিভাগ (BD Post) এবং বক্স লেবেল প্রিন্টিংয়ের জন্য অপরিহার্য।',
    impactEn:
      'Required for Bangladesh Post manifests and printed box labels.',
  },
  pathao_city_zone: {
    termKey: 'pathao_city_zone',
    titleBn: 'পাঠাও সিটি, জোন ও এরিয়া (RecipientCity / Zone / Area)',
    termEn: 'Pathao RecipientCity, Zone & Area',
    explanationBn:
      'পাঠাও বাল্ক সিএসভি ইমপোর্টের বাধ্যতামূলক RecipientCity(*) ও RecipientZone(*) কলাম যা জেলা, থানা ও রাস্তার ঠিকানা থেকে অটো-সিঙ্ক হয়।',
    explanationEn:
      'Mandatory RecipientCity(*) and RecipientZone(*) columns for Pathao Bulk CSV import, auto-synced from district, thana, and street address.',
    formula: 'District + Upazila/Thana → RecipientCity(*) → RecipientZone(*) → RecipientArea',
    impactBn:
      'যেকোনো বাধ্যতামূলক ঘর খালি থাকলে অর্ডার গ্রিড ও সিএসভি প্রিভিউতে লাল সতর্কতা চিহ্ন দেখায়।',
    impactEn:
      'Highlights in red across the Orders Grid and CSV Preview if any required routing field is missing.',
  },
};

export interface InfoTooltipProps {
  termKey?: FinancialGlossaryKey;
  titleBn?: string;
  termEn?: string;
  explanationBn?: string;
  explanationEn?: string;
  formula?: string;
  impactBn?: string;
  impactEn?: string;
  locale?: 'bn' | 'en';
  className?: string;
}

export function InfoTooltip({
  termKey,
  titleBn,
  termEn,
  explanationBn,
  explanationEn,
  formula,
  impactBn,
  impactEn,
  locale,
  className,
}: InfoTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [horizAlign, setHorizAlign] = React.useState<'center' | 'left' | 'right'>('center');
  const containerRef = React.useRef<HTMLSpanElement>(null);

  const def = termKey ? FINANCIAL_TERM_GLOSSARY[termKey] : undefined;
  const resolvedTitleBn = titleBn ?? def?.titleBn ?? '';
  const resolvedTermEn = termEn ?? def?.termEn ?? '';
  const resolvedExplanationBn = explanationBn ?? def?.explanationBn ?? '';
  const resolvedExplanationEn = explanationEn ?? def?.explanationEn ?? resolvedExplanationBn;
  const resolvedFormula = formula ?? def?.formula;
  const resolvedImpactBn = impactBn ?? def?.impactBn ?? '';
  const resolvedImpactEn = impactEn ?? def?.impactEn ?? resolvedImpactBn;

  const isEn =
    locale === 'en' ||
    (!locale &&
      typeof document !== 'undefined' &&
      document.documentElement.lang === 'en');

  const updateAlignment = React.useCallback(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const halfPopover = 155;
    if (rect.left < halfPopover) {
      setHorizAlign('left');
    } else if (window.innerWidth - rect.right < halfPopover) {
      setHorizAlign('right');
    } else {
      setHorizAlign('center');
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateAlignment();
    function handleOutsideClick(e: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateAlignment);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateAlignment);
    };
  }, [open, updateAlignment]);

  const popoverPosClass =
    horizAlign === 'left'
      ? 'left-0 translate-x-0'
      : horizAlign === 'right'
      ? 'right-0 translate-x-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span
      ref={containerRef}
      className={cn('relative inline-flex items-center align-middle', className)}
    >
      <button
        type="button"
        aria-label={
          isEn
            ? `Details about ${resolvedTermEn || resolvedTitleBn}`
            : `${resolvedTermEn || resolvedTitleBn} সম্পর্কে বিস্তারিত তথ্য`
        }
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="inline-flex items-center justify-center w-11 h-11 -m-3 rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink transition-colors cursor-pointer"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-surface border border-transparent hover:border-border">
          <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 bottom-full mb-2 w-[min(18rem,calc(100vw-2rem))] sm:w-80 p-3 rounded-[var(--radius-md)] border border-ink bg-bg text-ink text-left text-xs leading-relaxed select-text shadow-sm',
            popoverPosClass
          )}
        >
          <span className="flex items-center justify-between gap-2 border-b border-border pb-1.5 mb-1.5">
            <strong className="font-bold text-ink">
              {isEn ? resolvedTermEn || resolvedTitleBn : resolvedTitleBn}
            </strong>
            {resolvedTermEn && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-surface border border-border text-muted">
                {resolvedTermEn}
              </span>
            )}
          </span>
          <span className="block text-ink mb-1.5">
            {isEn ? resolvedExplanationEn : resolvedExplanationBn}
          </span>
          {resolvedFormula && (
            <span className="block font-mono text-[11px] bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-1 text-ink mb-1.5">
              {resolvedFormula}
            </span>
          )}
          {(isEn ? resolvedImpactEn : resolvedImpactBn) && (
            <span className="block text-[11px] text-muted">
              <strong className="text-ink">
                {isEn ? 'Business impact:' : 'ব্যবসায়িক প্রভাব:'}
              </strong>{' '}
              {isEn ? resolvedImpactEn : resolvedImpactBn}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

