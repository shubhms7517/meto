import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Admin, AdminSession, AuditLog, type AdminRole } from '../models/index.js';
import { forbidden, HttpError } from './errors.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const SESSION_MS = 12 * 60 * 60_000; // ek login 12 ghante
const IDLE_MS = 60 * 60_000; // 1 ghanta kuch na kiya → dobara login
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function checkPassword(pw: string, stored: string) {
  const [algo, saltHex, hashHex] = stored.split(':');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, 'hex');
  const got = await scrypt(pw, Buffer.from(saltHex, 'hex'), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const passwordProblem = (pw: string) =>
  pw.length < 10 ? 'Password must be at least 10 characters' : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Use letters and numbers' : null;

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const ipOf = (req: Request) => (req.ip ?? '').replace('::ffff:', '').slice(0, 64) || null;

export async function login(email: string, password: string, req: Request) {
  const admin = await Admin.findOne({ where: { email: email.trim().toLowerCase() } });
  const bad = new HttpError(401, 'bad_login', 'Wrong email or password');
  if (!admin || admin.status !== 'active') {
    await hashPassword(password); // jawab ka samay ek jaisa (email hai ya nahi, pata na chale)
    throw bad;
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) throw new HttpError(423, 'locked', 'Too many wrong tries. Try again in 15 minutes');
  if (!(await checkPassword(password, admin.passwordHash))) {
    const fails = admin.failedLogins + 1;
    await admin.update({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null });
    throw bad;
  }
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await AdminSession.create({ adminId: admin.id, tokenHash: sha(token), ip: ipOf(req), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 255), expiresAt: new Date(now.getTime() + SESSION_MS), lastUsedAt: now });
  await admin.update({ failedLogins: 0, lockedUntil: null, lastLoginAt: now });
  await AuditLog.create({ adminId: admin.id, action: 'admin.login', targetType: null, targetId: null, summary: null, before: null, after: null, ip: ipOf(req) });
  return { token, admin: admin.toJSONSafe() };
}

export async function logout(req: Request) {
  const t = bearer(req);
  if (t) await AdminSession.destroy({ where: { tokenHash: sha(t) } });
}

const bearer = (req: Request) => {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

declare module 'express-serve-static-core' {
  interface Request {
    admin?: Admin;
  }
}

// Har admin route pe: token sahi, session zinda, admin active, aur role allowed.
// requireAdmin() = koi bhi admin · requireAdmin('owner') = sirf owner · requireAdmin('finance') = owner + finance
export function requireAdmin(...roles: AdminRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const t = bearer(req);
      if (!t) throw new HttpError(401, 'unauthorized', 'Please sign in');
      const s = await AdminSession.findOne({ where: { tokenHash: sha(t), expiresAt: { [Op.gt]: new Date() } } });
      if (!s || Date.now() - s.lastUsedAt.getTime() > IDLE_MS) {
        if (s) await s.destroy();
        throw new HttpError(401, 'session_expired', 'Session expired. Please sign in again');
      }
      const admin = await Admin.findByPk(s.adminId);
      if (!admin || admin.status !== 'active') throw new HttpError(401, 'unauthorized', 'Please sign in');
      if (roles.length && admin.role !== 'owner' && !roles.includes(admin.role)) throw forbidden('no_permission', 'Your role can’t do this');
      await s.update({ lastUsedAt: new Date() });
      req.admin = admin;
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Khatarnak kaam se pehle password dobara (settings ke paise, admin team)
export async function confirmPassword(admin: Admin, password: unknown) {
  if (typeof password !== 'string' || !(await checkPassword(password, admin.passwordHash))) throw new HttpError(401, 'bad_password', 'Wrong admin password — type the password you use to log in here');
}

// Audit: har badlav ka record (sirf jodna, kabhi badalna nahi)
export function audit(req: Request, action: string, target: { type?: string; id?: string | number | null }, summary?: string | null, before?: unknown, after?: unknown) {
  return AuditLog.create({
    adminId: req.admin!.id,
    action,
    targetType: target.type ?? null,
    targetId: target.id == null ? null : String(target.id),
    summary: summary ?? null,
    before: before ?? null,
    after: after ?? null,
    ip: ipOf(req),
  });
}
