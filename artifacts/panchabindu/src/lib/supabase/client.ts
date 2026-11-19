// src/lib/supabase/client.ts
// Browser Supabase Client (Read-Only Public Views & Auth Session Only)
// Rule A2 & Negative Rule #7: Frontend MUST NEVER perform direct DB writes
// on orders, ledgers, or reviews. All writes go through validated Server Actions / API Routes.

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '../../types/database.types';

function readPublicEnv(viteKey: string, nextKey: string): string | undefined {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (metaEnv) {
    if (metaEnv[viteKey]) return metaEnv[viteKey];
    if (metaEnv[nextKey]) return metaEnv[nextKey];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[viteKey] || process.env[nextKey];
  }
  return undefined;
}

export function isSupabaseConfigured(): boolean {
  const url = readPublicEnv('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = readPublicEnv('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return Boolean(
    url &&
      anonKey &&
      !url.includes('your-project-ref') &&
      !anonKey.includes('your-supabase-anon')
  );
}

export function createSupabaseBrowserClient() {
  const url =
    readPublicEnv('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL') ||
    'https://placeholder.supabase.co';
  const anonKey =
    readPublicEnv('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    'placeholder-anon-key';

  return createBrowserClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
