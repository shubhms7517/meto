import { TurboModuleRegistry, type TurboModule } from 'react-native';
import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { markOffline, markOnline, setNetBase } from '../lib/netStatus';

// Development: backend usi PC pe hai jahan se app ka code (Metro) aaya.
// USB pe Metro = localhost (adb reverse), WiFi pe Metro = PC ka IP → backend bhi wahi IP.
// Isse USB toote to bhi app WiFi se chalti rehti hai.
// TODO (launch): production me asli server ka https URL
const PORT = 4000;
const FALLBACK_HOST = '192.168.1.13'; // PC ka WiFi IP (release/bina-Metro build ke liye)

function devHost(): string {
  try {
    // App ka code kahan se aaya, jaise "http://192.168.1.11:8081/index.bundle?..."
    const mod = TurboModuleRegistry.get<{ getConstants(): { scriptURL?: string } } & TurboModule>('SourceCode');
    const m = /^https?:\/\/([^/:]+)/.exec(mod?.getConstants().scriptURL ?? '');
    if (m) return m[1];
  } catch {
    // ignore
  }
  return FALLBACK_HOST;
}

export const API_URL = `http://${devHost()}:${PORT}`;
setNetBase(API_URL);

// Server photos ke link "http://localhost:4000/uploads/..." jaise save karta hai —
// unhe isi API ke address pe mod do, taaki WiFi pe bhi photos load hon.
const UPLOAD_URL = /^https?:\/\/[^/]+:4000\/uploads\//;
const rehost = (_k: string, v: unknown) => (typeof v === 'string' && UPLOAD_URL.test(v) ? v.replace(UPLOAD_URL, `${API_URL}/uploads/`) : v);

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type Prefs = { pushMessages: boolean; pushMissedCalls: boolean; pushGifts: boolean; pushOffers: boolean; hostCanCall: boolean };

export type ApiUser = {
  id: number;
  name: string | null;
  gender: 'male' | 'female' | 'other' | null;
  birthday: string | null;
  age: number | null;
  bio: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string;
  languages: string[];
  isVerified: boolean;
  level: number;
  xp?: number;
  isVip?: boolean;
  vipUntil?: string | null;
  phone: string | null;
  email: string | null;
  authProvider?: 'phone' | 'google';
  prefs?: Prefs; // Settings ke switch
  profileComplete: boolean;
  createdAt: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) throw new ApiError(401, 'unauthorized', 'Please sign in again');
  return { Authorization: `Bearer ${await getIdToken(user)}` };
}

// WiFi beech me atak jaye to request hamesha latki na rahe — itne der baad "Retry" dikhe
const TIMEOUT_MS = 12_000;
const UPLOAD_TIMEOUT_MS = 180_000; // photo / video (host form me 30 sec video)

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.body instanceof FormData ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(await authHeader()), ...(init.headers ?? {}) },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    markOffline(); // upar "Can't reach Meto" patti + chupchaap dobara check
    if (ctrl.signal.aborted) throw new ApiError(0, 'timeout', 'Server is taking too long. Check your connection and try again');
    throw new ApiError(0, 'network_error', 'Cannot reach server. Check your connection');
  } finally {
    clearTimeout(timer);
  }

  markOnline(); // server ne jawab diya (error bhi ho to server chal raha hai)
  const text = await res.text().catch(() => '');
  let body: any = null;
  try {
    body = text ? JSON.parse(text, rehost) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'server_error', err.message ?? 'Something went wrong');
  }
  return body as T;
}

export const jsonBody = (data: unknown): RequestInit => ({
  body: JSON.stringify(data),
  headers: { 'Content-Type': 'application/json' },
});
