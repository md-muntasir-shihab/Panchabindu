// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';

if (typeof window !== 'undefined') {
  throw new Error(
    'SECURITY_VIOLATION: src/lib/supabase/admin.ts is a server-only module and must never be imported in browser code.'
  );
}

export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
      serviceKey &&
      !url.includes('your-project-ref') &&
      !serviceKey.includes('your-supabase-service-role')
  );
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_ADMIN_NOT_CONFIGURED: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on server.'
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type PersistenceRuntimeMode =
  | 'local_json_dev_fallback'
  | 'blocked_production_json';

export function getPersistenceRuntimeMode(options?: {
  nodeEnv?: string;
  strictProduction?: boolean;
  supabaseConfigured?: boolean;
}): PersistenceRuntimeMode {
  if (options?.nodeEnv !== undefined || options?.strictProduction !== undefined) {
    const targetEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? 'development';
    return targetEnv === 'production' ? 'blocked_production_json' : 'local_json_dev_fallback';
  }

  if (
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.ALLOW_DEMO_JSON_PERSISTENCE === 'true'
  ) {
    return 'local_json_dev_fallback';
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return nodeEnv === 'production' ? 'blocked_production_json' : 'local_json_dev_fallback';
}

export function assertProductionPersistenceAllowed(options?: {
  nodeEnv?: string;
  strictProduction?: boolean;
  supabaseConfigured?: boolean;
}): void {
  const mode = getPersistenceRuntimeMode(options);
  if (mode === 'blocked_production_json') {
    throw new Error(
      'PRODUCTION_PERSISTENCE_GUARD: JSON-backed business persistence is not supported in production, even when Supabase credentials are configured. Complete and test the PostgreSQL repository cutover first.'
    );
  }
}