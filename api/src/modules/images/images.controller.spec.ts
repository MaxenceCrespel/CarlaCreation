import { NotFoundException } from '@nestjs/common';
import { ImagesController } from './images.controller';

describe('ImagesController', () => {
  const controller = new ImagesController();
  const res = {} as never;

  it('refuses a width outside the allowed set (no arbitrary sizes on disk)', async () => {
    await expect(controller.resized('999', 'photo.jpg', res)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.resized('abc', 'photo.jpg', res)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses names that could escape the uploads folder or are not images', async () => {
    for (const name of ['../package.json', '..%2Fsecret.jpg', 'a/b.jpg', '.env', 'script.js', 'photo.svg']) {
      await expect(controller.resized('480', name, res)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('returns 404 for an image that does not exist', async () => {
    await expect(controller.resized('480', 'does-not-exist-123.jpg', res)).rejects.toBeInstanceOf(NotFoundException);
  });
});
