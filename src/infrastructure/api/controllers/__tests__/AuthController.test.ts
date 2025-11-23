import { Request, Response } from 'express';
import { AuthController } from '../AuthController';
import { AuthenticatedRequest } from '../../middleware/AuthMiddleware';
import { User } from '@core/user/domain/entities/User';
import { Email } from '@core/user/domain/value-objects/Email';
import { randomUUID } from 'crypto';

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'session-uuid'),
}));

type MockResponse = Response & {
  statusCode?: number;
  body?: any;
  status: jest.MockedFunction<(code: number) => Response>;
  json: jest.MockedFunction<(payload: any) => Response>;
};

const createResponse = (): MockResponse => {
  const res: Partial<MockResponse> = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res as MockResponse;
  });
  res.json = jest.fn().mockImplementation((payload: any) => {
    res.body = payload;
    return res as MockResponse;
  });
  return res as MockResponse;
};

const createRequest = (overrides?: Partial<Request>): Request => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  ...overrides,
}) as Request;

const createAuthRequest = (overrides?: Partial<AuthenticatedRequest>): AuthenticatedRequest => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  auth: { userId: 'user-1', ...(overrides?.auth ?? {}) },
  ...overrides,
}) as AuthenticatedRequest;

const makeUser = (): User =>
  new User(
    'user-1',
    new Email('me@example.com'),
    'me.user',
    'hash',
    'ACTIVE' as any,
    new Date('2024-01-01T00:00:00.000Z'),
    new Date('2024-01-01T00:00:00.000Z'),
  );

describe('AuthController', () => {
  const registerUserUseCase = { execute: jest.fn() };
  const userService = {
    findByEmail: jest.fn(),
    comparePassword: jest.fn(),
    findById: jest.fn(),
  };
  const clerkService = {
    isEnabled: jest.fn(),
    createUser: jest.fn(),
    getUser: jest.fn(),
  };
  const jwtService = {
    signAccessToken: jest.fn(),
    signRefreshToken: jest.fn(),
    verifyRefreshToken: jest.fn(),
  };

  const buildController = () =>
    new AuthController(
      registerUserUseCase as unknown as any,
      userService as unknown as any,
      clerkService as unknown as any,
      jwtService as unknown as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns bad request when register payload is invalid', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: {} });
    jest.spyOn(controller as any, 'validateSchema').mockReturnValue(null);

    await controller.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('registers user and swallows Clerk sync failures', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({
      body: {
        email: 'me@example.com',
        password: 'Password123!',
        firstName: 'Me',
        lastName: 'User',
        username: 'me_user',
      },
    });
    registerUserUseCase.execute.mockResolvedValue({
      user: makeUser(),
      wallet: { userId: 'user-1', balance: 0, lockedBalance: 0, currency: 'BRL' },
    });
    clerkService.isEnabled.mockReturnValue(true);
    clerkService.createUser.mockRejectedValue(new Error('clerk down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await controller.register(req, res);

    expect(registerUserUseCase.execute).toHaveBeenCalledWith({
      email: 'me@example.com',
      username: 'me_user',
      password: 'Password123!',
      currency: 'BRL',
    });
    expect(clerkService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ externalUserId: 'user-1', email: 'me@example.com' }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    warnSpy.mockRestore();
  });

  it('login returns unauthorized when user does not exist', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: { email: 'missing@example.com', password: 'secret' } });
    userService.findByEmail.mockResolvedValue(null);

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('login returns unauthorized when password is invalid', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: { email: 'me@example.com', password: 'wrong' } });
    userService.findByEmail.mockResolvedValue(makeUser());
    userService.comparePassword.mockResolvedValue(false);

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('login returns tokens and user profile', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: { email: 'me@example.com', password: 'secret' } });
    const user = makeUser();
    userService.findByEmail.mockResolvedValue(user);
    userService.comparePassword.mockResolvedValue(true);
    clerkService.getUser.mockResolvedValue({ username: 'clerkUser', firstName: 'Clerk', lastName: 'User' });
    jwtService.signAccessToken.mockReturnValue('access');
    jwtService.signRefreshToken.mockReturnValue('refresh');

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        id: 'user-1',
        username: 'clerkUser',
        firstName: 'Clerk',
        lastName: 'User',
      },
    });
    expect(randomUUID).toHaveBeenCalled();
  });

  it('refreshToken returns bad request when payload is invalid', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: {} });
    jest.spyOn(controller as any, 'validateSchema').mockReturnValueOnce(null);

    await controller.refreshToken(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refreshToken returns not found when user is missing', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: { refreshToken: 'token' } });
    jwtService.verifyRefreshToken.mockReturnValue({ userId: 'user-1', sessionId: 'session' });
    userService.findById.mockResolvedValue(null);

    await controller.refreshToken(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('refreshToken returns renewed tokens and profile', async () => {
    const controller = buildController();
    const res = createResponse();
    const req = createRequest({ body: { refreshToken: 'token' } });
    const user = makeUser();
    jwtService.verifyRefreshToken.mockReturnValue({ userId: 'user-1', sessionId: undefined });
    userService.findById.mockResolvedValue(user);
    clerkService.getUser.mockResolvedValue(null);
    jwtService.signAccessToken.mockReturnValue('new-access');
    jwtService.signRefreshToken.mockReturnValue('new-refresh');

    await controller.refreshToken(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      user: {
        username: 'me.user',
        firstName: 'me',
        lastName: 'user',
      },
    });
  });

  it('me requires authentication and user existence', async () => {
    const controller = buildController();
    const res = createResponse();

    await controller.me(createAuthRequest({ auth: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(401);

    userService.findById.mockResolvedValue(null);
    await controller.me(createAuthRequest(), res);
    expect(res.status).toHaveBeenLastCalledWith(404);
  });

  it('me returns current user profile when found', async () => {
    const controller = buildController();
    const res = createResponse();
    const user = makeUser();
    userService.findById.mockResolvedValue(user);
    clerkService.getUser.mockResolvedValue({ username: 'clerkUser', firstName: 'Clerk', lastName: 'User' });

    await controller.me(createAuthRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data).toMatchObject({ username: 'clerkUser' });
  });

  it('logout always returns success message', async () => {
    const controller = buildController();
    const res = createResponse();

    await controller.logout(createAuthRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body?.data).toEqual({ message: 'Logout realizado com sucesso' });
  });
});
