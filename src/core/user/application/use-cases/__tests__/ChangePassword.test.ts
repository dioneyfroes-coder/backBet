import { ChangePassword } from '../ChangePassword';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';
import { AppError } from '@/shared/errors/AppError';

describe('ChangePassword', () => {
  const userId = 'user-1';
  const CURRENT = 'CurrentPass123';

  let repository: {
    findById: jest.Mock;
    update: jest.Mock;
  };
  let user: User;
  let useCase: ChangePassword;

  const makeActiveUser = (): User => {
    const u = new User(
      userId,
      new Email('user-1@example.com'),
      'tester',
      '',
      'ACTIVE',
      new Date(),
      new Date(),
    );
    u.setPassword(CURRENT);
    return u;
  };

  beforeEach(() => {
    user = makeActiveUser();
    repository = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new ChangePassword(repository as never);
  });

  it('changes the password and revokes all active sessions', async () => {
    const sessionService = await getSessionService();
    const session = await sessionService.openSession(userId);

    await useCase.execute({ userId, currentPassword: CURRENT, newPassword: 'NewPass456' });

    expect(repository.update).toHaveBeenCalledWith(user);
    expect(user.passwordHash).not.toBe(CURRENT);

    const persisted = await sessionService.findSession(session.sessionId);
    expect(persisted?.status).toBe('REVOKED');
    expect(persisted?.revokedReason).toBe('ACCOUNT_STATUS_CHANGED');
  });

  it('rejects a wrong current password', async () => {
    await expect(
      useCase.execute({ userId, currentPassword: 'WrongPass1', newPassword: 'NewPass456' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a new password shorter than 8 chars', async () => {
    await expect(
      useCase.execute({ userId, currentPassword: CURRENT, newPassword: 'short' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when new password equals current password', async () => {
    await expect(
      useCase.execute({ userId, currentPassword: CURRENT, newPassword: CURRENT }),
    ).rejects.toThrow(AppError);
  });

  it('rejects suspended accounts', async () => {
    user.status = 'SUSPENDED';

    await expect(
      useCase.execute({ userId, currentPassword: CURRENT, newPassword: 'NewPass456' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ userId, currentPassword: CURRENT, newPassword: 'NewPass456' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});