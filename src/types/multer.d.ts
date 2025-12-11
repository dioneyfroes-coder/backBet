// Minimal ambient declaration to satisfy TypeScript when @types/multer is not installed
declare module 'multer' {
  const multer: any;
  export = multer;
}

declare namespace Express {
  export interface Multer {
    File: any;
  }
}
