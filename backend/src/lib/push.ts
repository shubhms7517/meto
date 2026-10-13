import { getMessaging } from 'firebase-admin/messaging';
import { firebaseApp } from './firebase.js';
import { DeviceToken } from '../models/index.js';

const messaging = getMessaging(firebaseApp);

type Push = {
  data: Record<string, string>; // app isi se samajhta hai (call / message ...)
  notification?: { title: string; body: string }; // app band ho to system dikhata hai
  channel?: 'calls' | 'messages';
  ttlSec?: number;
};

// User ke saare phones pe push. Kharab / purane token apne aap hat jaate hain.
export async function sendPush(userId: number, p: Push) {
  const rows = await DeviceToken.findAll({ where: { userId } });
  if (!rows.length) return;
  try {
    const res = await messaging.sendEachForMulticast({
      tokens: rows.map(r => r.token),
      data: p.data,
      notification: p.notification,
      android: {
        priority: 'high',
        ttl: (p.ttlSec ?? 60) * 1000,
        ...(p.notification ? { notification: { channelId: p.channel ?? 'messages', sound: 'default' } } : {}),
      },
    });
    const dead = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? '') ? rows[i].token : null))
      .filter((t): t is string => !!t);
    if (dead.length) await DeviceToken.destroy({ where: { token: dead } });
  } catch (e) {
    console.error('push failed', (e as Error).message);
  }
}

export const pushLater = (userId: number, p: Push) => void sendPush(userId, p).catch(() => {});
