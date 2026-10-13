import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError, z } from 'zod';
import { HttpError } from '../lib/errors.js';
import { isProd } from '../config/env.js';

// Har error ka ek jaisa format: { error: { code, message } }
// Production me andar ki details (stack, SQL) kabhi bahar nahi jaati
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: { code: 'validation_error', message: first?.message ?? 'Invalid input', fields: z.flattenError(err).fieldErrors },
    });
    return;
  }
  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 8 MB' : 'Invalid upload';
    res.status(400).json({ error: { code: 'upload_error', message } });
    return;
  }

  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: { code: 'server_error', message: isProd ? 'Something went wrong' : String((err as Error)?.message ?? err) },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}
