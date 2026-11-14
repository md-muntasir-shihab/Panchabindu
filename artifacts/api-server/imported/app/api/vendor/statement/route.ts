import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import { isVendorNotFound, requireOwnProfile } from '@/src/lib/vendor/vendor-workspace-service';
import { readPhase4BStore } from '@/src/lib/admin/phase4b-service';

// Spreadsheet formula protection is applied to all text cells, including
// whitespace/control-prefixed formulas; numeric poisha stays numeric.
function textCell(value: string | null): string {
  let text = value ?? '';
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function validDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authenticateVendorRequest(req);
  if (!auth.ok) return Response.json({ success: false }, { status: auth.status });
  const params = new URL(req.url).searchParams;
  const from = params.get('from'), to = params.get('to');
  if (!validDay(from) || !validDay(to) || from > to) return Response.json({ success: false, code: 'INVALID_DATE_RANGE' }, { status: 400 });
  try {
    const profile = requireOwnProfile(auth.actor);
    const start = Date.parse(`${from}T00:00:00.000Z`), end = Date.parse(`${to}T00:00:00.000Z`) + 86400000;
    const store = readPhase4BStore();
    const ownLedger = store.vendorLedger.filter(row => row.vendorId === profile.vendorId);
    const rows = ownLedger.filter(row => Date.parse(row.createdAt) >= start && Date.parse(row.createdAt) < end)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (rows.length > 5000) return Response.json({ success: false, code: 'RANGE_TOO_LARGE' }, { status: 400 });
    if (rows.some(row => !Number.isSafeInteger(row.amountPoisha))) return Response.json({ success: false, code: 'INVALID_LEDGER_DATA' }, { status: 503 });
    if (params.get('format') === 'summary') {
      // Every earlier entry is needed for an opening balance. Never silently
      // ignore malformed history or overflow and present it as reconciled.
      const buckets = ['pending', 'locked', 'available'] as const;
      type Bucket = typeof buckets[number];
      const blank = () => ({ pending: 0n, locked: 0n, available: 0n });
      const opening = blank(), credits = blank(), debits = blank();
      const ids = new Set<string>();
      for (const row of ownLedger) {
        if (!row.id || ids.has(row.id) || !Number.isSafeInteger(row.amountPoisha) || !Number.isFinite(Date.parse(row.createdAt)) || !buckets.includes(row.escrowBucket as Bucket)) {
          return Response.json({ success: false, code: 'INVALID_LEDGER_DATA' }, { status: 503 });
        }
        ids.add(row.id);
        const when = Date.parse(row.createdAt), bucket = row.escrowBucket as Bucket, amount = BigInt(row.amountPoisha);
        if (when < start) opening[bucket] += amount;
        else if (when < end) { if (amount >= 0n) credits[bucket] += amount; else debits[bucket] += amount; }
      }
      const result = buckets.map(bucket => ({ bucket, opening: opening[bucket], credits: credits[bucket], debits: debits[bucket], closing: opening[bucket] + credits[bucket] + debits[bucket] }));
      const max = BigInt(Number.MAX_SAFE_INTEGER);
      if (result.some(r => [r.opening, r.credits, r.debits, r.closing].some(n => n > max || n < -max))) return Response.json({ success: false, code: 'INVALID_LEDGER_DATA' }, { status: 503 });
      const paid = store.payoutRequests.filter(p => p.vendorId === profile.vendorId && p.status === 'paid');
      if (paid.some(p => !p.resolvedAt || !Number.isFinite(Date.parse(p.resolvedAt)) || !Number.isSafeInteger(p.requestedAmountPoisha) || p.requestedAmountPoisha <= 0)) return Response.json({ success: false, code: 'INVALID_PAYOUT_DATA' }, { status: 503 });
      const payments = paid.filter(p => Date.parse(p.resolvedAt!) >= start && Date.parse(p.resolvedAt!) < end);
      if (payments.length > 5000) return Response.json({ success: false, code: 'RANGE_TOO_LARGE' }, { status: 400 });
      const mask = (value: string) => { const account = value.trim(); return account.length <= 4 ? '••••' : '•'.repeat(Math.max(2, account.length - 4)) + account.slice(-4); };
      return Response.json({ success: true, statement: {
        from, to, generatedAt: new Date().toISOString(), ledgerEntryCount: rows.length,
        buckets: result.map(r => ({ bucket: r.bucket, openingPoisha: Number(r.opening), creditsPoisha: Number(r.credits), debitsPoisha: Number(r.debits), closingPoisha: Number(r.closing) })),
        // "paid" means an admin recorded the status; it is not independent proof of transfer.
        payouts: payments.map(p => ({ payoutId: p.payoutId, amountPoisha: p.requestedAmountPoisha, method: p.payoutMethodBn, accountMasked: mask(p.payoutAccountNo), transactionId: p.paymentTrxId, requestedAt: p.requestedAt, recordedPaidAt: p.resolvedAt })).sort((a, b) => a.recordedPaidAt!.localeCompare(b.recordedPaidAt!)),
      } });
    }
    const csv = ['created_at_utc,entry_id,type,bucket,order_no,description_bn,amount_poisha,matures_at_utc', ...rows.map(row => [
      textCell(row.createdAt), textCell(row.id), textCell(row.entryType), textCell(row.escrowBucket),
      textCell(row.orderNo), textCell(row.descriptionBn), String(row.amountPoisha), textCell(row.maturesAt),
    ].join(','))].join('\r\n') + '\r\n';
    return new Response('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="vendor-ledger.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (isVendorNotFound(error)) return Response.json({ success: false }, { status: 404 });
    throw error;
  }
});
