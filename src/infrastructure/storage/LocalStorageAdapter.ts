import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { StoragePort, StoredFile } from './StoragePort';

const uploadDir = path.join(process.cwd(), 'uploads');

export class LocalStorageAdapter implements StoragePort {
  private ready = false;

  private async ensureDir() {
    if (this.ready) return;
    await fs.mkdir(uploadDir, { recursive: true });
    this.ready = true;
  }

  async store(buffer: Buffer, filename: string, mimeType: string): Promise<StoredFile> {
    await this.ensureDir();
    const id = randomUUID();
    const ext = path.extname(filename) || '';
    const safeName = `${Date.now()}-${id}${ext}`;
    const dest = path.join(uploadDir, safeName);
    await fs.writeFile(dest, buffer);
    // In local mode, serve via /uploads static route configured in ApiServer
    const url = `/uploads/${safeName}`;
    return {
      id,
      filename: safeName,
      originalName: filename,
      mimeType,
      size: buffer.length,
      url,
    };
  }

  async remove(pathOrId: string): Promise<void> {
    // naive: try to unlink path under uploads
    try {
      const filePath = path.join(uploadDir, pathOrId);
      await fs.unlink(filePath);
    } catch (_) {
      // ignore
    }
  }
}
