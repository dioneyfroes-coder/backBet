jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
}));

describe('ClerkService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, JWT_SECRET: 'test-secret' };
    delete process.env.CLERK_API_KEY;
    delete process.env.CLERK_SECRET_KEY;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('disables client when only test keys are configured', async () => {
    process.env.CLERK_API_KEY = 'sk_test_api';
    process.env.CLERK_SECRET_KEY = 'sk_test_123';

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
    process.env.CLERK_API_KEY = 'sk_live_real_api';
    process.env.CLERK_SECRET_KEY = 'sk_live_real';
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

  it('swallows getUser errors when client is enabled', async () => {
    process.env.CLERK_API_KEY = 'sk_live_real_api';
    process.env.CLERK_SECRET_KEY = 'sk_live_real';
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
