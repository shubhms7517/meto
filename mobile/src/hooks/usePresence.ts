import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '../services/api';

const PING_MS = 45_000;

// App screen pe khuli ho to server ko batate raho "main online hoon".
// Background me jaate hi band — 2 minute baad user offline dikhne lagta hai.
export function usePresence() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const ping = () => api('/api/users/me/ping', { method: 'POST' }).catch(() => {});

    const start = () => {
      if (timer) return;
      ping();
      timer = setInterval(ping, PING_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', s => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, []);
}
