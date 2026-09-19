jest.mock('@/shared/config/appConfig', () => ({
  appConfig: {
    runtime: { env: 'test' },
    security: { allowDevBearerBypass: false },
    jwt: { secret: 'secret', issuer: 'issuer' },
    admin: { allowedUserIds: [] },
    finance: { allowedUserIds: [] },
  },
}));

import {
  AuthenticatedRequest,
  configureAuthSessionGate,
  getRequestUserId,
  optionalAuth,
  protectedRoute,
  requireAdminRole,
  requireAnyRole,
} from '../AuthMiddleware';
import { appConfig } from '@/shared/config/appConfig';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createRequest = (overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest =>
  ({
    headers: {},
    ...overrides,
  }) as AuthenticatedRequest;

describe('AuthMiddleware', () => {
  beforeEach(() => {
    appConfig.admin.allowedUserIds = [];
  });

  it('rejects requests without auth context', () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    protectedRoute(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows requests with auth context to proceed', () => {
    const req = createRequest({ authContext: { userId: 'user-1', sessionId: 'sess-1' } });
    const res = createResponse();
    const next = jest.fn();

    protectedRoute(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('validates an active session for jwt auth tokens (Fase 9)', async () => {
    const sessionService = await getSessionService();
    const session = await sessionService.openSession('user-1');

    const req = createRequest({
      authContext: { userId: 'user-1', sessionId: session.sessionId, authType: 'jwt' },
    });
    const res = createResponse();
    const next = jest.fn();

    await protectedRoute(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects jwt tokens whose session was revoked (pre-suspension/logout)', async () => {
    const sessionService = await getSessionService();
    const session = await sessionService.openSession('user-1');
    await sessionService.revoke(session.sessionId);

    const req = createRequest({
      authContext: { userId: 'user-1', sessionId: session.sessionId, authType: 'jwt' },
    });
    const res = createResponse();
    const next = jest.fn();

    await protectedRoute(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('proceeds when the session gate is disabled (injected gate null)', async () => {
    const previous = configureAuthSessionGate(null);
    try {
      const req = createRequest({
        authContext: { userId: 'user-1', sessionId: 'ghost-session', authType: 'jwt' },
      });
      const res = createResponse();
      const next = jest.fn();

      await protectedRoute(req, res, next);

      expect(next).toHaveBeenCalled();
    } finally {
      configureAuthSessionGate(previous);
    }
  });

  it('always advances optionalAuth middleware', () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('requires admin role when configured', () => {
    appConfig.admin.allowedUserIds = ['admin-1'];
    const req = createRequest({ authContext: { userId: 'admin-1', sessionId: 'sess' } });
    const res = createResponse();
    const next = jest.fn();

    requireAdminRole(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects non-admin users', () => {
    appConfig.admin.allowedUserIds = ['admin-1'];
    const req = createRequest({ authContext: { userId: 'basic-1', sessionId: 'sess' } });
    const res = createResponse();
    const next = jest.fn();

    requireAdminRole(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('extracts the request user id when available', () => {
    const req = createRequest({ authContext: { userId: 'user-1', sessionId: 'sess-1' } });

    expect(getRequestUserId(req)).toBe('user-1');
  });

  describe('requireAnyRole (matriz Fase 9)', () => {
    it('allows user in admin list', () => {
      appConfig.admin.allowedUserIds = ['admin-1'];
      const req = createRequest({ authContext: { userId: 'admin-1', sessionId: 's' } });
      const res = createResponse();
      const next = jest.fn();

      requireAnyRole(['admin', 'finance'])(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows user in finance list', () => {
      appConfig.finance.allowedUserIds = ['fin-1'];
      const req = createRequest({ authContext: { userId: 'fin-1', sessionId: 's' } });
      const res = createResponse();
      const next = jest.fn();

      requireAnyRole(['admin', 'finance'])(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('rejects users without any required role', () => {
      appConfig.admin.allowedUserIds = ['admin-1'];
      appConfig.finance.allowedUserIds = ['fin-1'];
      const req = createRequest({ authContext: { userId: 'basic-1', sessionId: 's' } });
      const res = createResponse();
      const next = jest.fn();

      requireAnyRole(['admin', 'finance'])(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated requests', () => {
      const req = createRequest();
      const res = createResponse();
      const next = jest.fn();

      requireAnyRole(['admin'])(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
