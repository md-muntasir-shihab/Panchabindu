#!/usr/bin/env node
// Demo data seeder for the Panchabindu admin ERP.
//
// Creates a spread of orders and walks each one through the real domain actions
// (smart order entry -> state machine -> manual bKash review) so the dashboard,
// the orders grid and the money counters all show believable live data instead
// of hand-edited JSON.
//
// Usage (preview, auth bypass enabled):
//   node scripts/src/demo-orders.mjs
//   pnpm run demo:orders --per-bucket=10
//
// Against a real deployment you must supply an admin session cookie:
//   node scripts/src/demo-orders.mjs --base=https://your-app --cookie="bg_admin_session=..."
//
// Options:
//   --base=<url>        Target origin (default http://127.0.0.1:5173)
//   --per-bucket=<n>    Orders per status bucket (default 10 -> 50 total)
//   --prefix=<text>     Staff-note tag written on every demo order (default DEMO)
//   --topup             Receive QC stock when a variant is short for the run
//   --dry-run           Print the plan and stock math, create nothing

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const [key, ...rest] = raw.replace(/^--/, '').split('=');
  args.set(key, rest.length ? rest.join('=') : true);
}

const BASE = String(args.get('base') ?? process.env.DEMO_BASE ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const PER_BUCKET = Number(args.get('per-bucket') ?? 10);
const TAG = String(args.get('prefix') ?? 'DEMO');
const DRY_RUN = args.get('dry-run') === true;
const TOPUP = args.get('topup') === true;
const COOKIE = typeof args.get('cookie') === 'string' ? String(args.get('cookie')) : '';

if (!Number.isInteger(PER_BUCKET) || PER_BUCKET < 1 || PER_BUCKET > 200) {
  console.error('--per-bucket must be an integer between 1 and 200');
  process.exit(1);
}

// District / upazila pairs taken from src/lib/geo/bd-geocode.ts (Dhaka uses the
// metropolitan Dhanmondi thana, the rest are upazila seeds of their district).
const LOCATIONS = [
  { districtId: 47, upazilaId: 5064, areaBn: 'ধানমন্ডি', streetBn: 'বাড়ি ১২, রোড ৫, ধানমন্ডি' },
  { districtId: 47, upazilaId: 365, areaBn: 'সাভার', streetBn: 'প্লট ২৩, সাভার বাজার রোড' },
  { districtId: 1, upazilaId: 1, areaBn: 'দেবিদ্বার', streetBn: 'গ্রাম: দেবিদ্বার, বাজার সংলগ্ন' },
  { districtId: 4, upazilaId: 33, areaBn: 'রাঙ্গামাটি সদর', streetBn: 'রাঙ্গামাটি সদর, নতুন বাজার' },
  { districtId: 9, upazilaId: 80, areaBn: 'কক্সবাজার সদর', streetBn: 'কলাতলী রোড, হোটেল পাড়া' },
  { districtId: 15, upazilaId: 134, areaBn: 'পবা', streetBn: 'পবা, কাঁচাবাজার মোড়' },
  { districtId: 20, upazilaId: 171, areaBn: 'মণিরামপুর', streetBn: 'মণিরামপুর নতুন বাজার' },
  { districtId: 30, upazilaId: 230, areaBn: 'ঝালকাঠি সদর', streetBn: 'ঝালকাঠি সদর, স্টেশন রোড' },
  { districtId: 36, upazilaId: 272, areaBn: 'বালাগঞ্জ', streetBn: 'বালাগঞ্জ বাজার, মসজিদ রোড' },
  { districtId: 64, upazilaId: 482, areaBn: 'বারহাট্টা', streetBn: 'বারহাট্টা, স্কুল রোড' },
];

const NAMES_BN = [
  'আরিফুল ইসলাম', 'নুসরাত জাহান', 'তানভীর হাসান', 'সাদিয়া আফরিন', 'রাকিব হোসেন',
  'ফারহানা ইয়াসমিন', 'মেহেদী হাসান', 'সুমাইয়া আক্তার', 'জাহিদুল ইসলাম', 'তাসনিম রহমান',
  'শাহরিয়ার কবির', 'মেহজাবিন চৌধুরী', 'আসিফ মাহমুদ', 'রুবিনা পারভীন', 'ইমরান খান',
  'সাবরিনা সুলতানা', 'নাফিস ইকবাল', 'লামিয়া ইসলাম', 'তৌহিদুল আলম', 'জান্নাতুল ফেরদৌস',
  'অনিক সরকার', 'প্রিয়াঙ্কা দাস', 'শাকিব আল হাসান', 'মাহমুদা খাতুন', 'রেজাউল করিম',
  'সিনথিয়া আক্তার', 'হাসিবুল হাসান', 'আফসানা মিমি', 'তুহিন আহমেদ', 'মৌসুমী আক্তার',
  'শাহাদাত হোসেন', 'নাজমুল হুদা', 'সাথী রানী', 'রফিকুল ইসলাম', 'দীপা মনি',
  'আশরাফুল আলম', 'মারিয়া ইসলাম', 'সাইফুল ইসলাম', 'রুমানা বেগম', 'আব্দুল্লাহ আল মামুন',
  'তাহমিনা আক্তার', 'সোহেল রানা', 'ফাহিম ফয়সাল', 'নিশাত তাসনিম', 'গোলাম মোস্তফা',
  'শারমিন সুলতানা', 'মিজানুর রহমান', 'আনিকা তাবাসসুম', 'সজীব সরকার', 'লুবনা ইয়াসমিন',
];

const SOURCES = ['facebook', 'whatsapp', 'phone_call', 'instagram', 'storefront'];

// Each bucket is a full plan of real admin actions. High-risk orders refuse
// `packed` until an advance is verified, so the fulfilment buckets settle a
// bKash advance first — exactly like the shop does on a real day.
const BUCKETS = [
  {
    key: 'confirmed',
    labelBn: 'কনফার্মড',
    payment: 'cod',
    planFor: () => ['confirm', 'callLog'],
  },
  {
    key: 'bkash_verified',
    labelBn: 'বিকাশ ভেরিফাইড',
    payment: 'bkash',
    planFor: () => ['verifyBkash', 'confirm'],
  },
  {
    key: 'packed',
    labelBn: 'প্যাকড',
    payment: 'bkash',
    planFor: () => ['verifyBkash', 'confirm', 'pack'],
  },
  {
    key: 'delivered',
    labelBn: 'ডেলিভারড',
    payment: 'bkash',
    planFor: () => ['verifyBkash', 'confirm', 'pack', 'ship', 'outForDelivery', 'deliver'],
  },
  {
    key: 'cancelled',
    labelBn: 'ক্যান্সেলড',
    payment: 'cod',
    // Half are abandoned before confirmation, half after the confirmation call.
    planFor: (i) => (i % 2 === 0 ? ['cancel'] : ['confirm', 'cancel']),
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, init = {}) {
  const headers = { origin: BASE, ...(init.headers ?? {}) };
  if (COOKIE) headers.cookie = COOKIE;
  const res = await fetch(BASE + pathname, { ...init, headers });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { raw: text.slice(0, 300) } };
  }
}

