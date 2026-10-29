import * as fs from 'fs';
import * as path from 'path';
import { UPLOAD_DIR } from '../gallery/gallery.service';

// Photos live in the persistent uploads volume (so backups keep them) but
// in a sub-folder that main.ts refuses to serve statically: they're only
// reachable through the guarded photo routes (see the messaging controllers).
export const MESSAGE_PHOTO_DIR = path.join(UPLOAD_DIR, 'messages');

// Best effort: a missing file must never fail the deletion that called it.
export function removePhotoFile(fileName: string | null): void {
  if (!fileName) return;
  fs.promises.unlink(path.join(MESSAGE_PHOTO_DIR, path.basename(fileName))).catch(() => undefined);
}
