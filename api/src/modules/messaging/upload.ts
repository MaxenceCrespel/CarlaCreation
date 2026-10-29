import * as crypto from 'crypto';
import * as fs from 'fs';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { MESSAGE_PHOTO_DIR } from './message-photos';

fs.mkdirSync(MESSAGE_PHOTO_DIR, { recursive: true });

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Same rules as the gallery upload (server-generated name, image types
// only), with a higher size cap: phone photos sent as-is are often > 5 Mo.
export const messagePhotoUpload = {
  storage: diskStorage({
    destination: MESSAGE_PHOTO_DIR,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ALLOWED_MIME_TYPES[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(new BadRequestException('Format non supporté. Utilisez une photo JPEG, PNG ou WebP.'), false);
    }
    cb(null, true);
  },
};
