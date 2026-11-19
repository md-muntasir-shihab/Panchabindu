import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { canAccessAdminWorkspace } from '@/src/types/permissions';
import {
  extractAdminSessionTokenFromRequest,
  verifyAdminSessionToken,
} from '@/src/lib/security/crypto-session';
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from '@/src/lib/supabase/admin';
import { usesPostgresPersistence } from '@/src/lib/db/runtime-persistence';
import { readPhase4CStore } from '@/src/lib/admin/phase4c-service';

export type HealthCheckStatus = 'healthy' | 'warning' | 'degraded' | 'not_configured';

export interface SystemHealthCheckItem {
  key: string;
  labelBn: string;
  labelEn: string;
  category: 'infrastructure' | 'integrations' | 'automation';
  status: HealthCheckStatus;
  detailBn: string;
  detailEn: string;
  latencyMs?: number | null;
  actionHintBn?: string;
  actionHintEn?: string;
}

export interface SystemHealthResponse {
  success: boolean;
  checkedAt: string;
  runtime: {
    nodeEnv: string;
    isVercel: boolean;
    vercelEnv: string | null;
    vercelRegion: string | null;
    persistenceMode: 'postgres_supabase' | 'local_json_dev';
  };
  summary: {
    healthy: number;
    warning: number;
    degraded: number;
    notConfigured: number;
  };
  checks: SystemHealthCheckItem[];
}

function authorizedSuperAdmin(req: ApiRequest) {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(req));
  const actor =
    session && session.purpose !== 'enrollment'
      ? getActorSecurityContext(session.userId)
      : null;
  return session &&
    actor &&
    actor.roleSlug === 'super_admin' &&
    session.roleSlug === actor.roleSlug &&
    canAccessAdminWorkspace(actor)
    ? { actor, session }
    : null;
}

function isNonPlaceholderEnv(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !/your-|placeholder|example\.com/i.test(trimmed);
}

