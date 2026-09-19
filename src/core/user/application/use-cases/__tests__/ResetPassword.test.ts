import { ResetPassword } from '../ResetPassword';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';

describe('ResetPassword', () => {
  const userId = 'user-1';
  const token = 'recovery-token';

  let repository: {
    findByRecoveryToken: jest.Mock;
    update: jest.Mock;
  };
  let user: User;
  let useCase: ResetPassword;

  const makeUserWithToken = (): User => {
    const u = new User(
      userId,
      new Email('user-1@example.com'),
      'tester',
      '',
      'ACTIVE',
      new Date(),
      new Date(),
    );
    u.setPassword('OldPass123');
    u.passwordRecovery = { token, expiresAt: new Date(Date.now() + 30 * 60 * 1000) };
    return u;
  };

  beforeEach(() => {
    user = makeUserWithToken();
    repository = {
      findByRecoveryToken: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new ResetPassword(repository as never);
  });

  it('resets the password and revokes all active sessions', async () => {
    const sessionService = await getSessionService();
    const session = await sessionService.openSession(userId);

    await useCase.execute(token, 'NewPass456');

    expect(repository.update).toHaveBeenCalledWith(user);
    expect(user.passwordRecovery).toBeUndefined();
    expect(user.passwordHash).not.toBe('');

    const persisted = await sessionService.findSession(session.sessionId);
    expect(persisted?.status).toBe('REVOKED');
    expect(persisted?.revokedReason).toBe('ACCOUNT_STATUS_CHANGED');
  });

  it('rejects an invalid token without revoking anything', async () => {
    repository.findByRecoveryToken.mockResolvedValue(null);

    await expect(useCase.execute('wrong-token', 'NewPass456')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
});