async function workspace() {
  const { status, json } = await api('/api/admin/workspace');
  if (status !== 200 || !json.authorized) {
    throw new Error(
      `workspace not authorized (${status}${json?.errorBn ? `: ${json.errorBn}` : ''}). ` +
        'Run against the disposable preview or pass --cookie for a real deployment.'
    );
  }
  return json;
}

async function adminOp(payload) {
  return api('/api/admin/workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function variantPool(snapshot) {
  const pool = [];
  for (const product of snapshot.products ?? []) {
    for (const variant of product.variants ?? []) {
      if ((variant.stockAvailable ?? 0) < 2) continue;
      pool.push({
        productId: product.productId,
        variantId: variant.variantId,
        labelBn: `${product.nameBn ?? product.nameEn} — ${variant.titleBn ?? variant.publicSku}`,
        available: variant.stockAvailable ?? 0,
      });
    }
  }
  return pool;
}

function buildPlan(snapshot) {
  const pool = variantPool(snapshot);
  if (pool.length === 0) throw new Error('no in-stock variants found in this workspace');

  // Round-robin the variants so no single SKU is drained, one unit per order.
  let cursor = 0;
  const orders = [];
  let seq = 0;
  for (const bucket of BUCKETS) {
    for (let i = 0; i < PER_BUCKET; i += 1) {
      seq += 1;
      const variant = pool[cursor % pool.length];
      cursor += 1;
      const location = LOCATIONS[(seq - 1) % LOCATIONS.length];
      const name = NAMES_BN[(seq - 1) % NAMES_BN.length];
      const paymentMethod = bucket.payment === 'bkash' ? 'bkash_manual' : 'cod';
      orders.push({
        seq,
        bucket: bucket.key,
        labelBn: bucket.labelBn,
        plan: bucket.planFor(i),
        payload: {
          idempotencyKey: `demo-${TAG}-${Date.now()}-${seq}`,
          customerName: name,
          customerPhone: `017${String(90_000_000 + seq).slice(0, 8)}`,
          districtId: location.districtId,
          upazilaId: location.upazilaId,
          streetAddress: location.streetBn,
          landmark: i % 3 === 0 ? 'মসজিদের পাশে' : '',
          postCode: '',
          source: SOURCES[(seq - 1) % SOURCES.length],
          deliveryMethod: 'courier',
          paymentMethod,
          manualPaymentTrxId:
            paymentMethod === 'bkash_manual' ? `BKDEMO${String(seq).padStart(4, '0')}` : undefined,
          manualPaymentSenderPhone:
            paymentMethod === 'bkash_manual' ? `017${String(90_000_000 + seq).slice(0, 8)}` : undefined,
          advancePaidPoisha: paymentMethod === 'bkash_manual' ? 15000 : 0,
          customerNote: `${TAG} ডেমো অর্ডার — পরীক্ষামূলক`,
          internalStaffNote: `${TAG} ডেমো ডেটা (${new Date().toISOString().slice(0, 10)})`,
          items: [{ productId: variant.productId, variantId: variant.variantId, quantity: 1 }],
        },
        variantLabelBn: variant.labelBn,
      });
    }
  }
  return orders;
}

async function runPlanStep(step, orderNo, seq) {
  if (step === 'callLog') {
    return adminOp({
      operation: 'order_grid_action',
      actionType: 'log_call_status',
      orderNos: [orderNo],
      callStatus: 'confirmed_yes',
      callStatusNote: 'ডেমো: ফোনে অর্ডার নিশ্চিত করেছেন',
    });
  }
  const statusByStep = {
    confirm: 'confirmed',
    pack: 'packed',
    outForDelivery: 'out_for_delivery',
    deliver: 'delivered',
    cancel: 'cancelled',
  };
  if (statusByStep[step]) {
    return adminOp({
      operation: 'order_grid_action',
      actionType: 'update_status',
      orderNos: [orderNo],
      newStatus: statusByStep[step],
      staffNote: `${TAG} ডেমো`,
    });
  }
  if (step === 'ship') {
    return adminOp({
      operation: 'order_grid_action',
      actionType: 'attach_tracking',
      orderNos: [orderNo],
      courierProvider: 'steadfast',
      trackingCode: `SFDEMO${String(seq).padStart(5, '0')}`,
      advanceToStatus: 'shipped',
    });
  }
  if (step === 'verifyBkash') {
    return adminOp({
      operation: 'review_manual_bkash',
      orderNo,
      trxId: `BKDEMO${String(seq).padStart(4, '0')}`,
      decision: 'approved',
      reviewNoteBn: `${TAG}: বিকাশ স্টেটমেন্টে লেনদেন মিলেছে`,
      selfApprovalOverrideReasonBn: 'ডেমো ডেটা সিডিং (একক অপারেটর)',
    });
  }
  throw new Error(`unknown plan step ${step}`);
}

async function main() {
  const snapshot = await workspace();
  const orders = buildPlan(snapshot);
  const needByVariant = new Map();
  for (const order of orders) {
    const { variantId, quantity } = order.payload.items[0];
    needByVariant.set(variantId, (needByVariant.get(variantId) ?? 0) + quantity);
  }
  const short = [];
  for (const product of snapshot.products ?? []) {
    for (const variant of product.variants ?? []) {
      const need = needByVariant.get(variant.variantId) ?? 0;
      if (need > (variant.stockAvailable ?? 0)) {
        short.push({
          variantId: variant.variantId,
          sku: variant.publicSku,
          available: variant.stockAvailable ?? 0,
          need,
        });
      }
    }
  }

  console.log(
    `plan: ${orders.length} orders (${PER_BUCKET} × ${BUCKETS.length} buckets) against ${BASE}`
  );
  for (const bucket of BUCKETS) {
    console.log(`  • ${bucket.labelBn}: ${PER_BUCKET} → ${bucket.planFor(0).join(' → ')}`);
  }
  if (short.length) {
    console.log('stock shortfall:');
    for (const row of short) {
      console.log(`  ! ${row.sku}: available ${row.available}, need ${row.need}`);
    }
  }
  if (DRY_RUN) {
    for (const order of orders.slice(0, 3)) {
      console.log('sample:', JSON.stringify(order.payload).slice(0, 240));
    }
    return;
  }
  if (short.length) {
    if (!TOPUP) {
      throw new Error('not enough stock for this run — rerun with --topup to receive QC stock');
    }
    for (const row of short) {
      const deficit = row.need - row.available;
      const res = await adminOp({
        operation: 'receive_qc_stock',
        variantId: row.variantId,
        receivedQty: deficit + 5,
        qcProofUrl: 'https://example.com/demo-qc-photo.jpg',
        noteBn: 'ডেমো ডেটার জন্য স্টক রিসিভ',
      });
      console.log(`topup ${row.sku}: +${deficit + 5} → ${res.status}`);
    }
  }

  const created = [];
  for (const order of orders) {
    const res = await adminOp({ operation: 'create_smart_order', orderInput: order.payload });
    const orderNo = res.json?.orderNo ?? res.json?.order?.orderNo;
    if (!res.json?.success || !orderNo) {
      console.error(`  ✗ #${order.seq} ${order.labelBn}: ${res.json?.errorBn ?? res.status}`);
      continue;
    }
    created.push({ ...order, orderNo });
    process.stdout.write(`\rcreated ${created.length}/${orders.length} …`);
  }
  process.stdout.write('\n');

  const failures = [];
  for (const order of created) {
    for (const step of order.plan) {
      const res = await runPlanStep(step, order.orderNo, order.seq);
      const row = res.json?.results?.[0];
      const ok = res.json?.success === true && (row ? row.ok !== false : true);
      if (!ok) {
        failures.push({
          orderNo: order.orderNo,
          step,
          messageBn: row?.messageBn ?? res.json?.errorBn ?? `HTTP ${res.status}`,
        });
      }
      await sleep(60);
    }
    process.stdout.write(`\rprogressed ${created.indexOf(order) + 1}/${created.length} …`);
  }
  process.stdout.write('\n');

  const after = await workspace();
  const counts = (after.orders ?? []).reduce((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});
  const verified = (after.manualPaymentSubmissions ?? []).filter(
    (sub) => sub.status === 'approved' && String(sub.trxId).startsWith('BKDEMO')
  ).length;

  console.log('\norders by status:', JSON.stringify(counts, null, 0));
  console.log(`demo bKash claims approved: ${verified}`);
  if (failures.length) {
    console.log(`\n${failures.length} step(s) refused:`);
    for (const failure of failures.slice(0, 15)) {
      console.log(`  ✗ ${failure.orderNo} ${failure.step}: ${failure.messageBn}`);
    }
    if (failures.length > 15) console.log(`  … ${failures.length - 15} more`);
  }
}

main().catch((error) => {
  console.error('\ndemo seed failed:', error.message);
  process.exit(1);
});
