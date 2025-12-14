import { UserRepository } from '../../repositories/UserRepository';
import { UserService } from '../../services/UserService';
import { User } from '../../entities/User';
import { Email } from '../../value-objects/Email';

describe('UserService preferences', () => {
  let repo: UserRepository;
  let service: UserService;

  beforeEach(() => {
    repo = new UserRepository();
    service = new UserService(repo as any);
  });

  it('returns default preferences for new user and updates them', async () => {
    const user = new User(
      'u1',
      new Email('test@example.com'),
      'test.user',
      '',
      'ACTIVE',
      new Date(),
      new Date(),
    );

    await repo.save(user);

    const prefs = await service.getPreferences('u1');
    expect(prefs.emailNotifications).toBe(true);

    const updated = await service.updatePreferences('u1', { emailNotifications: false, smsNotifications: true });
    expect(updated.emailNotifications).toBe(false);
    expect(updated.smsNotifications).toBe(true);

    const prefs2 = await service.getPreferences('u1');
    expect(prefs2.emailNotifications).toBe(false);
  });
});
