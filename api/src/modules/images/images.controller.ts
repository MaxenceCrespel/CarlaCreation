import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

// Uploaded photos are kept as the originals (often 2+ MB, straight from a
// phone camera). Pages ask for a resized WebP instead — /img/<width>/<file> —
// generated once and cached on disk next to the uploads (inside the same
// volume, so it survives redeployments and is included in the photo backup).
// Only a fixed set of widths is accepted, so the endpoint can't be abused to
// fill the disk with arbitrary sizes.
export const IMAGE_WIDTHS = [320, 480, 640, 800, 1200, 1600];
const SAFE_NAME = /^[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i;
const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
const CACHE_DIR = path.join(UPLOADS_DIR, '.cache');

@Controller('img')
export class ImagesController {
  @Get(':width/:file')
  async resized(@Param('width') widthParam: string, @Param('file') file: string, @Res() res: Response): Promise<void> {
    const width = Number(widthParam);
    if (!IMAGE_WIDTHS.includes(width) || !SAFE_NAME.test(file)) throw new NotFoundException();

    const source = path.join(UPLOADS_DIR, file);
    if (!fs.existsSync(source)) throw new NotFoundException();

    const cached = path.join(CACHE_DIR, `${width}-${file}.webp`);
    if (!fs.existsSync(cached)) {
      await fs.promises.mkdir(CACHE_DIR, { recursive: true });
      const tmp = `${cached}.${process.pid}.${Date.now()}.tmp`;
      // rotate() applies the EXIF orientation (phone photos), withoutEnlargement
      // never upscales a small original.
      await sharp(source).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp);
      await fs.promises.rename(tmp, cached);
    }

    // Upload names are unique (timestamp + random), so a given URL never changes.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('image/webp');
    fs.createReadStream(cached).pipe(res);
  }
}
