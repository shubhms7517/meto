import notifee, { AndroidCategory, AndroidImportance, AndroidVisibility, EventType, type Event } from '@notifee/react-native';
import { getMessaging, getToken, onTokenRefresh } from '@react-native-firebase/messaging';
import { api, jsonBody } from './api';

type RemoteMsg = { data?: Record<string, unknown> }; // FCM message (sirf data chahiye)

// Push: app band / background ho tab bhi call ki ghanti (poori screen) aur message ki notification

const CALLS = 'calls';
const MESSAGES = 'messages';
const RING = 'ring_in_app'; // app khuli ho tab ghanti (popup nahi — call screen pehle se khuli hai)

export async function setupChannels() {
  await notifee.createChannel({
    id: CALLS,
    name: 'Incoming calls',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 900, 300, 900],
  });
  await notifee.createChannel({ id: MESSAGES, name: 'Messages', importance: AndroidImportance.HIGH, sound: 'default' });
  await notifee.createChannel({
    id: RING,
    name: 'Ringing while app is open',
    importance: AndroidImportance.DEFAULT, // awaaz + vibrate, upar popup nahi
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 900, 300, 900],
  });
}

// App khuli hai aur call aayi → ghanti baar-baar (phone silent / vibrate ho to Android khud sambhalta hai)
const ringId = (callId: number) => `ring-${callId}`;
export async function startInAppRing(callId: number, name: string) {
  await setupChannels().catch(() => {});
  await notifee
    .displayNotification({
      id: ringId(callId),
      title: name || 'Meto',
      body: 'Incoming video call…',
      android: { channelId: RING, ongoing: true, autoCancel: false, loopSound: true, timeoutAfter: 30_000, pressAction: { id: 'default' } },
    })
    .catch(() => {});
}
export const stopInAppRing = (callId: number) => notifee.cancelNotification(ringId(callId)).catch(() => {});

let tokenSent: string | null = null;
let unsubRefresh: (() => void) | null = null;

const sendToken = async (token: string) => {
  if (token === tokenSent) return;
  await api('/api/devices', { method: 'POST', ...jsonBody({ token }) });
  tokenSent = token;
};

// Login ke baad: permission + token server ko
export async function registerPush() {
  try {
    await setupChannels();
    await notifee.requestPermission();
    const m = getMessaging();
    await sendToken(await getToken(m));
    unsubRefresh?.();
    unsubRefresh = onTokenRefresh(m, t => {
      sendToken(t).catch(() => {});
    });
  } catch (e) {
    console.warn('push setup failed', (e as Error).message);
  }
}

// Sign out: is phone pe ab push nahi
export async function unregisterPush() {
  unsubRefresh?.();
  unsubRefresh = null;
  const token = tokenSent;
  tokenSent = null;
  if (token) await api('/api/devices', { method: 'DELETE', ...jsonBody({ token }) }).catch(() => {});
}

const callNotifId = (callId: string) => `call-${callId}`;

async function showIncomingCall(d: Record<string, string>) {
  await setupChannels();
  await notifee.displayNotification({
    id: callNotifId(d.callId),
    title: d.name || 'Meto',
    body: 'Incoming video call…',
    data: d,
    android: {
      channelId: CALLS,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      ongoing: true,
      autoCancel: false,
      timeoutAfter: 30_000, // 30 sec me ghanti band (server bhi missed kar deta hai)
      fullScreenAction: { id: 'default' }, // phone lock ho to bhi poori screen
      pressAction: { id: 'default' },
      actions: [
        { title: 'Decline', pressAction: { id: 'decline' } },
        { title: 'Answer', pressAction: { id: 'answer', launchActivity: 'default' } },
      ],
    },
  });
}

export const cancelCallNotif = (callId: string) => notifee.cancelNotification(callNotifId(callId)).catch(() => {});

// FCM message → kya dikhana hai (background aur foreground dono yahi)
export async function handleRemoteMessage(msg: RemoteMsg, appInForeground = false) {
  const d = (msg.data ?? {}) as Record<string, string>;
  if (d.type === 'call' && d.callId) {
    if (!appInForeground) await showIncomingCall(d); // app khula ho to socket wali screen hi aati hai
  } else if (d.type === 'call_end' && d.callId) {
    await cancelCallNotif(d.callId);
  }
}

// Notification pe Decline (app band ho tab bhi)
export async function handleNotifEvent({ type, detail }: Event) {
  const d = (detail.notification?.data ?? {}) as Record<string, string>;
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'decline' && d.callId) {
    await cancelCallNotif(d.callId);
    await api(`/api/calls/${d.callId}/decline`, { method: 'POST' }).catch(() => {});
  }
}
