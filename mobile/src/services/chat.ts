import { api, jsonBody } from './api';
import { emitWithAck } from './socket';
import type { UserCard } from './users';

export type ChatMessage = {
  id: number;
  conversationId: number;
  from: number;
  to: number;
  type: 'text' | 'image' | 'gift' | 'system' | 'call'; // call = body JSON { s, d }
  body: string;
  clientId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  pending?: boolean; // app me bheja, server ne abhi confirm nahi kiya
  failed?: boolean;
};

export type ChatSummary = { id: number; user: UserCard; lastMessage: ChatMessage; unread: number; blocked: boolean };

export type FollowerCard = UserCard & { followedAt: string; isFollowingBack: boolean };

export const getChats = () => api<{ chats: ChatSummary[]; unreadTotal: number }>('/api/chats');

// Chat header: sathi online hai ya kab dikha (halka, har 30 sec)
export const getPresence = (publicId: number) => api<{ online: boolean; lastSeenAt: string | null }>(`/api/users/${publicId}/presence`);

export const openChatWith = (publicId: number) =>
  api<{
    user: UserCard & { languages: string[] };
    conversationId: number | null;
    blockedByMe: boolean;
    blockedMe: boolean;
    messages: ChatMessage[]; // naye se purane
    hasMore: boolean;
    pricing: ChatPricing | null; // user → host: free bache / daam
  }>(`/api/chats/with/${publicId}`);

// Host ko message: pehle kuch free, phir gems per message (VIP ke liye free ho sakta hai)
export type ChatPricing = { price: number; freeLimit: number; freeLeft: number; vipFree: boolean; vipOffer: boolean; paid: boolean };

// Photo bhejna (multipart) — server compress karke "image" message banata hai
export async function sendChatPhoto(to: number, uri: string, clientId: string): Promise<ChatMessage> {
  const form = new FormData();
  const ext = uri.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  form.append('photo', { uri, name: `photo.${ext ?? 'jpg'}`, type } as unknown as Blob);
  form.append('to', String(to));
  form.append('clientId', clientId);
  return (await api<{ message: ChatMessage }>('/api/chats/photo', { method: 'POST', body: form })).message;
}

// Chat list me aakhri message ka chhota roop
// Chat me call ka record: s = ended / missed / declined / cancelled, d = seconds
export type CallRecord = { s: 'ended' | 'missed' | 'declined' | 'cancelled'; d: number };
export const parseCallRecord = (body: string): CallRecord | null => {
  try {
    return JSON.parse(body) as CallRecord;
  } catch {
    return null;
  }
};
export const callDuration = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)} min${sec % 60 ? ` ${sec % 60} s` : ''}` : `${sec} s`);
// mine = maine call lagayi thi
export function callRecordTitle(r: CallRecord, mine: boolean) {
  if (r.s === 'ended') return 'Video call';
  if (r.s === 'declined') return mine ? 'Call declined' : 'You declined';
  return mine ? 'No answer' : 'Missed call';
}

export const previewText = (m: ChatMessage) => {
  if (m.type === 'image') return '📷 Photo';
  if (m.type === 'gift') return '🎁 Gift';
  if (m.type === 'call') {
    const r = parseCallRecord(m.body);
    return r?.s === 'ended' ? `📞 Video call · ${callDuration(r.d)}` : '📞 Call';
  }
  return m.body;
};

export const getOlderMessages = (conversationId: number, before: number) =>
  api<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chats/${conversationId}/messages?before=${before}`);

export const getFriends = () => api<{ users: UserCard[] }>('/api/users/friends');
export const getFollowers = () => api<{ users: FollowerCard[] }>('/api/users/followers');

export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Pehle socket se (fast), socket band ho to REST se
export async function sendChatMessage(to: number, body: string, clientId: string): Promise<ChatMessage> {
  try {
    return await emitWithAck<ChatMessage>('message:send', { to, body, clientId });
  } catch (e) {
    if ((e as Error).message !== 'offline' && (e as Error).message !== 'timeout') throw e;
    return (await api<{ message: ChatMessage }>('/api/chats/send', { method: 'POST', ...jsonBody({ to, body, clientId }) })).message;
  }
}

export async function markChatRead(conversationId: number): Promise<void> {
  try {
    await emitWithAck('message:read', { conversationId });
  } catch {
    await api(`/api/chats/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }
}

// "10:42", "Yesterday", "Mon", "12 Oct"
export function chatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
