import { Router } from 'express';
import { col, fn, Op } from 'sequelize';
import { z } from 'zod';
import { env } from '../config/env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { imageUpload, saveImage } from '../lib/upload.js';
import { blockedIds, blockState } from '../services/safety.js';
import { requireUser } from '../middleware/auth.js';
import { Conversation, Message, User, HostProfile } from '../models/index.js';
import { chatPricing, findChatPartner, findConversation, markRead, MAX_MESSAGE_LENGTH, messageJSON, publicIds, sendMessage } from '../services/chat.js';

export const chatsRouter = Router();
chatsRouter.use(requireUser);

const idSchema = z.coerce.number().int().positive();
const PAGE = 30;

// Ek conversation ke messages (naye se purane), `before` se pehle wale
async function loadMessages(conversationId: number, before?: number, limit = PAGE) {
  const rows = await Message.findAll({
    where: { conversationId, ...(before ? { id: { [Op.lt]: before } } : {}) },
    order: [['id', 'DESC']],
    limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  const pub = await publicIds(page.flatMap(m => [m.senderId, m.receiverId]));
  return { messages: page.map(m => messageJSON(m, pub)), hasMore: rows.length > limit };
}

// GET /api/chats — meri saari chats (latest pehle) + unread count
chatsRouter.get('/', async (req, res) => {
  const me = req.user!;
  const convs = await Conversation.findAll({
    where: { [Op.or]: [{ userLowId: me.id }, { userHighId: me.id }], lastMessageId: { [Op.ne]: null } },
    order: [['lastMessageAt', 'DESC']],
    limit: 100,
  });
  if (convs.length === 0) {
    res.json({ chats: [], unreadTotal: 0 });
    return;
  }

  const otherIds = convs.map(c => c.otherUserId(me.id));
  const blockedSet = new Set(await blockedIds(me.id));
  const [users, lastMsgs, unreadRows] = await Promise.all([
    User.findAll({ where: { id: otherIds }, include: [{ model: HostProfile, as: 'host', required: false }] }),
    Message.findAll({ where: { id: convs.map(c => c.lastMessageId!) } }),
    Message.findAll({
      where: { receiverId: me.id, readAt: null, conversationId: convs.map(c => c.id) },
      attributes: ['conversationId', [fn('COUNT', col('id')), 'n']],
      group: ['conversationId'],
      raw: true,
    }),
  ]);
  const userById = new Map(users.map(u => [u.id, u]));
  const msgById = new Map(lastMsgs.map(m => [m.id, m]));
  const unread = new Map((unreadRows as unknown as { conversationId: number; n: string }[]).map(r => [r.conversationId, Number(r.n)]));
  const pub = new Map<number, number>([[me.id, me.publicId], ...users.map(u => [u.id, u.publicId] as [number, number])]);

  const chats = convs
    .map(c => {
      const other = userById.get(c.otherUserId(me.id));
      const last = msgById.get(c.lastMessageId!);
      if (!other || other.status === 'banned' || !last) return null;
      const blocked = blockedSet.has(other.id);
      return {
        id: c.id,
        // Block ke baad online status / photo nahi dikhate
        user: blocked ? { ...other.toCardJSON(), online: false, lastSeenAt: null } : other.toCardJSON(),
        lastMessage: messageJSON(last, pub),
        unread: unread.get(c.id) ?? 0,
        blocked,
      };
    })
    .filter(Boolean);

  res.json({ chats, unreadTotal: [...unread.values()].reduce((a, b) => a + b, 0) });
});

// GET /api/chats/with/:publicId — kisi user ke saath chat kholna (pehli baar ho to conversation null)
chatsRouter.get('/with/:publicId', async (req, res) => {
  const me = req.user!;
  const pid = idSchema.safeParse(req.params.publicId);
  if (!pid.success) throw notFound('User not found');
  const other = await findChatPartner(pid.data, me);
  other.host = (await HostProfile.findByPk(other.id)) ?? undefined; // card pe host ka rate
  const [conv, blocks] = await Promise.all([findConversation(me.id, other.id), blockState(me.id, other.id)]);
  const page = conv ? await loadMessages(conv.id) : { messages: [], hasMore: false };
  const card = other.toCardJSON();
  res.json({
    user: { ...card, ...(blocks.blockedMe || blocks.blockedByMe ? { online: false, lastSeenAt: null } : {}), languages: other.languageList },
    conversationId: conv?.id ?? null,
    pricing: await chatPricing(me, other), // user → host: free bache / daam (host ke liye null)
    ...blocks,
    ...page,
  });
});

// GET /api/chats/:id/messages?before=123 — purane messages (upar scroll)
chatsRouter.get('/:id/messages', async (req, res) => {
  const me = req.user!;
  const id = idSchema.parse(req.params.id);
  const before = req.query.before ? idSchema.parse(req.query.before) : undefined;
  const conv = await Conversation.findByPk(id);
  if (!conv || (conv.userLowId !== me.id && conv.userHighId !== me.id)) throw notFound('Chat not found');
  res.json(await loadMessages(id, before));
});

// POST /api/chats/:id/read
chatsRouter.post('/:id/read', async (req, res) => {
  await markRead(idSchema.parse(req.params.id), req.user!);
  res.json({ ok: true });
});

// POST /api/chats/send — socket na chale to REST se bhejna (fallback)
const sendSchema = z.object({
  to: z.number().int(),
  body: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  clientId: z.string().max(64).optional(),
});
chatsRouter.post('/send', async (req, res) => {
  const p = sendSchema.parse(req.body);
  res.status(201).json({ message: await sendMessage(req.user!, p.to, p.body, p.clientId ?? null) });
});

// POST /api/chats/photo — multipart: photo + to + clientId
// Photo compress hoti hai aur GPS/EXIF hat jaata hai (album jaisa). URL me random uuid — guess nahi ho sakta.
chatsRouter.post('/photo', imageUpload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Please choose an image');
  const p = z.object({ to: z.coerce.number().int(), clientId: z.string().max(64).optional() }).parse(req.body);
  // Pehle check (block / user) — tabhi file save
  const me = req.user!;
  const other = await findChatPartner(p.to, me);
  const blocks = await blockState(me.id, other.id);
  if (blocks.blockedByMe || blocks.blockedMe) throw badRequest('You can’t message this user');
  const url = env.PUBLIC_BASE_URL + (await saveImage(req.file.buffer, 'chat'));
  res.status(201).json({ message: await sendMessage(me, p.to, url, p.clientId ?? null, 'image') });
});
