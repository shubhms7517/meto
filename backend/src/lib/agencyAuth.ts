import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Agency, AgencySession } from '../models/index.js';
import { forbidden, HttpError } from './errors.js';
import { checkPassword } from './adminAuth.js';

// Agency portal login — admin se bilkul alag (apni session table)
const SESSION_MS = 12 * 60 * 60_000;
const IDLE_MS = 2 * 60 * 60_000; // 2 ghante idle → dobara login
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const ipOf = (req: Request) => (req.ip ?? '').replace('::ffff:', '').slice(0, 64) || null;
const bearer = (req: Request) => {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

export async function agencyLogin(email: string, password: string, req: Request) {
  const agency = await Agency.findOne({ where: { email: email.trim().toLowerCase() } });
  const bad = new HttpError(401, 'bad_login', 'Wrong email or password');
  if (!agency || agency.status !== 'active' || !agency.passwordHash) {
    if (password) await checkPassword(password, '$'); // response time ek jaisa
    throw bad;
  }
  if (agency.lockedUntil && agency.lockedUntil > new Date()) throw new HttpError(423, 'locked', 'Too many wrong tries. Try again in 15 minutes');
  if (!(await checkPassword(password, agency.passwordHash))) {
    const fails = agency.failedLogins + 1;
    await agency.update({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null });
    throw bad;
  }
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await AgencySession.create({ agencyId: agency.id, tokenHash: sha(token), ip: ipOf(req), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 255), expiresAt: new Date(now.getTime() + SESSION_MS), lastUsedAt: now });
  await agency.update({ failedLogins: 0, lockedUntil: null, lastLoginAt: now });
  return { token, agency: agency.toPortalJSON() };
}

export async function agencyLogout(req: Request) {
  const t = bearer(req);
  if (t) await AgencySession.destroy({ where: { tokenHash: sha(t) } });
}

declare module 'express-serve-static-core' {
  interface Request {
    agency?: Agency;
  }
}

export function requireAgency() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = bearer(req);
      if (!token) throw forbidden('no_auth', 'Please sign in');
      const session = await AgencySession.findOne({ where: { tokenHash: sha(token) } });
      const now = new Date();
      if (!session || session.expiresAt < now || now.getTime() - session.lastUsedAt.getTime() > IDLE_MS) {
        if (session) await session.destroy();
        throw forbidden('session_expired', 'Session expired — sign in again');
      }
      const agency = await Agency.findByPk(session.agencyId);
      if (!agency || agency.status !== 'active') throw forbidden('no_access', 'Account not active');
      await session.update({ lastUsedAt: now });
      req.agency = agency;
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Purani session saaf (kabhi-kabhi)
export const sweepAgencySessions = () => AgencySession.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
