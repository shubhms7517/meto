import type { DecodedIdToken } from 'firebase-admin/auth';
import type { User } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      firebase?: DecodedIdToken; // requireFirebase ke baad set
      user?: User; // requireUser ke baad set
    }
  }
}

export {};
