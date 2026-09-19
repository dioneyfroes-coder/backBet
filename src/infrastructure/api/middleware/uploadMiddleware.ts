import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { StoragePort } from '@/infrastructure/storage/StoragePort';

const memory = multer.memoryStorage();

type UploadOptions = {
  fieldName?: string;
  maxFileSizeBytes?: number;
  allowedMIMEs?: string[];
};

export function createUploadMiddleware(
  storage: StoragePort,
  opts: UploadOptions | string = { fieldName: 'document', maxFileSizeBytes: 5 * 1024 * 1024 },
) {
  const options: UploadOptions = typeof opts === 'string' ? { fieldName: opts } : opts;
  const allowed = options.allowedMIMEs ?? [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];

  const upload = multer({
    storage: memory,
    limits: { fileSize: options.maxFileSizeBytes ?? 5 * 1024 * 1024 },
    fileFilter: (
      req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, accept?: boolean) => void,
    ) => {
      if (!file || !file.mimetype) return cb(new Error('Invalid file'));
      if (allowed.includes(file.mimetype)) return cb(null, true);
      const err = Object.assign(new Error('File type not allowed'), {
        code: 'LIMIT_FILE_TYPE',
      });
      return cb(err);
    },
  });

  return [
    upload.single(options.fieldName ?? 'document'),
    async (req: Request, _res: Response, next: NextFunction) => {
      const file = req.file;
      if (!file) return next();

      try {
        const stored = await storage.store(file.buffer, file.originalname, file.mimetype);
        // attach stored metadata to request for controller
        req.storedFile = stored;
        return next();
      } catch (err) {
        return next(err);
      }
    },
  ];
}
