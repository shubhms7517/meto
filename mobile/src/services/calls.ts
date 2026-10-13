import { PermissionsAndroid, Platform } from 'react-native';
import { api, jsonBody } from './api';
import type { UserCard } from './users';

export type CallStatus = 'ringing' | 'accepted' | 'ended' | 'declined' | 'missed' | 'cancelled' | 'busy';

export type CallInfo = {
  id: number;
  status: CallStatus;
  rate: number;
  coinsCharged: number;
  durationSec: number;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  rating: number | null;
  reason?: 'no_gems' | null; // call kyun band hui (sirf call:ended / end pe)
  hostPoints?: number; // sirf host ko: is call se kitne points kamaye
  caller: UserCard;
  callee: UserCard;
};

// Har minute gems katne pe (sirf caller ko)
export type CallBilling = { callId: number; minute: number; charged: number; balance: number; minutesLeft: number };

export type JoinInfo = { appId: string; channel: string; uid: number; token: string };

export const startCall = (to: number, source: 'direct' | 'match' = 'direct') =>
  api<{ call: CallInfo; join: JoinInfo | null }>('/api/calls', { method: 'POST', ...jsonBody({ to, source }) });
export const acceptCall = (id: number) => api<{ call: CallInfo; join: JoinInfo }>(`/api/calls/${id}/accept`, { method: 'POST' });
export const declineCall = (id: number) => api<{ call: CallInfo }>(`/api/calls/${id}/decline`, { method: 'POST' });
export const endCall = (id: number) => api<{ call: CallInfo }>(`/api/calls/${id}/end`, { method: 'POST' });
export const rateCall = (id: number, stars: number) => api(`/api/calls/${id}/rate`, { method: 'POST', ...jsonBody({ stars }) });
export const getCallLog = (filter: 'all' | 'missed' | 'called') =>
  api<{ calls: (CallInfo & { outgoing: boolean })[]; missedCount: number }>(`/api/calls?filter=${filter}`);

// Camera + mic ki permission (Android runtime)
export async function ensureCallPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]);
  return Object.values(res).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
}

// 754 → "12:34", 3725 → "1:02:05"
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
