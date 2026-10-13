import 'dotenv/config';
import { z } from 'zod';

// .env ko start pe hi validate karo — galat config pe server chalega hi nahi
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),

  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().min(1),
  PUBLIC_BASE_URL: z.url(),

  // Google Play billing: app ka package + service account (khaali = Firebase wala hi)
  PLAY_PACKAGE_NAME: z.string().default('com.meto'),
  PLAY_SERVICE_ACCOUNT_PATH: z.string().default(''),

  // Agora video call (console.agora.io). Khaali ho to calls "not configured" bolengi.
  AGORA_APP_ID: z.string().default(''),
  AGORA_APP_CERTIFICATE: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid .env:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
