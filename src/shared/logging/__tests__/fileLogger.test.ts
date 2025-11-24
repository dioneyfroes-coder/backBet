import path from 'node:path';
import * as fs from 'node:fs';
import type { WriteStream, Stats } from 'node:fs';
import { FileLogger } from '@/shared/logging/fileLogger';

jest.mock('node:fs', () => ({
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  createWriteStream: jest.fn(),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  renameSync: jest.fn(),
}));

jest.mock('@/shared/config/appConfig', () => ({
  appConfig: {
    logging: {
      file: {
        enabled: false,
        path: './logs/disabled.log',
        maxSizeBytes: 1,
        maxFiles: 1,
      },
    },
  },
}));

const fsMock = fs as jest.Mocked<typeof fs>;

const createMockStream = (): WriteStream => {
  const stream: Partial<WriteStream> & {
    write: jest.Mock;
    end: jest.Mock;
    on: jest.Mock;
  } = {
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };

  return stream as WriteStream;
};

describe('FileLogger', () => {
  const baseOptions = {
    enabled: true,
    filePath: './logs/test.log',
    maxSizeBytes: 4,
    maxFiles: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fsMock.statSync.mockReturnValue({ size: 0 } as unknown as Stats);
    fsMock.createWriteStream.mockImplementation(() => createMockStream());
    fsMock.existsSync.mockReturnValue(true);
  });

  it('should skip setup and writes when disabled', () => {
    const logger = new FileLogger({ ...baseOptions, enabled: false });

    logger.write('ignored');

    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
    expect(fsMock.createWriteStream).not.toHaveBeenCalled();
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
  });

  it('creates stream when file is missing without warning', () => {
    fsMock.statSync.mockImplementation(() => {
      const error = new Error('missing file') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    new FileLogger(baseOptions);

    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(1);
    expect(fsMock.createWriteStream).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('logs warning when statSync throws unexpected error', () => {
    fsMock.statSync.mockImplementation(() => {
      throw new Error('boom');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    new FileLogger(baseOptions);

    expect(warnSpy).toHaveBeenCalledWith(
      '[file-logger] Não foi possível obter tamanho do arquivo:',
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it('rotates files and normalizes payloads when size limit is reached', () => {
    const resolvedPath = path.resolve(process.cwd(), baseOptions.filePath);
    const streams: WriteStream[] = [];

    fsMock.createWriteStream.mockImplementation(() => {
      const stream = createMockStream();
      streams.push(stream);
      return stream;
    });

    const logger = new FileLogger({ ...baseOptions, maxSizeBytes: 4 });

    logger.write('abc');

    expect(streams[0].write).toHaveBeenCalledWith('abc\n');
    expect(streams[0].end).toHaveBeenCalledTimes(1);

    expect(fsMock.unlinkSync).toHaveBeenCalledWith(`${resolvedPath}.2`);
    expect(fsMock.renameSync).toHaveBeenCalledWith(`${resolvedPath}.1`, `${resolvedPath}.2`);
    expect(fsMock.unlinkSync).toHaveBeenCalledWith(`${resolvedPath}.1`);
    expect(fsMock.renameSync).toHaveBeenCalledWith(resolvedPath, `${resolvedPath}.1`);

    expect(fsMock.createWriteStream).toHaveBeenCalledTimes(2);

    logger.write('ok\n');
    expect(streams[1].write).toHaveBeenCalledWith('ok\n');
  });
});
