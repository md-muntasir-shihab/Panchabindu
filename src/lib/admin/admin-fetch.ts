// src/lib/admin/admin-fetch.ts
// Safe client-side API request wrapper for Admin ERP panels that wraps native 'fetch'
// internally to inject x-admin-session-token & x-csrf-token headers and handle logging,
// without attempting to override or mutate 'window.fetch' (which has only a getter).

export interface AdminFetchOptions extends RequestInit {
  logRequest?: boolean;
}

/**
 * Custom API request wrapper for Admin ERP dashboard.
 * Wraps 'fetch' internally to inject authentication headers (session token + CSRF token)
 * and handle request/response logging, preventing runtime TypeErrors from window.fetch mutation.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init?: AdminFetchOptions
): Promise<Response> {
  const startTime = Date.now();
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : typeof Request !== 'undefined' && input instanceof Request
      ? input.url
      : String(input);

  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  const headers = new Headers(init?.headers);

  let requestUrl: URL | null = null;
  try {
    if (typeof window !== 'undefined') requestUrl = new URL(urlStr, window.location.href);
  } catch {
    // Let fetch handle invalid URLs without ever attaching credentials.
  }
  if (requestUrl && requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/admin/')) {
    try {
      const storedToken = window.sessionStorage.getItem('bg_admin_session_token');
      const storedCsrf = window.sessionStorage.getItem('bg_admin_csrf_token');

      if (storedToken && !headers.has('x-admin-session-token')) {
        headers.set('x-admin-session-token', storedToken);
      }
      if (storedCsrf && !headers.has('x-csrf-token')) {
        headers.set('x-csrf-token', storedCsrf);
      }
    } catch {
      // Fallback if sessionStorage is restricted in strict sandbox mode
    }
  }

  try {
    let response: Response;
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const reqHeaders = new Headers(input.headers);
      headers.forEach((v, k) => reqHeaders.set(k, v));
      response = await globalThis.fetch(
        new Request(input, { ...init, headers: reqHeaders })
      );
    } else {
      response = await globalThis.fetch(input, { ...init, headers });
    }

    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      const duration = Date.now() - startTime;
      if (!response.ok) {
        console.warn(
          `[Admin API] ${method} ${urlStr} → ${response.status} (${duration}ms)`
        );
      }
    }

    return response;
  } catch (err) {
    if (typeof window !== 'undefined') {
      console.error(`[Admin API Network Error] ${method} ${urlStr}`, err);
    }
    throw err;
  }
}

/**
 * Alias for adminFetch providing a named custom API request wrapper
 */
export const adminApiRequest = adminFetch;
