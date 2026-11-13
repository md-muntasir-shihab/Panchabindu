// Type-only ambient declarations for server modules reachable through shared
// type imports (repository/service DTOs). These modules are never bundled for
// the browser: client code only uses `import type` from server files.
declare module '@supabase/supabase-js' {
  export type SupabaseClient<_T = unknown> = any;
  export function createClient<_T = unknown>(...args: any[]): any;
}
declare module '@supabase/ssr' {
  export function createBrowserClient<_T = unknown>(...args: any[]): any;
  export function createServerClient<_T = unknown>(...args: any[]): any;
}
declare module 'sharp';
declare module 'otpauth';
