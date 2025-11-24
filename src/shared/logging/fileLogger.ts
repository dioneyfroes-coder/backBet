import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '@/shared/config/appConfig';

interface FileLoggerOptions {
  enabled: boolean;
  filePath: string;
  maxSizeBytes: number;
  maxFiles: number;
}

export class FileLogger {
  private readonly enabled: boolean;

  private readonly filePath: string;

  private readonly maxSizeBytes: number;

  private readonly maxFiles: number;

  private stream: fs.WriteStream | null = null;

  private currentSize = 0;

  private rotating = false;

  constructor(options: FileLoggerOptions) {
    this.enabled = options.enabled && options.maxSizeBytes > 0;
    this.filePath = path.isAbsolute(options.filePath)
      ? options.filePath
      : path.resolve(process.cwd(), options.filePath);
    this.maxSizeBytes = options.maxSizeBytes;
    this.maxFiles = options.maxFiles;

    if (this.enabled) {
      this.ensureStream();
    }
  }

  private ensureStream(): void {
    if (!this.enabled || this.stream) {
      return;
    }

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    try {
      const stats = fs.statSync(this.filePath);
      this.currentSize = stats.size;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn('[file-logger] Não foi possível obter tamanho do arquivo:', error);
      }
      this.currentSize = 0;
    }

    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    this.stream.on('error', (error) => {
      console.warn('[file-logger] Falha ao escrever log em arquivo:', error);
    });
  }

  private rotate(): void {
    if (!this.enabled || this.rotating) {
      return;
    }

    this.rotating = true;

    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    try {
      for (let index = this.maxFiles; index >= 1; index -= 1) {
        const source = index === 1 ? this.filePath : `${this.filePath}.${index - 1}`;
        const target = `${this.filePath}.${index}`;

        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
        if (fs.existsSync(source)) {
          fs.renameSync(source, target);
        }
      }
    } catch (error) {
      console.warn('[file-logger] Falha ao rotacionar arquivo de log:', error);
    }

    this.currentSize = 0;
    this.ensureStream();
    this.rotating = false;
  }

  public write(line: string): void {
    if (!this.enabled) {
      return;
    }

    this.ensureStream();
    if (!this.stream) {
      return;
    }

    const payload = line.endsWith('\n') ? line : `${line}\n`;
    this.stream.write(payload);
    this.currentSize += Buffer.byteLength(payload);

    if (this.currentSize >= this.maxSizeBytes) {
      this.rotate();
    }
  }
}

const { file } = appConfig.logging;
export const logFileTransport = new FileLogger({
  enabled: file.enabled,
  filePath: file.path,
  maxSizeBytes: file.maxSizeBytes,
  maxFiles: file.maxFiles,
});