import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import Avatar from '../components/Avatar';
import { colors } from '../theme';
import { connectSocket } from '../services/socket';
import { getUnread, type AppNotification } from '../services/notifications';
import { navigationRef } from '../navigation/ref';

type Ctx = { unread: number; setUnread: (n: number) => void; refresh: () => void; lastNew: AppNotification | null };
const NotifCtx = createContext<Ctx | null>(null);

// Popup kis cheez ka aaye (recharge / VIP / level ka popup app khud dikhata hai)
const TOAST_TYPES = new Set(['gift', 'follow', 'call_missed', 'notice']);

export function toastText(n: AppNotification): { title: string; sub: string } {
  const name = n.actor?.name ?? 'Someone';
  switch (n.type) {
    case 'gift':
      return { title: `${name} sent you ${n.data?.name ?? 'a gift'} ${n.data?.icon ?? '🎁'}`, sub: 'Tap to open chat' };
    case 'follow':
      return { title: `${name} started following you`, sub: 'Tap to see profile' };
    case 'call_missed':
      return { title: `Missed video call from ${name}`, sub: 'Tap to call back' };
    case 'notice':
      return { title: String(n.data?.title ?? 'Message from Meto'), sub: 'Official notice' };
    default:
      return { title: 'New notification', sub: '' };
  }
}

// Notification pe tap → sahi jagah
export function openNotification(n: AppNotification) {
  if (!navigationRef.isReady()) return;
  const a = n.actor;
  switch (n.type) {
    case 'gift':
    case 'call_missed':
      if (a) navigationRef.navigate('Chat', { id: a.id, name: a.name });
      break;
    case 'follow':
      if (a) navigationRef.navigate('Profile', { id: a.id, name: a.name });
      break;
    case 'level_up':
      navigationRef.navigate('Level');
      break;
    case 'recharge':
      navigationRef.navigate('WalletHistory');
      break;
    case 'vip':
    case 'vip_ending':
      navigationRef.navigate('Vip');
      break;
    default:
      navigationRef.navigate('Notifications');
  }
}

function Toast({ n, onDone }: { n: AppNotification; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-140)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(y, { toValue: -140, duration: 250, useNativeDriver: true }).start(onDone), 3800);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { title, sub } = toastText(n);
  return (
    <Animated.View style={[styles.toastWrap, { top: insets.top + 8, transform: [{ translateY: y }] }]}>
      <Pressable
        style={styles.toast}
        onPress={() => {
          onDone();
          openNotification(n);
        }}>
        {n.actor ? (
          <Avatar uri={n.actor.avatarUrl} seed={n.actor.id} style={styles.toastAv} iconScale={0.9} />
        ) : (
          <View style={[styles.toastAv, styles.toastIc]}>
            <Text style={{ fontSize: 18 }}>🛡️</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle} numberOfLines={1}>
            {title}
          </Text>
          {!!sub && <Text style={styles.toastSub}>{sub}</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [lastNew, setLastNew] = useState<AppNotification | null>(null);

  const refresh = useCallback(() => {
    getUnread()
      .then(r => setUnread(r.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let off: (() => void) | null = null;
    const unsub = onAuthStateChanged(getAuth(), user => {
      off?.();
      off = null;
      if (!user) {
        setUnread(0);
        return;
      }
      refresh();
      const s = connectSocket();
      const onNew = (d: { notification: AppNotification; unread: number }) => {
        setUnread(d.unread);
        setLastNew(d.notification);
        const n = d.notification;
        if (!TOAST_TYPES.has(n.type)) return;
        // Usi insaan ki chat / call pehle se khuli ho to popup nahi
        const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
        if (route?.name === 'Call') return;
        if (route?.name === 'Chat' && n.actor && (route.params as { id?: number } | undefined)?.id === n.actor.id) return;
        if (route?.name === 'Notifications') return;
        setToast(n);
      };
      const onUnread = (d: { unread: number }) => setUnread(d.unread);
      s.on('notification:new', onNew);
      s.on('notification:unread', onUnread);
      s.on('connect', refresh);
      off = () => {
        s.off('notification:new', onNew);
        s.off('notification:unread', onUnread);
        s.off('connect', refresh);
      };
    });
    const app = AppState.addEventListener('change', st => {
      if (st === 'active' && getAuth().currentUser) refresh();
    });
    return () => {
      unsub();
      off?.();
      app.remove();
    };
  }, [refresh]);

  return (
    <NotifCtx.Provider value={{ unread, setUnread, refresh, lastNew }}>
      {children}
      {toast && <Toast key={toast.id} n={toast} onDone={() => setToast(null)} />}
    </NotifCtx.Provider>
  );
}

export function useNotifications(): Ctx {
  const v = useContext(NotifCtx);
  if (!v) throw new Error('useNotifications must be inside NotificationProvider');
  return v;
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 12, right: 12, zIndex: 100, elevation: 30 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(30,12,22,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,95,143,0.45)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 16,
  },
  toastAv: { width: 40, height: 40, borderRadius: 20 },
  toastIc: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,220,155,0.14)' },
  toastTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  toastSub: { color: colors.muted, fontSize: 11.5, marginTop: 1 },
});
