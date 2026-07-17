import * as crypto from 'crypto';
import * as fs from 'fs';
import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { GalleryService, UPLOAD_DIR } from './gallery.service';
import { UpdateGalleryDto, UploadGalleryDto } from './dto/gallery.dto';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const uploadOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype];
      // Server-generated random filename: never trust the client-supplied name.
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(new BadRequestException('Format non supporté. Utilisez JPEG, PNG ou WebP.'), false);
    }
    cb(null, true);
  },
};

@UseGuards(AdminAuthGuard)
@Controller('api/admin/gallery')
export class AdminGalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  findAll() {
    return this.galleryService.findAll();
  }

  @UseGuards(CsrfGuard)
  @Post()
  @UseInterceptors(FileInterceptor('photo', uploadOptions))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadGalleryDto) {
    if (!file) {
      throw new BadRequestException('Aucune image reçue.');
    }
    return this.galleryService.addUpload(file.filename, dto.altText);
  }

  @UseGuards(CsrfGuard)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGalleryDto) {
    await this.galleryService.update(id, dto);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.galleryService.remove(id);
    return { success: true };
  }
}
