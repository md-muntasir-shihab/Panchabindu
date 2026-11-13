import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { backupEnvelope, verifyBackup } from './runtime-data.mjs';

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_permissive_storage ON storage.objects TO anon,authenticated USING(TRUE) WITH CHECK(TRUE);
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated;
  `);
  for (const name of fs.readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS [^;]+;/g, '');
    await db.exec(sql);
  }
  return db;
}

function documents() {
  return {
    'erp-store.json': { siteSettings: {}, products: [], categories: [], reviews: [], orders: [], orderLines: [], idempotencyKeys: {} },
    'erp-admin-store.json': { users: [], roles: [], auditLogs: [], orderMeta: {}, blacklistedPhones: {} },
    'erp-security-sessions.json': { customerPrincipals: [], adminSessions: [], customerSessions: [], customerOtpChallenges: {} },
    'erp-phase3-store.json': { warehouses: [], stockMovements: [], stockReservations: [], transitionHistory: [], returnInspections: [], fulfillmentGroupsByOrder: {}, orthogonalOrderStates: {} },
    'erp-phase4b-store.json': { pickupBatches: [], courierRemittanceLedger: [], courierClaims: [], vendors: [], vendorLedger: [], payoutRequests: [], returnResolutions: [], printConfig: {}, districtRateOverrides: {} }, 'erp-phase4c-store.json': { expenses: [], messageTemplates: [], messageLogs: [], automationRules: [], automationLogs: [], sheetsSyncHistory: [], scheduledJobs: [], encryptedCredentialsVault: {}, automationKillSwitchActive: true },
    'erp-phase4-gl-store.json': { periods: [], journals: [], disputeHolds: [], reconciliations: [] },
    'erp-phase5-courier-notif-store.json': { shipmentBookings: [], webhookEvents: [], inAppNotifications: [], notificationLogs: [] }, 'erp-phase6-store.json': { abandonedCarts: [], webhookEvents: [], backupSnapshots: [], reviewModerationStatus: {} }, 'erp-phase7-store.json': { consignmentLots: [], priceProposals: [], flashCampaigns: [], maturityBatches: [] },
  };
}

async function asRole(db, role, sql, parameters = []) {
  await db.exec('BEGIN; SET LOCAL ROLE ' + role);
  try { const result = await db.query(sql, parameters); await db.exec('COMMIT'); return result; }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}

const balanced = { journalNo: 'TEST-JOURNAL', status: 'POSTED', totalDebitPoisha: 100, totalCreditPoisha: 100,
  reversesJournalNo: null, reversedByJournalNo: null,
  lines: [{ debitPoisha: 100, creditPoisha: 0 }, { debitPoisha: 0, creditPoisha: 100 }],
};

test('PostgreSQL transactions, RLS, immutable posting and managed storage', async t => {
  const db = await database();
  try {
    await t.test('all migrations apply and no anonymous runtime access is possible', async () => {
      await asRole(db, 'service_role', 'SELECT erp_initialize_runtime_state($1::jsonb)', [JSON.stringify(documents())]);
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(asRole(db, role, 'SELECT * FROM erp_runtime_state'), /permission denied/);
        await assert.rejects(asRole(db, role, 'SELECT erp_read_runtime_state()'), /permission denied/);
        await assert.rejects(asRole(db, role, 'SELECT erp_commit_runtime_state(1,$1::jsonb)', ['{}']), /permission denied/);
      }
      const result = await asRole(db, 'service_role', 'SELECT erp_read_runtime_state() AS state');
      assert.equal(result.rows[0].state.revision, '1');
      await assert.rejects(asRole(db, 'service_role', 'SELECT erp_initialize_runtime_state($1::jsonb)', [JSON.stringify(documents())]), /duplicate key/);
    });
    await t.test('stale writers cannot overwrite a committed transaction', async () => {
      await asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(1,$1::jsonb)', [JSON.stringify({ 'erp-phase7-store.json': { ...documents()['erp-phase7-store.json'], marker: 'first' } })]);
      await assert.rejects(asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(1,$1::jsonb)', [JSON.stringify({ 'erp-phase7-store.json': { ...documents()['erp-phase7-store.json'], marker: 'lost update' } })]), /WRITE_CONFLICT/);
      const state = (await db.query('SELECT erp_read_runtime_state() AS state')).rows[0].state;
      assert.equal(state.documents['erp-phase7-store.json'].marker, 'first');
    });
    await t.test('failed financial posting rolls back all changed documents', async () => {
      const changes = { 'erp-phase7-store.json': { ...documents()['erp-phase7-store.json'], marker: 'must roll back' }, 'erp-phase4-gl-store.json': { ...documents()['erp-phase4-gl-store.json'], journals: [{ ...balanced, totalDebitPoisha: 200 }] } };
      await assert.rejects(asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(2,$1::jsonb)', [JSON.stringify(changes)]), /UNBALANCED_JOURNAL/);
      const state = (await db.query('SELECT erp_read_runtime_state() AS state')).rows[0].state;
      assert.equal(state.revision, '2'); assert.equal(state.documents['erp-phase7-store.json'].marker, 'first');
      for (const invalidAmount of [null, 0.5, 9007199254740992]) {
        const invalid = { 'erp-phase4-gl-store.json': { ...documents()['erp-phase4-gl-store.json'], journals: [{ ...balanced, totalDebitPoisha: invalidAmount }] } };
        await assert.rejects(asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(2,$1::jsonb)', [JSON.stringify(invalid)]), /INVALID_JOURNAL|INVALID_INTEGER/);
      }
    });
    await t.test('posted journals and audit records cannot be changed or removed', async () => {
      const gl = { ...documents()['erp-phase4-gl-store.json'], journals: [balanced] };
      const admin = { ...documents()['erp-admin-store.json'], auditLogs: [{ id: 'audit-1', action: 'TEST' }] };
      await asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(2,$1::jsonb)', [JSON.stringify({ 'erp-phase4-gl-store.json': gl, 'erp-admin-store.json': admin })]);
      await assert.rejects(asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(3,$1::jsonb)', [JSON.stringify({ 'erp-phase4-gl-store.json': { ...gl, journals: [{ ...balanced, description: 'tampered' }] } })]), /IMMUTABLE/);
      await assert.rejects(asRole(db, 'service_role', 'SELECT erp_commit_runtime_state(3,$1::jsonb)', [JSON.stringify({ 'erp-admin-store.json': { ...admin, auditLogs: [] } })]), /AUDIT_IMMUTABLE/);
    });
    await t.test('customer ownership ignores forged user metadata', async () => {
      const userA = '10000000-0000-4000-8000-000000000001', userB = '10000000-0000-4000-8000-000000000002';
      await db.query('INSERT INTO auth.users VALUES($1),($2)', [userA, userB]);
      await db.query("INSERT INTO customers(phone,name,auth_user_id) VALUES('01711111111','A',$1),('01722222222','B',$2)", [userA, userB]);
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [userA, JSON.stringify({ user_metadata: { phone: '01722222222' } })]);
      const result = await asRole(db, 'authenticated', 'SELECT fn_current_customer_phone() AS phone');
      assert.equal(result.rows[0].phone, '01711111111');
      await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
      assert.equal((await asRole(db, 'authenticated', 'SELECT fn_current_customer_phone() AS phone')).rows[0].phone, null);
    });
    await t.test('relational journal posting balances its lines and rejects late insertion', async () => {
      const entry = '20000000-0000-4000-8000-000000000001';
      const accountA = '30000000-0000-4000-8000-000000000001', accountB = '30000000-0000-4000-8000-000000000002';
      await db.query("INSERT INTO ledger_accounts(id,account_code,name_bn,name_en,account_type,normal_balance) VALUES($1,'TEST-A','ক্যাশ','Cash','ASSET','DEBIT'),($2,'TEST-B','দায়','Liability','LIABILITY','CREDIT')", [accountA, accountB]);
      await db.exec('BEGIN');
      await db.query("INSERT INTO journal_entries(id,entry_no,reference_type,reference_id,description_bn,total_debit_poisha,total_credit_poisha) VALUES($1,'TEST-SQL','test','test','test',100,100)", [entry]);
      await assert.rejects(db.exec('COMMIT'), /UNBALANCED_JOURNAL/);
      await db.exec('ROLLBACK; BEGIN');
      await db.query("INSERT INTO journal_entries(id,entry_no,reference_type,reference_id,description_bn,total_debit_poisha,total_credit_poisha) VALUES($1,'TEST-SQL','test','test','test',100,100)", [entry]);
      await db.query('INSERT INTO journal_lines(journal_entry_id,account_id,debit_poisha,credit_poisha) VALUES($1,$2,100,0),($1,$3,0,100)', [entry, accountA, accountB]);
      await db.exec('COMMIT');
      await assert.rejects(db.query('INSERT INTO journal_lines(journal_entry_id,account_id,debit_poisha,credit_poisha) VALUES($1,$2,1,0)', [entry, accountA]), /IMMUTABLE/);
      await assert.rejects(db.query('UPDATE journal_lines SET debit_poisha=200 WHERE journal_entry_id=$1', [entry]), /append.only|immutable|UPDATE|DELETE/i);
    });
    await t.test('private media remains private even with a pre-existing broad storage policy', async () => {
      await db.exec("INSERT INTO storage.objects(bucket_id,name) VALUES('product-staging','private.webp'),('public-catalog-media','approved.webp')");
      for (const role of ['anon', 'authenticated']) {
        const result = await asRole(db, role, "SELECT name FROM storage.objects WHERE bucket_id='product-staging'");
        assert.equal(result.rows.length, 0);
        await assert.rejects(asRole(db, role, "INSERT INTO storage.objects(bucket_id,name) VALUES('public-catalog-media','unapproved.webp')"), /row.level security/);
      }
    });
    await t.test('a checksummed backup restores into a separate empty PostgreSQL database', async () => {
      const state = (await db.query('SELECT erp_read_runtime_state() AS state')).rows[0].state;
      const backup = backupEnvelope(state.documents, state.revision);
      const restored = await database();
      try {
        await asRole(restored, 'service_role', 'SELECT erp_initialize_runtime_state($1::jsonb)', [JSON.stringify(verifyBackup(backup))]);
        const result = (await restored.query('SELECT erp_read_runtime_state() AS state')).rows[0].state;
        assert.deepEqual(result.documents, state.documents);
        const corrupt = structuredClone(backup);
        corrupt.documents['erp-store.json'].products.push({ corrupted: true });
        assert.throws(() => verifyBackup(corrupt), /CHECKSUM_MISMATCH/);
      } finally { await restored.close(); }
    });
  } finally { await db.close(); }
});
