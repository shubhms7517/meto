import { api, jsonBody } from './api';
import type { UserCard } from './users';

export type StatusItem = {
  id: number;
  imageUrl: string;
  caption: string | null;
  visibility: 'everyone' | 'followers';
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  views?: number; // sirf apne status pe
  likes?: number;
};

export type StatusPerson = { user: UserCard; statuses: StatusItem[]; hasUnseen: boolean };
export type StatusFeed = { me?: { id: number; avatarUrl: string | null }; mine: StatusItem[]; people: StatusPerson[] };

export type StatusViewer = { id: number; name: string | null; avatarUrl: string | null; liked: boolean; viewedAt: string };

// Viewer screen ko turant dikhane ke liye aakhri feed yaad rakhte hain
let lastFeed: StatusFeed | null = null;
export const cachedFeed = () => lastFeed;

export async function getStatusFeed(): Promise<StatusFeed> {
  lastFeed = await api<StatusFeed>('/api/status/feed');
  return lastFeed;
}

export async function postStatus(uri: string, caption: string, visibility: 'everyone' | 'followers'): Promise<StatusItem> {
  const form = new FormData();
  const ext = uri.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  form.append('photo', { uri, name: `status.${ext ?? 'jpg'}`, type } as unknown as Blob);
  if (caption) form.append('caption', caption);
  form.append('visibility', visibility);
  return (await api<{ status: StatusItem }>('/api/status', { method: 'POST', body: form })).status;
}

export const markStatusViewed = (id: number) => api(`/api/status/${id}/view`, { method: 'POST' }).catch(() => {});
export const likeStatus = (id: number, liked: boolean) => api(`/api/status/${id}/like`, { method: 'POST', ...jsonBody({ liked }) });
export const getStatusViewers = async (id: number) => (await api<{ viewers: StatusViewer[] }>(`/api/status/${id}/viewers`)).viewers;
export const deleteStatus = (id: number) => api(`/api/status/${id}`, { method: 'DELETE' });

// "35m", "2h" — kitni der pehle
export function statusAge(iso: string): string {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

// "Expires in 23h 25m"
export function expiresIn(iso: string): string {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return `Expires in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}
