import * as React from 'react';
import type { CourierRemittanceLedgerRecord, CourierClaimRecord, PickupBatchRecord } from '@/lib/admin/phase4b-service';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Card } from '../ui/primitives';
import { courierStage, summarizeCourierOrders, validPoisha, type CourierOrder } from './courier-receivables';

const KNOWN = ['steadfast', 'pathao', 'bd_post'];
function label(provider: string, bn: boolean) {
  if (provider === 'steadfast') return 'Steadfast';
  if (provider === 'pathao') return 'Pathao';
  if (provider === 'bd_post') return bn ? 'বাংলাদেশ ডাক বিভাগ' : 'Bangladesh Post';
  if (provider === 'redx') return bn ? 'RedX (পুরোনো রেকর্ড)' : 'RedX (historical records)';
  if (provider === 'manual' || provider === 'unassigned') return bn ? 'ম্যানুয়াল / কুরিয়ার অজানা' : 'Manual / courier unknown';
  return provider;
}
const providerKey = (order: CourierOrder) => order.courierProvider?.trim() || 'unassigned';
function statusLabel(status: string | undefined, bn: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_confirmation: ['নিশ্চিতকরণ বাকি', 'Pending confirmation'], confirmed: ['নিশ্চিত', 'Confirmed'], packed: ['প্যাক করা', 'Packed'], shipped: ['পাঠানো', 'Shipped'], out_for_delivery: ['ডেলিভারি চলছে', 'Out for delivery'], delivered: ['ডেলিভারি সম্পন্ন', 'Delivered'], return_initiated: ['রিটার্ন প্রক্রিয়াধীন', 'Return initiated'], returned: ['ফেরত এসেছে', 'Returned'], cancelled: ['বাতিল', 'Cancelled'], unpaid: ['অপরিশোধিত', 'Unpaid'], partial_verified: ['আংশিক যাচাইকৃত', 'Partially verified'], paid_verified: ['পেমেন্ট যাচাইকৃত', 'Payment verified'], remitted: ['রেমিটেড লেখা', 'Recorded remitted'], refunded: ['ফেরত দেওয়া লেখা', 'Recorded refunded'],
  };
  return status && labels[status] ? labels[status][bn ? 0 : 1] : (status || '—');
}
function safeDate(value: string | undefined, bn: boolean) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(bn ? 'bn-BD' : 'en-GB') : '—';
}

