import { api, ApiUser, jsonBody, type Prefs } from './api';

export type UserCard = {
  id: number;
  name: string;
  gender: 'male' | 'female' | 'other';
  age: number;
  avatarUrl: string | null;
  city: string | null;
  isVerified: boolean;
  isVip?: boolean;
  isHost?: boolean;
  rate?: number | null; // host ka gems/min (Match me fix rate)
  busy?: boolean; // abhi kisi call par
  level?: number;
  online: boolean;
  lastSeenAt: string | null;
  isNew: boolean;
};

export type ProfileGift = { id: number; name: string; icon: string; isRare: boolean; count: number };

export type UserProfile = UserCard & {
  bio: string | null;
  country: string;
  languages: string[];
  level: number;
  followersCount: number;
  isFollowing: boolean;
  isMe: boolean;
  isBlockedByMe: boolean;
  photos: MediaItem[];
  videos?: MediaItem[]; // host ke videos (pehla free)
  gifts: ProfileGift[];
  giftTotal: number;
  giftSenders: number;
};

export type MyPhoto = { id: number; url: string; isLocked: boolean };
// Host ki photo / video — url null = lock (gems dekar kholo)
export type MediaItem = { id: number; url: string | null; isLocked: boolean; price?: number };
export type MyVideo = { id: number; url: string };

export type Me = ApiUser & { followingCount: number; followersCount: number; visitorsCount?: number; visitorsNew?: number; photos: MyPhoto[]; videos?: MyVideo[] };

export async function uploadPhoto(uri: string, locked = false): Promise<MyPhoto> {
  const form = new FormData();
  const ext = uri.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  form.append('photo', { uri, name: `photo.${ext ?? 'jpg'}`, type } as unknown as Blob);
  form.append('locked', String(locked));
  return (await api<{ photo: MyPhoto }>('/api/users/me/photos', { method: 'POST', body: form })).photo;
}

/* ---------- Safety: block / report ---------- */

export const REPORT_REASONS = [
  { key: 'fake_profile', label: 'Fake profile / photos', icon: '🎭' },
  { key: 'inappropriate_content', label: 'Nudity or sexual content', icon: '🔞' },
  { key: 'asking_money', label: 'Asking for money / scam', icon: '💸' },
  { key: 'harassment', label: 'Harassment or threats', icon: '⚠️' },
  { key: 'underage', label: 'Under 18', icon: '🧒' },
  { key: 'other', label: 'Something else', icon: '💬' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export const blockUser = (id: number) => api<{ blocked: true }>(`/api/users/${id}/block`, { method: 'POST' });
export const unblockUser = (id: number) => api<{ blocked: false }>(`/api/users/${id}/block`, { method: 'DELETE' });

export const reportUser = (id: number, body: { reason: ReportReason; details?: string; conversationId?: number; block?: boolean }) =>
  api<{ ok: true; blocked: boolean }>(`/api/users/${id}/report`, { method: 'POST', ...jsonBody(body) });

export type BlockedUser = { id: number; name: string | null; avatarUrl: string | null; blockedAt: string };
export const getBlocked = () => api<{ users: BlockedUser[] }>('/api/users/me/blocked');

export const deletePhoto =(id: number) => api<{ ok: true }>(`/api/users/me/photos/${id}`, { method: 'DELETE' });

type Page = { users: UserCard[]; hasMore: boolean; page: number };

// Discover filter (Filter sheet)
export const AGE_MIN = 18;
export const AGE_MAX = 60; // 60 = "60+"
// Discover me sirf hosts aati hain — isliye gender filter nahi
export type DiscoverFilter = { minAge: number; maxAge: number; online: boolean; langs: string[] };
export const DEFAULT_FILTER: DiscoverFilter = { minAge: AGE_MIN, maxAge: AGE_MAX, online: false, langs: [] };
export const filterCount = (f: DiscoverFilter) =>
  (f.minAge !== AGE_MIN || f.maxAge !== AGE_MAX ? 1 : 0) + (f.online ? 1 : 0) + (f.langs.length ? 1 : 0);

export const getDiscover = (page = 1, f: DiscoverFilter = DEFAULT_FILTER) => {
  const q = [`page=${page}`, 'limit=20'];
  if (f.online) q.push('online=1');
  if (f.minAge !== AGE_MIN) q.push(`minAge=${f.minAge}`);
  if (f.maxAge < AGE_MAX) q.push(`maxAge=${f.maxAge}`);
  if (f.langs.length) q.push(`langs=${encodeURIComponent(f.langs.join(','))}`);
  return api<Page>(`/api/users/discover?${q.join('&')}`);
};

export const getFollowing = (page = 1, onlineOnly = false) =>
  api<Page>(`/api/users/following?page=${page}&limit=20${onlineOnly ? '&online=1' : ''}`);

export const getProfile = async (id: number) => (await api<{ user: UserProfile }>(`/api/users/${id}`)).user;

export const getMyProfile = async () => (await api<{ user: Me }>('/api/users/me')).user;

export const setFollow = (id: number, follow: boolean) =>
  api<{ isFollowing: boolean; followersCount: number }>(`/api/users/${id}/follow`, { method: follow ? 'POST' : 'DELETE' });

// "5m", "2h", "3d" — last seen ke liye
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// 66950 → "66.9k"
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

// Edit profile — gender / birthday kabhi nahi badalte
export const LANGUAGES = ['Hindi', 'English', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi'] as const;
export type ProfileEdit = { name?: string; bio?: string; city?: string; languages?: string[] };
export const updateProfile = async (p: ProfileEdit) =>
  (await api<{ user: ApiUser }>('/api/users/me/profile', { method: 'PATCH', ...jsonBody(p) })).user;

export async function uploadAvatar(uri: string): Promise<ApiUser> {
  const form = new FormData();
  const ext = uri.split('.').pop()?.toLowerCase();
  form.append('avatar', { uri, name: `avatar.${ext ?? 'jpg'}`, type: ext === 'png' ? 'image/png' : 'image/jpeg' } as unknown as Blob);
  return (await api<{ user: ApiUser }>('/api/users/me/avatar', { method: 'POST', body: form })).user;
}

// Host ke profile videos (pehla sabko free, baaki user gems se kholte hain)
export async function uploadHostVideo(uri: string): Promise<MyVideo> {
  const form = new FormData();
  form.append('video', { uri, name: 'video.mp4', type: 'video/mp4' } as unknown as Blob);
  return (await api<{ video: MyVideo }>('/api/users/me/videos', { method: 'POST', body: form })).video;
}
export const deleteHostVideo = (id: number) => api<{ ok: true }>(`/api/users/me/videos/${id}`, { method: 'DELETE' });

// User gems dekar host ki photo / video kholta hai (ek baar = hamesha)
export const unlockMedia = (hostId: number, kind: 'photo' | 'video', id: number) =>
  api<{ url: string; balance: number | null }>(`/api/users/${hostId}/unlock`, { method: 'POST', ...jsonBody({ kind, id }) });

// Settings ke switch (notifications / "Hosts can call me")
export const savePrefs = (p: Partial<Prefs>) => api<{ prefs: Prefs }>('/api/users/me/prefs', { method: 'PATCH', ...jsonBody(p) });

// Account hamesha ke liye delete (Google Play ka niyam)
export const deleteMyAccount = () => api<{ ok: true }>('/api/users/me', { method: 'DELETE', ...jsonBody({ confirm: 'DELETE' }) });

// Kisne meri profile dekhi
export type Visitor = { user: UserCard; count: number; lastAt: string; isNew: boolean };
export const getVisitors = () => api<{ items: Visitor[]; total: number }>('/api/users/me/visitors');
