import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { firebaseAuth } from '../lib/firebase.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { User } from '../models/index.js';

// "Authorization: Bearer <Firebase ID token>" verify karo.
// Signature, expiry aur revoke (Firebase console se disable/sign-out) sab check hota hai.
async function verifyRequest(req: Request): Promise<DecodedIdToken> {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw unauthorized();
  }
  try {
    return await firebaseAuth.verifyIdToken(token, true);
  } catch {
    throw unauthorized();
  }
}

// Sirf Firebase token chahiye (login sync ke liye — tab tak MySQL me user nahi hota)
export async function requireFirebase(req: Request, _res: Response, next: NextFunction) {
  req.firebase = await verifyRequest(req);
  next();
}

// Token valid + MySQL me user hai + banned nahi hai
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  req.firebase = await verifyRequest(req);
  const user = await User.findOne({ where: { firebaseUid: req.firebase.uid } });
  if (!user) {
    throw unauthorized('Account not found. Please sign in again');
  }
  if (user.status === 'banned') {
    throw forbidden('account_banned', 'Your account has been suspended');
  }
  // Online status: zyada se zyada har 30 second me ek baar DB update
  // (app har 45s ping karta hai, online window 2 min — beech me gap nahi aata)
  const now = new Date();
  if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > 30_000) {
    user.lastSeenAt = now;
    await User.update({ lastSeenAt: now }, { where: { id: user.id }, silent: true });
  }
  req.user = user;
  next();
}
