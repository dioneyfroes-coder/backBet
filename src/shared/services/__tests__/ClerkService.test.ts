jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
}));

describe('ClerkService', () => {
  const ORIGINAL_ENV = process.env;

  const applyEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}) => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret',
      NODE_ENV: overrides.NODE_ENV ?? 'development',
      BACKBET_RUNTIME_ENV: overrides.BACKBET_RUNTIME_ENV ?? overrides.NODE_ENV ?? 'development',
      CLERK_ENABLE_IN_TESTS: overrides.CLERK_ENABLE_IN_TESTS ?? 'true',
      ...overrides,
    };
  };

  beforeEach(() => {
    jest.resetModules();
    applyEnv();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('disables client when no keys are provided', async () => {
    applyEnv({ CLERK_SECRET_KEY: '', CLERK_API_KEY: '' });

    await jest.isolateModulesAsync(async () => {
      const backend = await import('@clerk/backend');
      const createClerkClientMock = backend.createClerkClient as jest.Mock;
      createClerkClientMock.mockReset();

      const { ClerkService } = await import('../ClerkService');
      const service = new ClerkService();

      expect(service.isEnabled()).toBe(false);
      await expect(service.createUser({} as any)).resolves.toBeNull();
      await expect(service.getUser('user')).resolves.toBeNull();
      expect(createClerkClientMock).not.toHaveBeenCalled();
    });
  });

  it('creates a Clerk client when live keys exist', async () => {
    applyEnv({
      CLERK_API_KEY: 'sk_live_real_api',
      CLERK_SECRET_KEY: 'sk_live_real',
    });
    await jest.isolateModulesAsync(async () => {
      const users = {
        createUser: jest.fn().mockResolvedValue({ id: 'clerk-user' }),
        getUser: jest.fn().mockResolvedValue({ id: 'clerk-user' }),
      };
      const backend = await import('@clerk/backend');
      const createClerkClientMock = backend.createClerkClient as jest.Mock;
      createClerkClientMock.mockReset();
      createClerkClientMock.mockReturnValue({ users });

      const { ClerkService } = await import('../ClerkService');
      const service = new ClerkService();

      expect(service.isEnabled()).toBe(true);
      await expect(
        service.createUser({
          externalUserId: 'user-1',
          email: 'me@example.com',
          username: 'me',
          firstName: 'Me',
          lastName: 'User',
          password: 'Password123!',
        }),
      ).resolves.toEqual({ id: 'clerk-user' });

      await expect(service.getUser('clerk-user')).resolves.toEqual({ id: 'clerk-user' });
      expect(users.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ externalId: 'user-1', emailAddress: ['me@example.com'] }),
      );
    });
  });

  it('creates a Clerk client when test keys are used outside production', async () => {
    applyEnv({
      NODE_ENV: 'development',
      BACKBET_RUNTIME_ENV: 'development',
      CLERK_SECRET_KEY: 'sk_test_dev',
    });
    await jest.isolateModulesAsync(async () => {
      const users = {
        createUser: jest.fn().mockResolvedValue({ id: 'clerk-user' }),
        getUser: jest.fn().mockResolvedValue({ id: 'clerk-user' }),
      };
      const backend = await import('@clerk/backend');
      const createClerkClientMock = backend.createClerkClient as jest.Mock;
      createClerkClientMock.mockReset();
      createClerkClientMock.mockReturnValue({ users });

      const { ClerkService } = await import('../ClerkService');
      const service = new ClerkService();

      expect(service.isEnabled()).toBe(true);
      await expect(service.getUser('clerk-user')).resolves.toEqual({ id: 'clerk-user' });
      expect(createClerkClientMock).toHaveBeenCalled();
    });
  });

  it('skips client setup when runtime env is test and key is test', async () => {
    applyEnv({
      NODE_ENV: 'test',
      BACKBET_RUNTIME_ENV: 'test',
      CLERK_ENABLE_IN_TESTS: 'false',
      CLERK_SECRET_KEY: 'sk_test_runtime',
    });

    await jest.isolateModulesAsync(async () => {
      const backend = await import('@clerk/backend');
      const createClerkClientMock = backend.createClerkClient as jest.Mock;
      createClerkClientMock.mockReset();

      const { ClerkService } = await import('../ClerkService');
      const service = new ClerkService();

      expect(service.isEnabled()).toBe(false);
      expect(createClerkClientMock).not.toHaveBeenCalled();
    });
  });

  it('swallows getUser errors when client is enabled', async () => {
    applyEnv({
      CLERK_API_KEY: 'sk_live_real_api',
      CLERK_SECRET_KEY: 'sk_live_real',
    });
    await jest.isolateModulesAsync(async () => {
      const users = {
        createUser: jest.fn(),
        getUser: jest.fn().mockRejectedValue(new Error('not found')),
      };
      const backend = await import('@clerk/backend');
      const createClerkClientMock = backend.createClerkClient as jest.Mock;
      createClerkClientMock.mockReset();
      createClerkClientMock.mockReturnValue({ users });

      const { ClerkService } = await import('../ClerkService');
      const service = new ClerkService();

      await expect(service.getUser('missing')).resolves.toBeNull();
    });
  });
});
