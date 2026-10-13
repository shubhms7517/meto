import { api, jsonBody } from './api';
import type { UserCard } from './users';

export type NotifType = 'call_missed' | 'gift' | 'follow' | 'level_up' | 'recharge' | 'vip' | 'notice' | 'checkin' | 'vip_ending' | 'report';
export type NotifTab = 'all' | 'calls' | 'gifts' | 'follows' | 'meto';

export type AppNotification = {
  id: number;
  type: NotifType;
  data: Record<string, any> | null;
  actor: UserCard | null;
  read: boolean;
  iFollow?: boolean;
  createdAt: string;
};

export type NotifPage = { items: AppNotification[]; nextBefore: number | null; unread: Record<NotifTab, number> };

export const getNotifications = (tab: NotifTab, before?: number | null) =>
  api<NotifPage>(`/api/notifications?tab=${tab}${before ? `&before=${before}` : ''}`);

export const getUnread = () => api<{ unread: number }>('/api/notifications/unread');

export const markNotificationsRead = (ids?: number[]) =>
  api<{ ok: true }>('/api/notifications/read', { method: 'POST', ...jsonBody(ids ? { ids } : {}) });

// "2 min ago", "3 h ago", "Yesterday"
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
