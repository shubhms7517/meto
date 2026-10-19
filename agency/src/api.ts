// Agency portal API — token login ke baad localStorage me (admin se alag key)
const KEY = 'meto_agency_token';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onSignedOut: (() => void) | null = null;
export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

export const getToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/agency${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    if (res.status === 401 && e.code !== 'bad_login') {
      setToken(null);
      onSignedOut?.();
    }
    if (res.status === 403 && (e.code === 'session_expired' || e.code === 'no_auth')) {
      setToken(null);
      onSignedOut?.();
    }
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Something went wrong');
  }
  return data as T;
}
