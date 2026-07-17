import { Controller, Get } from '@nestjs/common';
import { GalleryService } from './gallery.service';

@Controller('api/gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  async findAll() {
    const items = await this.galleryService.findAll();
    return items.map((g) => ({ id: g.id, url: g.url, alt_text: g.alt_text }));
  }
}
