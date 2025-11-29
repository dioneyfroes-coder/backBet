import { logFileTransport } from '@/shared/logging/fileLogger';

export type LogLevel = 'info' | 'warn' | 'error';

const logLineToConsole = (line: string, level: LogLevel): void => {
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
};

const normalisePayload = (
  payload: Record<string, unknown>,
  fallbackLevel: LogLevel,
): { serialised: string; level: LogLevel } => {
  const draft = { ...payload };
  const resolvedLevel = (draft.level as LogLevel) ?? fallbackLevel;

  if (!draft.timestamp) {
    draft.timestamp = new Date().toISOString();
  }
  draft.level = resolvedLevel;

  const serialised = JSON.stringify(draft);
  return { serialised, level: resolvedLevel };
};

export const writeStructuredLog = (
  payload: Record<string, unknown>,
  level: LogLevel = 'info',
): void => {
  const { serialised, level: resolvedLevel } = normalisePayload(payload, level);
  logLineToConsole(serialised, resolvedLevel);
  logFileTransport.write(serialised);
};
