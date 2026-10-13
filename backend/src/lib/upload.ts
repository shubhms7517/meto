import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { badRequest } from './errors.js';

export const UPLOAD_ROOT = resolve('uploads');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_SIDE = 1440;

// File memory me aati hai, disk pe sirf processed version jaata hai
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(badRequest('Only JPG, PNG or WEBP images are allowed'));
  },
});

/**
 * Image ko decode karke naya JPEG banata hai:
 * - jo file asli image nahi (fake mimetype) wo yahin fail ho jaati hai
 * - EXIF / GPS location jaisa chhupa data hat jaata hai (privacy)
 * - max 1440px, ~80% quality — kam data, fast loading
 * Return: public URL path, jaise "/uploads/photos/<uuid>.jpg"
 */
export async function saveImage(buffer: Buffer, folder: 'avatars' | 'photos' | 'seed' | 'chat' | 'status', name: string = randomUUID()): Promise<string> {
  let output: Buffer;
  try {
    output = await sharp(buffer, { failOn: 'error' })
      .rotate() // EXIF orientation ke hisaab se seedha
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    throw badRequest('File is not a valid image');
  }
  const dir = join(UPLOAD_ROOT, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.jpg`), output);
  return `/uploads/${folder}/${name}.jpg`;
}

// Sirf hamare uploads folder ki file delete (path traversal se bachav)
export async function deleteUploadByUrl(url: string | null, publicBase: string): Promise<void> {
  if (!url?.startsWith(`${publicBase}/uploads/`)) return;
  const file = resolve(UPLOAD_ROOT, url.slice(`${publicBase}/uploads/`.length));
  if (!file.startsWith(UPLOAD_ROOT) || file.includes(`${UPLOAD_ROOT}\\seed`) || file.includes(`${UPLOAD_ROOT}/seed`)) return;
  await unlink(file).catch(() => {});
}

/* ---------------- Private files (host application: selfie, video) ---------------- */
// Ye folder /uploads jaisa public NAHI hai — sirf admin (baad me) server ke through dekhega
export const PRIVATE_ROOT = resolve('private_uploads');

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/3gpp']);
export const hostApplyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 7 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'video' ? VIDEO_MIME.has(file.mimetype) : ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(badRequest(file.fieldname === 'video' ? 'Video must be MP4' : 'Only JPG, PNG or WEBP images are allowed'));
  },
});

// Image → saaf JPEG (EXIF hata ke) private folder me. Return: "host/<user>/<uuid>.jpg"
export async function savePrivateImage(buffer: Buffer, folder: string): Promise<string> {
  let output: Buffer;
  try {
    output = await sharp(buffer, { failOn: 'error' }).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    throw badRequest('File is not a valid image');
  }
  const dir = join(PRIVATE_ROOT, folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.jpg`;
  await writeFile(join(dir, name), output);
  return `${folder}/${name}`;
}

// Video: asli MP4/MOV hai ya nahi (byte 4-8 = "ftyp"), phir as-is save
export async function savePrivateVideo(buffer: Buffer, folder: string): Promise<string> {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') throw badRequest('File is not a valid video');
  const dir = join(PRIVATE_ROOT, folder);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.mp4`;
  await writeFile(join(dir, name), buffer);
  return `${folder}/${name}`;
}

/* ---------------- Public intro video (host profile) ---------------- */
export const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_MIME.has(file.mimetype)) cb(null, true);
    else cb(badRequest('Video must be MP4'));
  },
});

export async function savePublicVideo(buffer: Buffer): Promise<string> {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') throw badRequest('File is not a valid video');
  const dir = join(UPLOAD_ROOT, 'videos');
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.mp4`;
  await writeFile(join(dir, name), buffer);
  return `/uploads/videos/${name}`;
}
