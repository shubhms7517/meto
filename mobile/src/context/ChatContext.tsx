import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { connectSocket, disconnectSocket } from '../services/socket';
import { ChatMessage, ChatSummary, getChats } from '../services/chat';
import { onNetChange } from '../lib/netStatus';

type ChatState = {
  chats: ChatSummary[];
  unreadTotal: number;
  loaded: boolean;
  failed: boolean; // server nahi mila aur list abhi tak nahi aayi
  connected: boolean;
  typing: Record<number, boolean>; // publicId → abhi likh raha hai
  refresh: () => Promise<void>;
  setActiveChat: (publicId: number | null) => void; // khuli chat ke messages unread me nahi gine jaate
  markLocalRead: (conversationId: number) => void;
};

const Ctx = createContext<ChatState | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<Record<number, boolean>>({});
  const active = useRef<number | null>(null);
  const typingTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await getChats();
      setChats(res.chats);
      setLoaded(true);
      setFailed(false);
    } catch {
      setFailed(true); // network — Retry dikhao, server aate hi khud dobara
    }
  }, []);
  useEffect(() => onNetChange(on => on && refresh()), [refresh]);

  const markLocalRead = useCallback((conversationId: number) => {
    setChats(cs => cs.map(c => (c.id === conversationId ? { ...c, unread: 0 } : c)));
  }, []);

  // Login hote hi socket connect, logout pe band
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const start = () => {
      const s = connectSocket();

      const onConnect = () => {
        setConnected(true);
        refresh();
      };
      const onDisconnect = () => setConnected(false);
      // Server ne mana kiya (jaise profile abhi bani nahi) → thodi der baad dobara
      const onError = () => {
        setConnected(false);
        setTimeout(() => s.active || s.connect(), 5000);
      };

      const onNew = (m: ChatMessage) => {
        setChats(cs => {
          const i = cs.findIndex(c => c.id === m.conversationId);
          if (i === -1) {
            refresh(); // nayi conversation — user ki details server se
            return cs;
          }
          const c = cs[i];
          const incoming = m.from === c.user.id;
          const updated: ChatSummary = {
            ...c,
            lastMessage: m,
            unread: incoming && active.current !== m.from ? c.unread + 1 : c.unread,
          };
          return [updated, ...cs.slice(0, i), ...cs.slice(i + 1)];
        });
        // Message aa gaya to typing khatam
        setTyping(t => (t[m.from] ? { ...t, [m.from]: false } : t));
      };

      const onConvRead = ({ conversationId }: { conversationId: number }) => markLocalRead(conversationId);

      const patchLast = (conversationId: number, patch: Partial<ChatMessage>) =>
        setChats(cs =>
          cs.map(c =>
            c.id === conversationId && c.lastMessage.to === c.user.id ? { ...c, lastMessage: { ...c.lastMessage, ...patch } } : c,
          ),
        );
      const onRead = ({ conversationId, readAt }: { conversationId: number; readAt: string }) =>
        patchLast(conversationId, { readAt, deliveredAt: readAt });
      const onDelivered = ({ conversationId, deliveredAt }: { conversationId: number; deliveredAt: string }) =>
        setChats(cs =>
          cs.map(c =>
            c.id === conversationId && c.lastMessage.to === c.user.id && !c.lastMessage.deliveredAt
              ? { ...c, lastMessage: { ...c.lastMessage, deliveredAt } }
              : c,
          ),
        );

      const onTyping = ({ from, typing: isTyping }: { from: number; typing: boolean }) => {
        setTyping(t => ({ ...t, [from]: isTyping }));
        clearTimeout(typingTimers.current[from]);
        // "typing…" band karne ka event miss ho jaaye to 6 sec me khud hata do
        if (isTyping) typingTimers.current[from] = setTimeout(() => setTyping(t => ({ ...t, [from]: false })), 6000);
      };

      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on('connect_error', onError);
      s.on('message:new', onNew);
      s.on('conversation:read', onConvRead);
      s.on('message:read', onRead);
      s.on('message:delivered', onDelivered);
      s.on('typing', onTyping);
      if (s.connected) onConnect();

      return () => {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        s.off('connect_error', onError);
        s.off('message:new', onNew);
        s.off('conversation:read', onConvRead);
        s.off('message:read', onRead);
        s.off('message:delivered', onDelivered);
        s.off('typing', onTyping);
      };
    };

    const unsub = onAuthStateChanged(getAuth(), user => {
      cleanup?.();
      cleanup = null;
      if (user) {
        cleanup = start();
      } else {
        disconnectSocket();
        setChats([]);
        setLoaded(false);
        setConnected(false);
        setTyping({});
      }
    });
    return () => {
      unsub();
      cleanup?.();
    };
  }, [refresh, markLocalRead]);

  const value = useMemo<ChatState>(
    () => ({
      chats,
      unreadTotal: chats.reduce((n, c) => n + c.unread, 0),
      loaded,
      failed,
      connected,
      typing,
      refresh,
      setActiveChat: id => {
        active.current = id;
      },
      markLocalRead,
    }),
    [chats, loaded, failed, connected, typing, refresh, markLocalRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat(): ChatState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChat must be inside ChatProvider');
  return v;
}
