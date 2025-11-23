import mongoose, { Connection } from 'mongoose';

export type MongoMockHandle = {
  restore: () => void;
  adminPing?: jest.Mock;
};

const buildSpy = (connection: Connection): MongoMockHandle => {
  const spy = jest.spyOn(mongoose, 'connection', 'get').mockReturnValue(connection);
  return {
    restore: () => spy.mockRestore(),
  };
};

export const mockMongoConnected = (): MongoMockHandle & { adminPing: jest.Mock } => {
  const adminPing = jest.fn().mockResolvedValue({ ok: 1 });
  const fakeConnection = {
    readyState: 1,
    db: {
      admin: () => ({ ping: adminPing }),
    },
  } as unknown as Connection;

  const handle = buildSpy(fakeConnection) as MongoMockHandle & { adminPing: jest.Mock };
  handle.adminPing = adminPing;
  return handle;
};

export const mockMongoDisconnected = (): MongoMockHandle => {
  const fakeConnection = {
    readyState: 0,
    db: undefined,
  } as unknown as Connection;

  return buildSpy(fakeConnection);
};
