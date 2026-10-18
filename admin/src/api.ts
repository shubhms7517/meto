// Admin API: token login ke baad localStorage me (12 ghante / 1 ghanta bina kaam = expire)
const KEY = 'meto_admin_token';

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

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    if (res.status === 401 && e.code !== 'bad_login' && e.code !== 'bad_password') {
      setToken(null);
      onSignedOut?.();
    }
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Something went wrong');
  }
  return data as T;
}

// CSV jaise download (token header ke saath)
export async function download(path: string, filename: string) {
  const res = await fetch(`/api/admin${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, 'error', 'Download failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
