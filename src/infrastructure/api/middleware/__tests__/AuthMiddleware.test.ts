import type { AuthenticatedRequest } from '../AuthMiddleware';

type MiddlewareModule = typeof import('../AuthMiddleware');

type SetupOptions = {
  env?: string;
  allowDevBypass?: boolean;
  verifyImpl?: jest.Mock;
};

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

const loadMiddleware = ({ env = 'test', allowDevBypass = false, verifyImpl }: SetupOptions = {}) => {
  jest.resetModules();
  process.env.NODE_ENV = env;
  const verifyAccessToken = verifyImpl ?? jest.fn();

  jest.doMock('@/shared/config/appConfig', () => ({
    appConfig: {
      security: {
        allowDevBearerBypass: allowDevBypass,
      },
    },
  }));

  jest.doMock('@/shared/services/JwtService', () => ({
    JwtService: jest.fn().mockImplementation(() => ({
      verifyAccessToken,
    })),
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module: MiddlewareModule = require('../AuthMiddleware');
  return { ...module, verifyAccessToken };
};

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createRequest = (overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest => ({
  headers: {},
  ...overrides,
}) as AuthenticatedRequest;

describe('AuthMiddleware', () => {
  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('rejects unauthenticated requests with 401', () => {
    const { protectedRoute } = loadMiddleware();
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    protectedRoute(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid JWT tokens', () => {
    const verifyAccessToken = jest.fn(() => {
      throw new Error('expired');
    });
    const { protectedRoute } = loadMiddleware({ verifyImpl: verifyAccessToken });
    const req = createRequest({ headers: { authorization: 'Bearer a.b.c' } });
    const res = createResponse();

    protectedRoute(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(verifyAccessToken).toHaveBeenCalledWith('a.b.c');
  });

  it('rejects tokens that do not provide a userId', () => {
    const verifyAccessToken = jest.fn().mockReturnValue({ sessionId: 'sess', userId: '' });
    const { protectedRoute } = loadMiddleware({ verifyImpl: verifyAccessToken });
    const req = createRequest({ headers: { authorization: 'Bearer header.body.sig' } });
    const res = createResponse();

    protectedRoute(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('allows JWT-authenticated requests to proceed', () => {
    const verifyAccessToken = jest.fn().mockReturnValue({ userId: 'user-1', sessionId: 'sess-1' });
    const { protectedRoute } = loadMiddleware({ verifyImpl: verifyAccessToken });
    const req = createRequest({ headers: { authorization: 'Bearer header.body.sig' } });
    const res = createResponse();
    const next = jest.fn();

    protectedRoute(req, res, next);

    expect(verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({ userId: 'user-1', sessionId: 'sess-1' });
    expect(next).toHaveBeenCalled();
  });

  it('allows dev bypass tokens when enabled', () => {
    const { protectedRoute, verifyAccessToken } = loadMiddleware({ env: 'development', allowDevBypass: true });
    const req = createRequest({ headers: { authorization: 'Bearer dev-user' } });
    const res = createResponse();
    const next = jest.fn();

    protectedRoute(req, res, next);

    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(req.auth).toEqual({ userId: 'dev-user', sessionId: 'dev-session' });
    expect(next).toHaveBeenCalled();
  });

  it('exposes optionalAuth that never blocks the request', () => {
    const { optionalAuth } = loadMiddleware();
    const req = createRequest();
    const next = jest.fn();

    optionalAuth(req, createResponse(), next);

    expect(next).toHaveBeenCalled();
  });
});
