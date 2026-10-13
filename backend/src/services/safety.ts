import { Op } from 'sequelize';
import { sequelize } from '../db/sequelize.js';
import { emitToUser } from '../lib/realtime.js';
import { Block, Follow, Report, User } from '../models/index.js';
import type { ReportPriority, ReportReason } from '../models/Safety.js';

// Admin panel me kaunsi report pehle dikhe
const REASON_PRIORITY: Record<ReportReason, ReportPriority> = {
  underage: 'urgent',
  asking_money: 'high',
  inappropriate_content: 'high',
  harassment: 'high',
  fake_profile: 'normal',
  other: 'normal',
};
const NEW_ACCOUNT_MS = 24 * 60 * 60_000;

/** Jin users se mera block ka rishta hai (maine kiya YA unhone kiya) */
export async function blockedIds(userId: number): Promise<number[]> {
  const rows = await Block.findAll({
    where: { [Op.or]: [{ blockerId: userId }, { blockedId: userId }] },
    attributes: ['blockerId', 'blockedId'],
  });
  return [...new Set(rows.map(r => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
}

export async function blockState(me: number, other: number) {
  const rows = await Block.findAll({
    where: { [Op.or]: [{ blockerId: me, blockedId: other }, { blockerId: other, blockedId: me }] },
  });
  return {
    blockedByMe: rows.some(r => r.blockerId === me),
    blockedMe: rows.some(r => r.blockerId === other),
  };
}

export async function blockUser(me: User, other: User): Promise<void> {
  await sequelize.transaction(async transaction => {
    await Block.findOrCreate({ where: { blockerId: me.id, blockedId: other.id }, transaction });
    // Block = dono taraf ka follow khatam
    await Follow.destroy({
      where: { [Op.or]: [{ followerId: me.id, followingId: other.id }, { followerId: other.id, followingId: me.id }] },
      transaction,
    });
  });
  // Doosre ko kuch nahi batate (privacy) — sirf mere doosre devices ko
  emitToUser(me.id, 'block:changed', { user: other.publicId, blocked: true });
}

export async function unblockUser(me: User, other: User): Promise<void> {
  await Block.destroy({ where: { blockerId: me.id, blockedId: other.id } });
  emitToUser(me.id, 'block:changed', { user: other.publicId, blocked: false });
}

export async function reportUser(
  me: User,
  other: User,
  reason: ReportReason,
  details: string | null,
  conversationId: number | null,
): Promise<void> {
  // Report se user pe koi automatic asar NAHI (false reports se kisi ko chhupaya na ja sake).
  // Faisla sirf admin karega — yahan sirf saboot aur priority save hoti hai.
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const priority = REASON_PRIORITY[reason];
  // Aaj hi bana account → admin ke liye kam wazan (fake accounts se report karne wali chaal)
  const reporterIsNew = Date.now() - me.createdAt.getTime() < NEW_ACCOUNT_MS;

  // Ek hi insaan 24 ghante me ek hi baar count hota hai
  const existing = await Report.findOne({
    where: { reporterId: me.id, reportedId: other.id, status: 'open', createdAt: { [Op.gt]: since } },
  });
  if (existing) {
    await existing.update({
      reason,
      priority,
      details: details ?? existing.details,
      conversationId: conversationId ?? existing.conversationId,
    });
  } else {
    await Report.create({ reporterId: me.id, reportedId: other.id, reason, priority, reporterIsNew, details, conversationId });
  }
}
