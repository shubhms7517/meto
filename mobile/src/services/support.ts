import { api } from './api';

export type SupportTopic = 'recharge' | 'call' | 'withdraw' | 'account' | 'report' | 'other';
export type SupportTicket = { id: number; topic: SupportTopic; status: 'open' | 'solved'; unread: number; lastMessageAt: string };
export type SupportMessage = { id: number; fromTeam: boolean; body: string | null; imageUrl: string | null; createdAt: string };

export const SUPPORT_TOPICS: { key: SupportTopic; label: string; emoji: string }[] = [
  { key: 'recharge', label: 'Recharge', emoji: '💎' },
  { key: 'call', label: 'Call charge', emoji: '📞' },
  { key: 'withdraw', label: 'Withdraw', emoji: '💸' },
  { key: 'account', label: 'Account', emoji: '👤' },
  { key: 'report', label: 'Report', emoji: '🚩' },
  { key: 'other', label: 'Other', emoji: '💬' },
];
export const topicLabel = (t: SupportTopic) => SUPPORT_TOPICS.find(x => x.key === t)?.label ?? 'Other';

// Customer service page: aakhri baat-cheet + naye jawab
export const getSupportSummary = () => api<{ ticket: SupportTicket | null; last: SupportMessage | null }>('/api/support');

// Chat khuli → saare message (naye jawab "dekh liye")
export const getSupportThread = () => api<{ ticket: SupportTicket | null; messages: SupportMessage[] }>('/api/support/messages');

// Text aur/ya screenshot. Nayi baat-cheet ho to topic zaroori
export function sendSupport(p: { topic?: SupportTopic; body?: string; photo?: string }) {
  const form = new FormData();
  if (p.topic) form.append('topic', p.topic);
  if (p.body) form.append('body', p.body);
  if (p.photo) {
    const ext = p.photo.split('?')[0].split('.').pop()?.toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    form.append('photo', { uri: p.photo, name: `shot.${ext ?? 'jpg'}`, type } as unknown as Blob);
  }
  return api<{ ticket: SupportTicket; message: SupportMessage }>('/api/support/messages', { method: 'POST', body: form });
}
