// src/types/multer.d.ts
// Shim tipado para o módulo 'multer' (sem @types/multer instalado) + augmentação
// global de Express.Request com file/storedFile usados no upload de documentos.

import type { StoredFile } from '@/infrastructure/storage/StoragePort';

export interface BackBetMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

declare module 'multer' {
  import type { RequestHandler } from 'express';

  interface BackBetMulterOptions {
    storage?: unknown;
    limits?: { fileSize?: number };
    fileFilter?: (
      req: unknown,
      file: BackBetMulterFile,
      cb: (error: Error | null, accept?: boolean) => void,
    ) => void;
  }

  interface BackBetMulterInstance {
    single(field: string): RequestHandler;
  }

  const multer: {
    (options?: BackBetMulterOptions): BackBetMulterInstance;
    memoryStorage(): unknown;
  };

  export = multer;
}

declare global {
  namespace Express {
    interface Multer {
      File: BackBetMulterFile;
    }
    interface Request {
      file?: BackBetMulterFile;
      storedFile?: StoredFile;
    }
  }
}
