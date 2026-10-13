import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from '../config/env.js';

function loadServiceAccount(): ServiceAccount {
  const path = resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
  } catch {
    console.error(`❌ Firebase service account file not found or invalid: ${path}`);
    process.exit(1);
  }
}

const app = initializeApp({ credential: cert(loadServiceAccount()) });

export const firebaseAuth = getAuth(app);
export const firebaseApp = app;