export function CourierReceivablesPanel({ locale, orders, ledger, claims, batches }: { locale: 'bn' | 'en'; orders: CourierOrder[]; ledger: CourierRemittanceLedgerRecord[]; claims: CourierClaimRecord[]; batches: PickupBatchRecord[] }) {
  const bn = locale === 'bn';
  const [selected, setSelected] = React.useState('all');
  const [stage, setStage] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const providers = [...new Set([...KNOWN, ...orders.map(providerKey), ...ledger.map(r => r.courierProvider || 'unassigned'), ...claims.map(r => r.courierProvider || 'unassigned'), ...batches.map(r => r.courierProvider || 'unassigned')])];
  const money = (value: unknown) => validPoisha(value) ? formatPoishaToBdt(value, locale) : (bn ? 'তথ্য অসম্পূর্ণ' : 'Data incomplete');
  const eligible = orders.filter(order => courierStage(order.status) !== 'excluded');
  const filtered = orders.filter(order => (selected === 'all' || providerKey(order) === selected) && (stage === 'all' || courierStage(order.status) === stage) && (!search.trim() || [order.orderNo, order.trackingCode, order.consignmentId].some(v => v?.toLowerCase().includes(search.trim().toLowerCase()))));
  const history = ledger.filter(row => selected === 'all' || (row.courierProvider || 'unassigned') === selected);
  const normalizeOrder = (value?: string) => value?.trim().toUpperCase() || '';
  const historyCounts = new Map<string, number>();
  for (const row of ledger) { const key = normalizeOrder(row.orderNo); historyCounts.set(key, (historyCounts.get(key) || 0) + 1); }
  const matchedOrders = new Set(orders.map(o => `${normalizeOrder(o.orderNo)}|${providerKey(o)}`));
  return <div className="space-y-5">
    <div role="note" className="p-4 border border-amber-500/40 bg-amber-500/10 rounded-[var(--radius-md)] space-y-2 text-sm">
      <p className="font-bold">{bn ? 'নিশ্চিত কুরিয়ার পাওনা এখন নির্ণয় করা যাচ্ছে না' : 'Verified courier receivable cannot currently be determined'}</p>
      <p>{bn ? 'নিচের অঙ্ক অর্ডারে লেখা সংগ্রহযোগ্য COD; কুরিয়ারের কাছে বাস্তবে কত বাকি তার প্রমাণ নয়। কুরিয়ারের সংগ্রহ, ফি, ফেরত ও ব্যাংকে জমা যাচাই করা হয়নি। আগের remitted স্ট্যাটাসও যাচাইকৃত ধরে বাদ দেওয়া হয়নি।' : 'Amounts below are COD recorded on orders, not proof of a courier balance. Collection, fees, returns and bank receipts have not been reconciled. Historical remitted statuses are not treated as verified or deducted.'}</p>
      <p>{bn ? 'কুরিয়ার সংযোগ ও নিরাপদ রেমিট্যান্স এন্ট্রি বন্ধ। পুরোনো রেকর্ডে ভুল বা ডুপ্লিকেট থাকতে পারে; সেগুলো দিয়ে পাওনা, ঘাটতি বা প্রাপ্ত টাকা হিসাব করবেন না।' : 'Courier integration and safe remittance entry are unavailable. Legacy records may be incorrect or duplicated; do not use them to calculate balances, shortages or receipts.'}</p>
    </div>
    <section aria-label={bn ? 'কুরিয়ার অনুযায়ী অর্ডার COD' : 'Order COD by courier'} className="space-y-3">
      <h2 className="font-bold text-lg">{bn ? 'কুরিয়ার অনুযায়ী অর্ডারের হিসাব' : 'Orders by courier'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {providers.map(provider => {
          const rows = orders.filter(o => providerKey(o) === provider);
          const summary = summarizeCourierOrders(rows, orders);
          return <button key={provider} type="button" onClick={() => { setSelected(provider); setStage('all'); setSearch(''); }} className={`text-left p-4 border rounded-[var(--radius-md)] bg-surface space-y-2 hover:border-ink ${selected === provider ? 'border-ink' : 'border-border'}`}>
            <span className="font-bold block">{label(provider, bn)}</span>
            <span className="flex justify-between gap-2 text-xs"><span>{bn ? 'ডেলিভারি লেখা COD' : 'Recorded delivered COD'} ({formatLocaleNumber(summary.deliveredCount, locale)})</span><strong>{money(summary.delivered)}</strong></span>
            <span className="flex justify-between gap-2 text-xs"><span>{bn ? 'পাঠানো COD' : 'Recorded in-transit COD'} ({formatLocaleNumber(summary.transitCount, locale)})</span><strong>{money(summary.transit)}</strong></span>
            <span className="block text-xs text-muted">{bn ? 'প্রকৃত পাওনা: অজানা · বিস্তারিত দেখতে চাপুন' : 'Actual balance: unknown · select for details'}</span>
          </button>;
        })}
      </div>
      <p className="text-xs text-muted">{bn ? 'ডেলিভারি লেখা মানে দোকানের নথিভুক্ত স্ট্যাটাস; পাঠানোতে শুধু shipped ও out for delivery। প্যাকড, বাতিল ও রিটার্ন অর্ডার অঙ্কে নেই।' : 'Delivered means the status recorded by the store; in-transit includes only shipped and out for delivery. Packed, cancelled and returned orders are excluded from these totals.'}</p>
    </section>
    <Card surface="bg" padding="md" className="space-y-3">
      <h2 className="font-bold text-base">{bn ? 'অর্ডারভিত্তিক বিস্তারিত' : 'Order details'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-xs">{bn ? 'কুরিয়ার' : 'Courier'}<select aria-label={bn ? 'কুরিয়ার নির্বাচন' : 'Select courier'} value={selected} onChange={e => setSelected(e.target.value)} className="block w-full min-h-[42px] border border-border bg-surface rounded p-2 mt-1"><option value="all">{bn ? 'সব কুরিয়ার' : 'All couriers'}</option>{providers.map(p => <option key={p} value={p}>{label(p, bn)}</option>)}</select></label>
        <label className="text-xs">{bn ? 'অবস্থা' : 'Status'}<select aria-label={bn ? 'অর্ডারের অবস্থা' : 'Order stage'} value={stage} onChange={e => setStage(e.target.value)} className="block w-full min-h-[42px] border border-border bg-surface rounded p-2 mt-1"><option value="all">{bn ? 'সব অর্ডার' : 'All orders'}</option><option value="delivered">{bn ? 'ডেলিভারি লেখা' : 'Recorded delivered'}</option><option value="transit">{bn ? 'পাঠানো' : 'Shipped'}</option><option value="excluded">{bn ? 'অন্যান্য / মোটে নেই' : 'Other / excluded'}</option></select></label>
        <label className="text-xs">{bn ? 'অর্ডার বা ট্র্যাকিং খুঁজুন' : 'Search order or tracking'}<input type="search" aria-label={bn ? 'অর্ডার বা ট্র্যাকিং খুঁজুন' : 'Search order or tracking'} value={search} onChange={e => setSearch(e.target.value)} className="block w-full min-h-[42px] border border-border bg-surface rounded p-2 mt-1" /></label>
      </div>
      <p className="text-xs text-muted">{bn ? `দেখানো হচ্ছে ${formatLocaleNumber(filtered.length, locale)}টি; মোটে অন্তর্ভুক্ত ডেলিভারি ও পাঠানো অর্ডার ${formatLocaleNumber(eligible.length, locale)}টি।` : `Showing ${formatLocaleNumber(filtered.length, locale)}; ${formatLocaleNumber(eligible.length, locale)} delivered and shipped orders in totals.`}</p>
      {filtered.length === 0 ? <p className="text-sm text-muted">{bn ? 'কোনো অর্ডার পাওয়া যায়নি।' : 'No matching orders.'}</p> : <div className="space-y-3">{filtered.map((o, index) => <div key={`${o.id ?? o.orderNo ?? 'missing'}-${index}`} className="border border-border rounded p-3 text-sm space-y-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center"><strong className="font-mono">{o.orderNo || '—'}</strong><span>{label(providerKey(o), bn)}</span><span className="text-muted">{bn ? 'অর্ডার স্ট্যাটাস' : 'Order status'}: {statusLabel(o.status, bn)}</span></div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted">{bn ? 'অর্ডারের তারিখ (ডেলিভারির তারিখ নয়)' : 'Order date (not delivery date)'}</dt><dd>{safeDate(o.createdAt, bn)}</dd></div>
          <div><dt className="text-muted">{bn ? 'ট্র্যাকিং / কনসাইনমেন্ট' : 'Tracking / consignment'}</dt><dd className="break-all">{o.trackingCode || '—'} / {o.consignmentId || '—'}</dd></div>
          <div><dt className="text-muted">{bn ? 'অর্ডার মোট' : 'Order total'}</dt><dd>{money(o.totalPayablePoisha)}</dd></div>
          <div><dt className="text-muted">{bn ? 'নথিভুক্ত অগ্রিম' : 'Recorded advance'}</dt><dd>{money(o.advancePaidPoisha)}</dd></div>
          <div><dt className="text-muted">{bn ? 'সংগ্রহযোগ্য COD (অর্ডারে লেখা)' : 'COD recorded on order'}</dt><dd className="font-bold">{money(o.codCollectablePoisha)}</dd></div>
          <div><dt className="text-muted">{bn ? 'পেমেন্ট স্ট্যাটাস (যাচাই প্রয়োজন)' : 'Payment status (verify)'}</dt><dd>{statusLabel(o.paymentStatus, bn)}</dd></div>
        </dl>
        <p className="text-xs"><span className="text-muted">{bn ? 'পণ্য: ' : 'Items: '}</span>{o.items?.length ? o.items.map(item => `${(bn ? item.productNameBn : item.productNameEn) || item.productNameBn || '—'}${item.variantTitleBn ? ` (${(bn ? item.variantTitleBn : item.variantTitleEn) || item.variantTitleBn})` : ''} × ${typeof item.quantity === 'number' ? formatLocaleNumber(item.quantity, locale) : '—'}`).join(', ') : (bn ? 'বিবরণ পাওয়া যায়নি' : 'Details unavailable')}</p>
        <p className="text-xs text-muted">{courierStage(o.status) === 'excluded' ? (bn ? 'এই অর্ডার উপরের COD অঙ্কে নেই।' : 'This order is excluded from the COD totals.') : (bn ? 'প্রাপ্ত টাকা, প্রকৃত কুরিয়ার ফি ও নেট পাওনা: যাচাই হয়নি।' : 'Received amount, actual courier fee and net balance: not verified.')}</p>
      </div>)}</div>}
    </Card>
    <Card surface="surface" padding="md" className="space-y-3">
      <h2 className="font-bold text-base">{bn ? 'পুরোনো রেমিট্যান্স রেকর্ড — যাচাইবিহীন' : 'Historical remittance records — unverified'}</h2>
      <p className="text-xs text-muted">{bn ? 'প্রতিটি রেকর্ড কুরিয়ার স্টেটমেন্ট ও ব্যাংক জমার সঙ্গে মিলিয়ে দেখুন। পুরোনো সিস্টেম থেকে তৈরি বা ডুপ্লিকেট রেকর্ড থাকতে পারে; এখানে কোনো মোট বা পাওনা বাদ দেওয়া হয়নি। প্রমাণপত্র, অর্থপ্রাপ্তির মাধ্যম ও আসল ট্রানজেকশন আইডি এই রেকর্ডে সংরক্ষিত নেই।' : 'Compare every record with the courier statement and bank receipt. Legacy rows may be generated or duplicated; none are totalled or deducted here. Proof, payment method and actual transaction ID are not stored on these records.'}</p>
      {history.length === 0 ? <p className="text-sm text-muted">{bn ? 'এই ফিল্টারে কোনো পুরোনো রেকর্ড নেই।' : 'No historical records for this filter.'}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs min-w-[720px]"><thead><tr className="border-b border-border"><th className="p-2">{bn ? 'তারিখ / কুরিয়ার' : 'Date / courier'}</th><th className="p-2">{bn ? 'অর্ডার / রেফারেন্স' : 'Order / reference'}</th><th className="p-2">{bn ? 'COD লেখা' : 'Recorded COD'}</th><th className="p-2">{bn ? 'ফি লেখা' : 'Recorded fee'}</th><th className="p-2">{bn ? 'প্রাপ্ত লেখা' : 'Recorded received'}</th></tr></thead><tbody>{history.map((r, i) => <tr key={`${r.id}-${i}`} className="border-b border-border"><td className="p-2">{safeDate(r.createdAt, bn)}<br />{label(r.courierProvider || 'unassigned', bn)}</td><td className="p-2 break-all">{r.orderNo || '—'}<br />{r.settlementRef || '—'}<br />{bn ? 'কনসাইনমেন্ট' : 'Consignment'}: {r.consignmentId || '—'}{(historyCounts.get(normalizeOrder(r.orderNo)) || 0) > 1 && <span className="block text-amber-700">{bn ? 'একই অর্ডারে একাধিক রেকর্ড—যাচাই করুন' : 'Multiple records for this order—verify'}</span>}{(!normalizeOrder(r.orderNo) || !matchedOrders.has(`${normalizeOrder(r.orderNo)}|${r.courierProvider || 'unassigned'}`)) && <span className="block text-amber-700">{bn ? 'অর্ডার বা কুরিয়ার মেলেনি' : 'Order or courier does not match'}</span>}</td><td className="p-2">{money(r.expectedCodPoisha)}</td><td className="p-2">{money(r.courierFeeDeductedPoisha)}</td><td className="p-2">{money(r.remittedAmountPoisha)}</td></tr>)}</tbody></table></div>}
    </Card>
    <details className="border border-border rounded-[var(--radius-md)] p-4 text-sm space-y-3">
      <summary className="font-bold cursor-pointer">{bn ? 'পুরোনো ক্লেইম ও পিকআপ ব্যাচ (যাচাইবিহীন)' : 'Historical claims and pickup batches (unverified)'}</summary>
      <p className="text-xs text-muted">{bn ? 'এগুলো পুরোনো নথি, বাস্তব কুরিয়ার বুকিং, ক্ষতিপূরণ বা হস্তান্তরের প্রমাণ নয়। কোনো অঙ্ক মোট পাওনায় যোগ করা হয়নি।' : 'These are historical records, not proof of booking, compensation or handover. No amounts are added to a balance.'}</p>
      <h3 className="font-semibold">{bn ? 'ক্লেইম' : 'Claims'}</h3>
      {claims.filter(c => selected === 'all' || c.courierProvider === selected).length === 0 ? <p className="text-xs text-muted">{bn ? 'কোনো রেকর্ড নেই।' : 'No records.'}</p> : <ul className="space-y-2">{claims.filter(c => selected === 'all' || c.courierProvider === selected).map((c, i) => <li key={`${c.claimId}-${i}`} className="border border-border p-2 rounded text-xs"><span>{label(c.courierProvider || 'unassigned', bn)} · {c.orderNo || '—'} · {c.claimId || '—'}</span><p>{bn ? 'রেকর্ডকৃত দাবি' : 'Recorded claim'}: {money(c.claimAmountPoisha)} · {c.status} · {safeDate(c.createdAt, bn)}</p><p className="break-words">{c.reasonBn || '—'}</p></li>)}</ul>}
      <h3 className="font-semibold">{bn ? 'পিকআপ ব্যাচ' : 'Pickup batches'}</h3>
      {batches.filter(b => selected === 'all' || b.courierProvider === selected).length === 0 ? <p className="text-xs text-muted">{bn ? 'কোনো রেকর্ড নেই।' : 'No records.'}</p> : <ul className="space-y-2">{batches.filter(b => selected === 'all' || b.courierProvider === selected).map((b, i) => <li key={`${b.batchId}-${i}`} className="border border-border p-2 rounded text-xs"><span>{label(b.courierProvider || 'unassigned', bn)} · {b.batchCode || '—'} · {safeDate(b.createdAt, bn)}</span><p>{bn ? 'রেকর্ডের অবস্থা' : 'Recorded status'}: {b.status} · {bn ? 'অর্ডার' : 'Orders'}: {(b.orderNos || []).join(', ') || '—'}</p></li>)}</ul>}
    </details>
    <Card surface="bg" padding="md" className="space-y-2 text-sm">
      <h2 className="font-bold">{bn ? 'আসল পাওনা নির্ণয়ে যা প্রয়োজন' : 'What is needed to determine the actual balance'}</h2>
      <ol className="list-decimal pl-5 space-y-1 text-muted"><li>{bn ? 'কুরিয়ারের নাম, কনসাইনমেন্ট নম্বর ও যাচাইকৃত ডেলিভারির তারিখ।' : 'Courier, consignment number and verified delivery date.'}</li><li>{bn ? 'কুরিয়ার স্টেটমেন্টে সংগ্রহ করা COD, প্রকৃত ফি, রিটার্ন ও অন্যান্য সমন্বয়।' : 'Collected COD, actual fees, returns and adjustments on the courier statement.'}</li><li>{bn ? 'ব্যাংক/MFS জমার তারিখ, রেফারেন্স, পরিমাণ ও প্রমাণ; একাধিক জমা বা আংশিক পরিশোধ আলাদাভাবে মেলাতে হবে।' : 'Bank/MFS receipt date, reference, amount and evidence; reconcile multiple or partial receipts separately.'}</li><li>{bn ? 'যাচাইয়ের পর: সংগৃহীত COD − যাচাইকৃত ফি ও সমন্বয় − যাচাইকৃত জমা = নিট বকেয়া। বর্তমানে এই সমন্বয় ব্যবস্থা চালু নয়।' : 'After verification: collected COD − verified fees and adjustments − verified receipts = net balance. This reconciliation workflow is not yet available.'}</li></ol>
    </Card>
  </div>;
}
