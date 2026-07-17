import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GalleryController } from './gallery.controller';
import { AdminGalleryController } from './admin-gallery.controller';
import { GalleryService } from './gallery.service';

@Module({
  imports: [AuthModule],
  controllers: [GalleryController, AdminGalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
