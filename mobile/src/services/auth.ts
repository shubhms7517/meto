import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';
import { unregisterPush } from './push';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { api, ApiError, ApiUser, jsonBody } from './api';

// google-services.json ka "client_type": 3 wala web client
const WEB_CLIENT_ID = '236908656196-8hm361kk7tdop2kq661qmr75qi473atr.apps.googleusercontent.com';

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

export type Gender = 'male' | 'female' | 'other';

export type ProfileInput = {
  name: string;
  gender: Gender;
  birthday: Date;
  avatarUri?: string;
};

// Login ke baad kahan jaana hai
export type LoginResult = { needsProfile: boolean };

type Confirmation = Awaited<ReturnType<typeof signInWithPhoneNumber>>;

// Phone screen → OTP screen ke beech confirmation object (navigation params me non-serializable hai)
let pendingConfirmation: Confirmation | null = null;

function friendlyError(e: unknown): Error {
  if (e instanceof ApiError) return e;
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-phone-number': 'Enter a valid phone number',
    'auth/too-many-requests': 'Too many attempts. Please try again later',
    'auth/invalid-verification-code': 'Wrong code. Please try again',
    'auth/session-expired': 'Code expired. Please resend',
    'auth/network-request-failed': 'No internet connection',
    'auth/quota-exceeded': 'SMS limit reached. Try again later',
    'auth/operation-not-allowed': 'Phone login is not available in your region yet',
    'auth/app-not-authorized': 'App is not authorized. Please update the app',
    'auth/user-disabled': 'Your account has been suspended',
  };
  if (__DEV__) {
    console.warn('[auth]', code, (e as Error)?.message);
  }
  return new Error(map[code] ?? `Something went wrong (${code || 'unknown'})`);
}

// Firebase login ke baad backend (MySQL) me user banao / update karo.
// Backend reject kare (banned, phone already used...) to Firebase se bhi logout.
async function syncSession(): Promise<LoginResult> {
  try {
    const { user } = await api<{ user: ApiUser; isNew: boolean }>('/api/auth/session', { method: 'POST' });
    return { needsProfile: !user.profileComplete };
  } catch (e) {
    await signOut();
    throw e;
  }
}

export async function sendOtp(phone: string): Promise<void> {
  if (phone.length !== 10) {
    throw new Error('Enter a valid 10-digit number');
  }
  try {
    pendingConfirmation = await signInWithPhoneNumber(getAuth(), `+91${phone}`);
  } catch (e) {
    throw friendlyError(e);
  }
}

export async function verifyOtp(code: string): Promise<LoginResult> {
  if (!pendingConfirmation) {
    throw new Error('Code expired. Please resend');
  }
  try {
    await pendingConfirmation.confirm(code);
    pendingConfirmation = null;
    return await syncSession();
  } catch (e) {
    throw friendlyError(e);
  }
}

// null = user ne Google popup band kar diya
export async function signInWithGoogle(): Promise<LoginResult | null> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res) || !res.data.idToken) {
      return null;
    }
    await signInWithCredential(getAuth(), GoogleAuthProvider.credential(res.data.idToken));
    return await syncSession();
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) {
      return null;
    }
    throw friendlyError(e);
  }
}

export function currentUser() {
  return getAuth().currentUser;
}

// App khulte hi Firebase saved login thodi der me restore karta hai.
// Pehla auth state aane tak ruko, warna logged-in user bhi "logged out" dikhega.
export function waitForAuth(): Promise<boolean> {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(getAuth(), user => {
      unsub();
      resolve(!!user);
    });
  });
}

export async function getMe(): Promise<ApiUser> {
  const { user } = await api<{ user: ApiUser }>('/api/users/me');
  return user;
}

export async function signOut(): Promise<void> {
  await unregisterPush().catch(() => {}); // is phone pe ab push nahi
  await GoogleSignin.signOut().catch(() => {});
  await firebaseSignOut(getAuth()).catch(() => {});
}

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function saveProfile(profile: ProfileInput): Promise<ApiUser> {
  if (profile.avatarUri) {
    const form = new FormData();
    const ext = profile.avatarUri.split('.').pop()?.toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    form.append('avatar', { uri: profile.avatarUri, name: `avatar.${ext ?? 'jpg'}`, type } as unknown as Blob);
    await api('/api/users/me/avatar', { method: 'POST', body: form });
  }

  const { user } = await api<{ user: ApiUser }>('/api/users/me/profile', {
    method: 'PUT',
    ...jsonBody({ name: profile.name, gender: profile.gender, birthday: toIsoDate(profile.birthday) }),
  });
  return user;
}
