import * as fs from 'fs';
import * as path from 'path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gallery } from '../../database/entities/gallery.entity';
import { UpdateGalleryDto } from './dto/gallery.dto';

export const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

@Injectable()
export class GalleryService {
  constructor(@InjectRepository(Gallery) private readonly galleryRepo: Repository<Gallery>) {}

  findAll(): Promise<Gallery[]> {
    return this.galleryRepo.find({ order: { sort_order: 'ASC', id: 'ASC' } });
  }

  async addUpload(beforeFilename: string, afterFilename: string, altText: string): Promise<Gallery> {
    const raw = await this.galleryRepo
      .createQueryBuilder('gallery')
      .select('COALESCE(MAX(gallery.sort_order), 0)', 'max')
      .getRawOne<{ max: number }>();
    const max = raw?.max ?? 0;

    const item = this.galleryRepo.create({
      url: `uploads/${afterFilename}`,
      before_url: `uploads/${beforeFilename}`,
      alt_text: altText,
      sort_order: Number(max) + 1,
      is_upload: true,
    });
    return this.galleryRepo.save(item);
  }

  async update(id: number, dto: UpdateGalleryDto): Promise<void> {
    const item = await this.galleryRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Photo introuvable.');

    if (dto.altText !== undefined) {
      item.alt_text = dto.altText;
    }
    if (dto.sortOrder !== undefined) {
      item.sort_order = dto.sortOrder;
    }
    await this.galleryRepo.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.galleryRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Photo introuvable.');

    await this.galleryRepo.delete(id);

    if (item.is_upload) {
      const filePath = path.join(UPLOAD_DIR, path.basename(item.url));
      fs.unlink(filePath, () => {
        // best-effort cleanup, ignore errors
      });
      if (item.before_url) {
        const beforePath = path.join(UPLOAD_DIR, path.basename(item.before_url));
        fs.unlink(beforePath, () => {
          // best-effort cleanup, ignore errors
        });
      }
    }
  }
}
