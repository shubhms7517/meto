import type { Server } from 'socket.io';

// Socket.io server ka ek hi instance — routes/services yahin se events bhejte hain
let io: Server | null = null;
const connections = new Map<number, number>(); // userId → kitne sockets (ek user ke 2 phone ho sakte hain)

export const setIO = (server: Server) => {
  io = server;
};

export const userRoom = (userId: number) => `user:${userId}`;

export function emitToUser(userId: number, event: string, data: unknown) {
  io?.to(userRoom(userId)).emit(event, data);
}

export function trackConnect(userId: number) {
  connections.set(userId, (connections.get(userId) ?? 0) + 1);
}

export function trackDisconnect(userId: number) {
  const n = (connections.get(userId) ?? 1) - 1;
  if (n <= 0) connections.delete(userId);
  else connections.set(userId, n);
}

// App abhi khuli hai aur socket se juda hai
export const isConnected = (userId: number) => connections.has(userId);
