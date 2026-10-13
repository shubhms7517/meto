import { io, Socket } from 'socket.io-client';
import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { API_URL, ApiError } from './api';

// Poori app me ek hi socket connection
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL, {
    transports: ['websocket'],
    // Har (re)connect pe taaza Firebase token — purana token 1 ghante me expire hota hai
    auth: cb => {
      const user = getAuth().currentUser;
      if (!user) return cb({ token: '' });
      getIdToken(user)
        .then(token => cb({ token }))
        .catch(() => cb({ token: '' }));
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;

type Ack<T> = { ok: true; data?: T } | { ok: false; error: string; code?: string };

// Event bhejo aur server ke jawab ka wait karo (timeout ke saath)
export function emitWithAck<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = socket;
    if (!s?.connected) return reject(new Error('offline'));
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) return reject(new Error('timeout'));
      if (!res?.ok) {
        const msg = res && 'error' in res ? res.error : 'Something went wrong';
        // code (jaise insufficient_gems) ho to ApiError — app sahi kaam kar sake (recharge sheet)
        return reject(res && 'code' in res && res.code ? new ApiError(400, res.code, msg) : new Error(msg));
      }
      resolve(res.data as T);
    });
  });
}
