import { Op } from 'sequelize';
import { env } from '../config/env.js';
import { firebaseAuth } from '../lib/firebase.js';
import { emitToUser } from '../lib/realtime.js';
import { deleteUploadByUrl } from '../lib/upload.js';
import { Call, DeletedAccount, Message, Status, User, UserPhoto } from '../models/index.js';
import { endCall } from './calls.js';

/**
 * Account delete: chalti call band → apni files (avatar, photos, status, bheji chat photos) mitao →
 * DB row hatao (baaki sab CASCADE se) → Firebase login bhi hatao.
 */
export async function deleteAccount(user: User) {
  const live = await Call.findAll({ where: { status: ['ringing', 'accepted'], [Op.or]: [{ callerId: user.id }, { calleeId: user.id }] } });
  for (const c of live) await endCall(user, c.id).catch(() => {});

  const [photos, statuses, chatImages] = await Promise.all([
    UserPhoto.findAll({ where: { userId: user.id }, attributes: ['url'] }),
    Status.findAll({ where: { userId: user.id }, attributes: ['imageUrl'] }),
    Message.findAll({ where: { senderId: user.id, type: 'image' }, attributes: ['body'] }),
  ]);
  const urls = [user.avatarUrl, ...photos.map(p => p.url), ...statuses.map(s => s.imageUrl), ...chatImages.map(m => m.body)];

  await DeletedAccount.create({ publicId: user.publicId, role: user.role, joinedAt: user.createdAt, reason: 'self' }).catch(e => console.error('deleted record', e));
  await user.destroy();
  for (const u of urls) await deleteUploadByUrl(u, env.PUBLIC_BASE_URL);

  emitToUser(user.id, 'account:deleted', {});
  await firebaseAuth.deleteUser(user.firebaseUid).catch(e => console.warn('firebase deleteUser', e?.code ?? e));
}
