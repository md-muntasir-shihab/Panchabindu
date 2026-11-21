'use client';

import { localizedFetch } from '@/lib/i18n/localized-fetch';

/**
 * Bounded fetch for write flows (checkout, login, registration).
 *
 * A stalled API must surface as an error the shopper can act on, never as a disabled button
 * and a spinner that never stops. The timeout is deliberately longer than the API's own
 * server-side budget so genuinely slow responses still complete.
 *
 * Requests keep going through `localizedFetch`, which sets Accept-Language and translates the
 * JSON messages the server returns.
 */
export const WRITE_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = WRITE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, timeoutMs);
  const external = init.signal;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) forwardAbort();
    else external.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    return await localizedFetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forwardAbort);
  }
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