export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authorizedSuperAdmin(req);
  if (!auth) {
    return Response.json(
      {
        success: false,
        code: 'FORBIDDEN',
        errorBn: 'শুধুমাত্র সুপার অ্যাডমিন লাইভ সিস্টেম হেলথ দেখতে পারবেন।',
        errorEn: 'Only super admins can access live system health diagnostics.',
      },
      { status: 403 }
    );
  }

  const checkedAt = new Date().toISOString();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isVercel = Boolean(process.env.VERCEL);
  const vercelEnv = process.env.VERCEL_ENV || null;
  const vercelRegion = process.env.VERCEL_REGION || null;
  const postgresActive = usesPostgresPersistence();
  const supabaseConfigured = isSupabaseAdminConfigured();
  const p4cStore = readPhase4CStore();

  const checks: SystemHealthCheckItem[] = [];

  // 1. Supabase Postgres & Runtime Persistence Check
  if (supabaseConfigured) {
    const start = Date.now();
    try {
      const client = createSupabaseAdminClient();
      const { data, error } = await client.rpc('erp_read_runtime_state');
      const latencyMs = Date.now() - start;
      if (error) {
        checks.push({
          key: 'supabase_db',
          labelBn: 'Supabase ডাটাবেজ (Postgres RPC)',
          labelEn: 'Supabase Database (Postgres RPC)',
          category: 'infrastructure',
          status: 'degraded',
          latencyMs,
          detailBn: `Supabase কনফিগার করা আছে, কিন্তু erp_read_runtime_state RPC ব্যর্থ হয়েছে (${error.message.slice(0, 80)})।`,
          detailEn: `Supabase is configured, but erp_read_runtime_state RPC failed (${error.message.slice(0, 80)}).`,
          actionHintBn: 'Supabase SQL Editor-এ erp_runtime_state মাইগ্রেশন রান করুন।',
          actionHintEn: 'Run the erp_runtime_state SQL migration in Supabase.',
        });
      } else {
        const rev = (data as { revision?: string } | null)?.revision ?? 'ok';
        checks.push({
          key: 'supabase_db',
          labelBn: 'Supabase ডাটাবেজ (Postgres RPC)',
          labelEn: 'Supabase Database (Postgres RPC)',
          category: 'infrastructure',
          status: 'healthy',
          latencyMs,
          detailBn: postgresActive
            ? `লাইভ Postgres পার্সিস্টেন্স সচল (রিভিশন: ${String(rev).slice(0, 12)})।`
            : `Supabase RPC সচল (রিভিশন: ${String(rev).slice(0, 12)}), তবে লোকাল JSON মোডে চলছে।`,
          detailEn: postgresActive
            ? `Live Postgres persistence active (revision: ${String(rev).slice(0, 12)}).`
            : `Supabase RPC reachable (revision: ${String(rev).slice(0, 12)}), currently in local JSON mode.`,
        });
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : 'Network error';
      checks.push({
        key: 'supabase_db',
        labelBn: 'Supabase ডাটাবেজ (Postgres RPC)',
        labelEn: 'Supabase Database (Postgres RPC)',
        category: 'infrastructure',
        status: 'degraded',
        latencyMs,
        detailBn: `Supabase সংযোগ ব্যর্থ: ${msg.slice(0, 90)}`,
        detailEn: `Supabase connection failed: ${msg.slice(0, 90)}`,
        actionHintBn: 'SUPABASE_URL এবং SUPABASE_SERVICE_ROLE_KEY যাচাই করুন।',
        actionHintEn: 'Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      });
    }
  } else {
    checks.push({
      key: 'supabase_db',
      labelBn: 'Supabase ডাটাবেজ (Postgres RPC)',
      labelEn: 'Supabase Database (Postgres RPC)',
      category: 'infrastructure',
      status: postgresActive ? 'degraded' : 'warning',
      latencyMs: null,
      detailBn: postgresActive
        ? 'Postgres মোড চালু কিন্তু SUPABASE_URL বা SUPABASE_SERVICE_ROLE_KEY সেট নেই।'
        : 'ডেভেলপমেন্ট লোকাল JSON পার্সিস্টেন্স (.data/) চলছে; Supabase এখনো কনফিগার করা হয়নি।',
      detailEn: postgresActive
        ? 'Postgres mode is enabled but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.'
        : 'Running on local JSON persistence (.data/); Supabase is not configured yet.',
      actionHintBn: 'প্রোডাকশনের জন্য Vercel Env-এ SUPABASE_URL ও SUPABASE_SERVICE_ROLE_KEY যোগ করুন।',
      actionHintEn: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.',
    });
  }

  // 2. Vercel Deployment & API Gateway
  checks.push({
    key: 'vercel_runtime',
    labelBn: 'Vercel রানটাইম ও API গেটওয়ে',
    labelEn: 'Vercel Runtime & API Gateway',
    category: 'infrastructure',
    status: 'healthy',
    latencyMs: 0,
    detailBn: isVercel
      ? `Vercel (${vercelEnv || 'production'}${vercelRegion ? ` · ${vercelRegion}` : ''}) গেটওয়ে সচল।`
      : `লোকাল Express API সার্ভার (${nodeEnv}) সচল; vercel.json রিরাইট প্রস্তুত।`,
    detailEn: isVercel
      ? `Vercel (${vercelEnv || 'production'}${vercelRegion ? ` · ${vercelRegion}` : ''}) gateway active.`
      : `Local Express API server (${nodeEnv}) active; vercel.json rewrites configured.`,
  });

  // 3. Media Storage (Supabase Storage vs Local)
  const publicBucket = process.env.SUPABASE_MEDIA_BUCKET || 'product-media';
  const privateBucket = process.env.SUPABASE_PRIVATE_BUCKET || 'vendor-private';
  checks.push({
    key: 'media_storage',
    labelBn: 'মিডিয়া ও KYC প্রাইভেট স্টোরেজ',
    labelEn: 'Media & KYC Private Storage',
    category: 'infrastructure',
    status: supabaseConfigured ? 'healthy' : 'warning',
    detailBn: supabaseConfigured
      ? `Supabase Storage প্রস্তুত (পাবলিক: ${publicBucket}, প্রাইভেট KYC: ${privateBucket})।`
      : 'Supabase সংযুক্ত নয় — ডেভেলপমেন্টে লোকাল ফাইল স্টোরেজ ব্যবহৃত হচ্ছে।',
    detailEn: supabaseConfigured
      ? `Supabase Storage ready (public: ${publicBucket}, private KYC: ${privateBucket}).`
      : 'Supabase not connected — using local development file storage.',
    actionHintBn: supabaseConfigured
      ? undefined
      : 'প্রাইভেট KYC নথির জন্য Supabase Storage বাকেট কনফিগার করুন।',
    actionHintEn: supabaseConfigured
      ? undefined
      : 'Configure Supabase Storage buckets for durable media and private KYC documents.',
  });

  // 4. Google Sheets One-Way Mirror Webhook
  const sheetsUrl =
    process.env.GOOGLE_SHEETS_APPS_SCRIPT_URL ||
    process.env.GOOGLE_SHEETS_WEBHOOK_URL ||
    '';
  const sheetsVaultSaved = Boolean(
    p4cStore.encryptedCredentialsVault['GOOGLE_SHEETS_WEBHOOK_URL']
  );
  const sheetsEnvReady = isNonPlaceholderEnv(sheetsUrl);
  const sheetsSecretReady = isNonPlaceholderEnv(
    process.env.GOOGLE_SHEETS_SHARED_SECRET
  );
  checks.push({
    key: 'google_sheets_sync',
    labelBn: 'Google Sheets ওয়ান-ওয়ে মিরর',
    labelEn: 'Google Sheets One-Way Mirror',
    category: 'integrations',
    status: sheetsEnvReady ? (sheetsSecretReady ? 'healthy' : 'warning') : 'not_configured',
    detailBn: sheetsEnvReady
      ? sheetsSecretReady
        ? 'Apps Script Web App URL ও Shared Secret সার্ভার Env-এ সেট করা আছে।'
        : 'Apps Script Web App URL সেট করা আছে, তবে GOOGLE_SHEETS_SHARED_SECRET ফাঁকা।'
      : sheetsVaultSaved
        ? 'ভল্টে মাস্কড প্রিভিউ আছে, কিন্তু লাইভ পুশের জন্য সার্ভার Env (GOOGLE_SHEETS_APPS_SCRIPT_URL) প্রয়োজন।'
        : 'GOOGLE_SHEETS_APPS_SCRIPT_URL সেট করা নেই। ডাউনলোডযোগ্য ৮-ট্যাব মিরর ফাইল ব্যবহার করতে পারবেন।',
    detailEn: sheetsEnvReady
      ? sheetsSecretReady
        ? 'Apps Script Web App URL and Shared Secret are configured in server env.'
        : 'Apps Script Web App URL is set, but GOOGLE_SHEETS_SHARED_SECRET is not set.'
      : sheetsVaultSaved
        ? 'Masked preview exists in vault, but live HTTP push requires GOOGLE_SHEETS_APPS_SCRIPT_URL in server env.'
        : 'GOOGLE_SHEETS_APPS_SCRIPT_URL is not configured. Downloadable 8-tab mirror export is available.',
    actionHintBn: sheetsEnvReady
      ? undefined
      : 'Vercel Env-এ GOOGLE_SHEETS_APPS_SCRIPT_URL ও GOOGLE_SHEETS_SHARED_SECRET যোগ করুন।',
    actionHintEn: sheetsEnvReady
      ? undefined
      : 'Add GOOGLE_SHEETS_APPS_SCRIPT_URL and GOOGLE_SHEETS_SHARED_SECRET to server env.',
  });

  // 5. Courier Providers Readiness
  const steadfastReady =
    isNonPlaceholderEnv(process.env.STEADFAST_API_KEY) ||
    Boolean(p4cStore.encryptedCredentialsVault['STEADFAST_API_KEY']);
  const pathaoReady =
    isNonPlaceholderEnv(process.env.PATHAO_CLIENT_ID) ||
    Boolean(p4cStore.encryptedCredentialsVault['PATHAO_CLIENT_ID']);
  const redxReady =
    isNonPlaceholderEnv(process.env.REDX_ACCESS_TOKEN) ||
    Boolean(p4cStore.encryptedCredentialsVault['REDX_ACCESS_TOKEN']);
  const activeCouriers = [
    steadfastReady ? 'Steadfast' : null,
    pathaoReady ? 'Pathao' : null,
    redxReady ? 'RedX' : null,
  ].filter(Boolean) as string[];

  checks.push({
    key: 'courier_apis',
    labelBn: 'কুরিয়ার API ইন্টিগ্রেশন (Steadfast / Pathao / RedX)',
    labelEn: 'Courier API Integrations (Steadfast / Pathao / RedX)',
    category: 'integrations',
    status: activeCouriers.length > 0 ? 'healthy' : 'not_configured',
    detailBn:
      activeCouriers.length > 0
        ? `সক্রিয় কুরিয়ার কী: ${activeCouriers.join(', ')}।`
        : 'কোনো লাইভ কুরিয়ার API কী সেট নেই — ম্যানুয়াল পার্সেল ও CSV ডিসপ্যাচ মোড সচল।',
    detailEn:
      activeCouriers.length > 0
        ? `Configured courier keys: ${activeCouriers.join(', ')}.`
        : 'No live courier API keys configured — Manual parcel & CSV dispatch mode active.',
    actionHintBn:
      activeCouriers.length > 0
        ? undefined
        : 'Control Center বা Vercel Env-এ Steadfast / Pathao / RedX কী যোগ করুন।',
    actionHintEn:
      activeCouriers.length > 0
        ? undefined
        : 'Add Steadfast, Pathao, or RedX credentials in server env.',
  });

  // 6. Messaging Gateways (Resend / SMS)
  const resendReady =
    isNonPlaceholderEnv(process.env.RESEND_API_KEY) ||
    Boolean(p4cStore.encryptedCredentialsVault['RESEND_API_KEY']);
  const smsReady =
    isNonPlaceholderEnv(process.env.HTTP_SMS_GATEWAY_URL) ||
    isNonPlaceholderEnv(process.env.TEXTBEE_API_KEY) ||
    Boolean(p4cStore.encryptedCredentialsVault['HTTP_SMS_GATEWAY_URL']);
  const activeMsg = [
    resendReady ? 'Resend Email' : null,
    smsReady ? 'HTTP SMS' : null,
  ].filter(Boolean) as string[];

  checks.push({
    key: 'messaging_gateways',
    labelBn: 'মেসেজিং গেটওয়ে (Email / SMS / Free Deep-Link)',
    labelEn: 'Messaging Gateways (Email / SMS / Free Deep-Link)',
    category: 'integrations',
    status: activeMsg.length > 0 ? 'healthy' : 'warning',
    detailBn:
      activeMsg.length > 0
        ? `ফ্রি wa.me/sms: ডিপ-লিংক + ${activeMsg.join(', ')} কনফিগার করা আছে।`
        : 'ফ্রি wa.me ও sms: ডিপ-লিংক সচল। পেইড/অটোমেটেড ইমেইল বা SMS গেটওয়ে এখনো যুক্ত নয়।',
    detailEn:
      activeMsg.length > 0
        ? `Free wa.me/sms: deep-links + ${activeMsg.join(', ')} configured.`
        : 'Free wa.me & sms: deep-links active. Automated email/SMS gateways not configured yet.',
  });

  // 7. Vercel Cron & Security Secrets
  const cronSecretReady = isNonPlaceholderEnv(process.env.CRON_SECRET);
  const encKeyReady = isNonPlaceholderEnv(process.env.CREDENTIALS_ENCRYPTION_KEY);
  checks.push({
    key: 'cron_security',
    labelBn: 'Vercel Cron ও সিকিউরিটি সিক্রেটস',
    labelEn: 'Vercel Cron & Security Secrets',
    category: 'automation',
    status: cronSecretReady && encKeyReady ? 'healthy' : 'warning',
    detailBn: `CRON_SECRET: ${cronSecretReady ? 'সেট আছে' : 'সেট নেই'} · CREDENTIALS_ENCRYPTION_KEY: ${encKeyReady ? 'সেট আছে' : 'সেট নেই'}।`,
    detailEn: `CRON_SECRET: ${cronSecretReady ? 'set' : 'missing'} · CREDENTIALS_ENCRYPTION_KEY: ${encKeyReady ? 'set' : 'missing'}.`,
    actionHintBn:
      cronSecretReady && encKeyReady
        ? undefined
        : 'Vercel Cron (/api/courier-status-cron) এবং ক্রেডেনশিয়াল এনক্রিপশনের জন্য Env ভ্যারিয়েবল সেট করুন।',
    actionHintEn:
      cronSecretReady && encKeyReady
        ? undefined
        : 'Configure CRON_SECRET and CREDENTIALS_ENCRYPTION_KEY in Vercel environment variables.',
  });

  const summary = {
    healthy: checks.filter((c) => c.status === 'healthy').length,
    warning: checks.filter((c) => c.status === 'warning').length,
    degraded: checks.filter((c) => c.status === 'degraded').length,
    notConfigured: checks.filter((c) => c.status === 'not_configured').length,
  };

  const payload: SystemHealthResponse = {
    success: true,
    checkedAt,
    runtime: {
      nodeEnv,
      isVercel,
      vercelEnv,
      vercelRegion,
      persistenceMode: postgresActive ? 'postgres_supabase' : 'local_json_dev',
    },
    summary,
    checks,
  };

  return Response.json(payload, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
});
