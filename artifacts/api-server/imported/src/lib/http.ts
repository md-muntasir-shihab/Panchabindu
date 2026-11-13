/** Web-standard HTTP boundary for the Express-hosted application handlers. */
export class ApiRequest extends Request {
  get cookies() {
    return {
      get: (name: string) => {
        for (const part of (this.headers.get('cookie') || '').split(';')) {
          const index = part.indexOf('=');
          if (part.slice(0, index).trim() === name) {
            const raw = part.slice(index + 1);
            try { return { name, value: decodeURIComponent(raw) }; }
            catch { return { name, value: raw }; }
          }
        }
        return undefined;
      },
    };
  }
}

type CookieOptions = {
  httpOnly?: boolean; secure?: boolean; path?: string; maxAge?: number;
  sameSite?: 'strict' | 'lax' | 'none'; expires?: Date; domain?: string;
};

export class ApiResponse extends Response {
  static json(body: unknown, init?: ResponseInit): ApiResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new ApiResponse(JSON.stringify(body), { ...init, headers });
  }

  get cookies() {
    const set = (name: string, value: string, options: CookieOptions = {}) => {
      const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`];
      if (options.httpOnly) parts.push('HttpOnly');
      if (options.secure) parts.push('Secure');
      if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
      if (options.domain) parts.push(`Domain=${options.domain}`);
      if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
      if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
      this.headers.append('set-cookie', parts.join('; '));
    };
    return {
      set,
      delete: (name: string) => set(name, '', { maxAge: 0, expires: new Date(0) }),
    };
  }
}
