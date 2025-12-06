jest.mock('@/shared/config/appConfig', () => ({
  appConfig: {
    runtime: { env: 'test' },
    security: { allowDevBearerBypass: false },
    jwt: { secret: 'secret', issuer: 'issuer' },
    admin: { allowedUserIds: [] },
  },
}));

import {
  AuthenticatedRequest,
  getRequestUserId,
  optionalAuth,
  protectedRoute,
  requireAdminRole,
} from '../AuthMiddleware';
import { appConfig } from '@/shared/config/appConfig';

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
});
