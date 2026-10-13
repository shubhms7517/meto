import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { HttpError } from './lib/errors.js';
import { firebaseAuth } from './lib/firebase.js';
import { isConnected, setIO, trackConnect, trackDisconnect, userRoom, emitToUser } from './lib/realtime.js';
import { onUserDisconnected } from './services/calls.js';
import { User } from './models/index.js';
import { findChatPartner, markDeliveredOnConnect, markRead, MAX_MESSAGE_LENGTH, sendMessage } from './services/chat.js';
import { blockState } from './services/safety.js';
import { hostCameOnline } from './services/host.js';

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: string; code?: string }) => void;

const sendSchema = z.object({
  to: z.number().int(),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  clientId: z.string().max(64).optional(),
});
const typingSchema = z.object({ to: z.number().int(), typing: z.boolean() });
const readSchema = z.object({ conversationId: z.number().int().positive() });

// Ek user ek 10 second me 15 se zyada message nahi (spam rok)
const SEND_WINDOW_MS = 10_000;
const SEND_LIMIT = 15;

export function initSocket(http: HttpServer) {
  const io = new Server(http, { cors: { origin: false }, maxHttpBufferSize: 16 * 1024 });
  setIO(io);

  // Har connection pe Firebase token check — bina login koi socket nahi
  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      const decoded = await firebaseAuth.verifyIdToken(token, true);
      const user = await User.findOne({ where: { firebaseUid: decoded.uid } });
      if (!user || user.status === 'banned') return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async socket => {
    const userId: number = socket.data.userId;
    socket.join(userRoom(userId));
    trackConnect(userId);

    const load = async () => {
      const u = await User.findByPk(userId);
      if (!u || u.status === 'banned') {
        socket.disconnect(true);
        throw new HttpError(403, 'account_banned', 'Your account has been suspended');
      }
      return u;
    };

    try {
      const me = await load();
      await me.update({ lastSeenAt: new Date() }, { silent: true });
      await markDeliveredOnConnect(me);
      if (me.isHost) await hostCameOnline(me.id); // app khula = online
    } catch {
      return;
    }

    const sentAt: number[] = [];
    const fail = (ack: Ack | undefined, e: unknown) =>
      ack?.({ ok: false, error: e instanceof HttpError ? e.message : 'Something went wrong', code: e instanceof HttpError ? e.code : undefined });

    // message:send { to, body, clientId } → ack { ok, data: message }
    socket.on('message:send', async (payload: unknown, ack?: Ack) => {
      const now = Date.now();
      while (sentAt.length && now - sentAt[0] > SEND_WINDOW_MS) sentAt.shift();
      if (sentAt.length >= SEND_LIMIT) return ack?.({ ok: false, error: 'You are sending messages too fast' });
      sentAt.push(now);

      const p = sendSchema.safeParse(payload);
      if (!p.success) return ack?.({ ok: false, error: 'Invalid message' });
      try {
        const me = await load();
        const msg = await sendMessage(me, p.data.to, p.data.body, p.data.clientId ?? null);
        ack?.({ ok: true, data: msg });
      } catch (e) {
        fail(ack, e);
      }
    });

    // typing { to, typing } → doosre ko "typing…"
    socket.on('typing', async (payload: unknown) => {
      const p = typingSchema.safeParse(payload);
      if (!p.success) return;
      try {
        const me = await load();
        const other = await findChatPartner(p.data.to, me);
        const blocks = await blockState(me.id, other.id);
        if (blocks.blockedByMe || blocks.blockedMe) return;
        emitToUser(other.id, 'typing', { from: me.publicId, typing: p.data.typing });
      } catch {
        // ignore
      }
    });

    // message:read { conversationId }
    socket.on('message:read', async (payload: unknown, ack?: Ack) => {
      const p = readSchema.safeParse(payload);
      if (!p.success) return ack?.({ ok: false, error: 'Invalid' });
      try {
        await markRead(p.data.conversationId, await load());
        ack?.({ ok: true });
      } catch (e) {
        fail(ack, e);
      }
    });

    socket.on('disconnect', () => {
      trackDisconnect(userId);
      if (!isConnected(userId)) onUserDisconnected(userId, () => isConnected(userId));
      User.update({ lastSeenAt: new Date() }, { where: { id: userId }, silent: true }).catch(() => {});
    });
  });

  return io;
}
