import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { UniqueConstraintError } from 'sequelize';
import { requireFirebase } from '../middleware/auth.js';
import { forbidden } from '../lib/errors.js';
import { User } from '../models/index.js';

export const authRouter = Router();

// 9-digit public ID, jaise 100853803
const newPublicId = () => randomInt(100_000_000, 1_000_000_000);

/**
 * POST /api/auth/session
 * App har login ke baad call karta hai. Firebase user ko MySQL user se jodta hai.
 * Naya hai to banata hai, purana hai to last login update.
 */
authRouter.post('/session', requireFirebase, async (req, res) => {
  const fb = req.firebase!;
  const provider = fb.firebase.sign_in_provider;

  // Sirf hamare do login methods allowed (anonymous/custom tokens reject)
  if (provider !== 'phone' && provider !== 'google.com') {
    throw forbidden('provider_not_allowed', 'This sign-in method is not allowed');
  }
  // Google account ka email verified hona chahiye
  if (provider === 'google.com' && !fb.email_verified) {
    throw forbidden('email_not_verified', 'Please use a verified Google account');
  }

  let user = await User.findOne({ where: { firebaseUid: fb.uid } });
  let isNew = false;

  if (!user) {
    // Public ID collision bahut rare hai, phir bhi retry
    for (let attempt = 0; attempt < 5 && !user; attempt++) {
      try {
        user = await User.create({
          publicId: newPublicId(),
          firebaseUid: fb.uid,
          phone: fb.phone_number ?? null,
          email: fb.email ?? null,
          authProvider: provider === 'phone' ? 'phone' : 'google',
          name: null,
          gender: null,
          birthday: null,
          bio: null,
          avatarUrl: null,
          city: null,
          languages: null,
          lastLoginAt: new Date(),
          lastSeenAt: new Date(),
        });
        isNew = true;
      } catch (e) {
        const fields = e instanceof UniqueConstraintError ? Object.keys(e.fields) : [];
        if (fields.some(f => f.includes('phone'))) {
          throw forbidden('phone_in_use', 'This phone number is already linked to another account');
        }
        if (!fields.some(f => f.includes('public_id'))) throw e;
      }
    }
  } else {
    user.lastLoginAt = new Date();
    user.lastSeenAt = new Date();
    await user.save();
  }

  if (user!.status === 'banned') {
    throw forbidden('account_banned', 'Your account has been suspended');
  }

  res.status(isNew ? 201 : 200).json({ user: user!.toPublicJSON(), isNew });
});
