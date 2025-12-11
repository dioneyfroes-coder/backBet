export type StoredFile = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

export interface StoragePort {
  store(buffer: Buffer, filename: string, mimeType: string): Promise<StoredFile>;
  remove?(pathOrId: string): Promise<void>;
}
