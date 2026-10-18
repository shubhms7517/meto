import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';

import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { connectSocket } from '../services/socket';
import { CallInfo, ensureCallPermissions } from '../services/calls';
import type { UserCard } from '../services/users';
import { StackActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/ref';
import { AppState } from 'react-native';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { api } from '../services/api';
import { cancelCallNotif, handleRemoteMessage, registerPush } from '../services/push';
import { useWallet } from './WalletContext';
import { getWallet } from '../services/wallet';
import type { RootStackParamList } from '../navigation/types';
import { appAlert } from '../lib/dialog';

type CallCtx = {
  placeCall: (peer: UserCard, source?: 'direct' | 'match') => Promise<void>;
  setInCall: (id: number | null) => void;
  clearInCall: (id: number | null | undefined) => void;
};

const Ctx = createContext<CallCtx | null>(null);

// Pehle se Call screen khuli ho (jaise "Call ended") to usi ki jagah nayi call — warna purani screen ke params hi badal jaate
function openCallScreen(params: RootStackParamList['Call']) {
  if (navigationRef.getCurrentRoute()?.name === 'Call') {
    navigationRef.dispatch(StackActions.replace('Call', params));
  } else {
    navigationRef.navigate('Call', params);
  }
}

// Poori app me: incoming call aate hi Call screen kholna, aur kahin se bhi call lagana
export function CallProvider({ children }: { children: React.ReactNode }) {
  const inCall = useRef<number | null>(null);
  const placing = useRef(false); // call lag rahi hai (gems check) — doosra tap ignore
  const { openRecharge } = useWallet();

  useEffect(() => {
    let off: (() => void) | null = null;
    const unsub = onAuthStateChanged(getAuth(), user => {
      off?.();
      off = null;
      if (!user) return;
      const s = connectSocket();
      registerPush();
      const onIncoming = (call: CallInfo) => {
        // Sach me chalti call ho tabhi ignore (server use "busy" bana deta hai)
        if (inCall.current && inCall.current !== call.id) return;
        cancelCallNotif(String(call.id)); // push wali ghanti bhi band — screen khul rahi hai
        if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === 'Call') return;
        const open = () => openCallScreen({ mode: 'incoming', call });
        // Navigation abhi taiyar na ho (app abhi khuli) to thoda ruk ke
        navigationRef.isReady() ? open() : setTimeout(open, 800);
      };
      // Push se app khula ho (call ki notification) → jo call abhi baj rahi hai wo dikhao
      const checkRinging = () =>
        api<{ call: CallInfo | null }>('/api/calls/ringing')
          .then(r => r.call && !inCall.current && onIncoming(r.call))
          .catch(() => {});
      checkRinging();
      const fg = onMessage(getMessaging(), m => {
        handleRemoteMessage(m, true);
      });
      const app = AppState.addEventListener('change', st => st === 'active' && checkRinging());
      s.on('call:incoming', onIncoming);
      s.on('connect', checkRinging);
      off = () => {
        s.off('call:incoming', onIncoming);
        s.off('connect', checkRinging);
        fg();
        app.remove();
      };
    });
    return () => {
      unsub();
      off?.();
    };
  }, []);

  const placeCallInner = useCallback(async (peer: UserCard, source: 'direct' | 'match') => {
    if (!(await ensureCallPermissions())) {
      appAlert('Permission needed', 'Allow camera and microphone to make video calls.');
      return;
    }
    // Pehle gems check — kam hon to seedha recharge sheet, recharge ke baad call
    try {
      // Host ka apna rate (Match me fix rate peer.rate me hi aata hai), VIP ko chhoot
      // Max 4 sec — server dheema / restart ho to der se call screen na khule (server khud gems check karta hai)
      const w = await Promise.race([getWallet(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      if (w.isHost) {
        // Host user ko call karti hai — paisa user deta hai (server user ke gems jaanchta hai)
        openCallScreen({ mode: 'outgoing', peer, source });
        return;
      }
      const pct = w.vipCallDiscountPct ?? 0;
      const need = peer.rate ? (w.isVip ? Math.round((peer.rate * (100 - pct)) / 100) : peer.rate) : w.callRate;
      if (w.balance < need) {
        openRecharge({ needed: need, peerName: peer.name ?? undefined, onRecharged: () => openCallScreen({ mode: 'outgoing', peer, source }) });
        return;
      }
    } catch {
      // network — server khud check karega
    }
    openCallScreen({ mode: 'outgoing', peer, source });
  }, [openRecharge]);

  const placeCall = useCallback(async (peer: UserCard, source: 'direct' | 'match' = 'direct') => {
    if (inCall.current || placing.current) return;
    placing.current = true;
    try {
      await placeCallInner(peer, source);
    } finally {
      placing.current = false;
    }
  }, [placeCallInner]);

  const setInCall = useCallback((id: number | null) => {
    inCall.current = id;
  }, []);

  // Sirf tab clear jab abhi wahi call record me ho (purani screen nayi call ka record na mitaye)
  const clearInCall = useCallback((id: number | null | undefined) => {
    if (id == null || inCall.current === id) inCall.current = null;
  }, []);

  return <Ctx.Provider value={{ placeCall, setInCall, clearInCall }}>{children}</Ctx.Provider>;
}

export function useCall(): CallCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCall must be inside CallProvider');
  return v;
}
