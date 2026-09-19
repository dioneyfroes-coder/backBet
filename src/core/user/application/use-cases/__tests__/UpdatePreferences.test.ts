import { UpdatePreferences } from '../UpdatePreferences';
import { UserService } from '@/core/user/domain/services/UserService';

describe('UpdatePreferences', () => {
  const userId = 'user-1';

  let userService: jest.Mocked<Pick<UserService, 'updatePreferences'>>;
  let useCase: UpdatePreferences;

  beforeEach(() => {
    userService = {
      updatePreferences: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new UpdatePreferences(userService as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('narrows and forwards only valid boolean preferences', async () => {
    await useCase.execute(userId, {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: true,
    });

    expect(userService.updatePreferences).toHaveBeenCalledWith(userId, {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: true,
    });
  });

  it('ignores non-boolean or missing values for boolean preferences', async () => {
    await useCase.execute(userId, {
      emailNotifications: 'truthy',
      smsNotifications: 1 as unknown as boolean,
      marketingEmails: undefined,
    });

    expect(userService.updatePreferences).toHaveBeenCalledWith(userId, {});
  });

  it('forwards requireWithdrawPassword when boolean or null', async () => {
    await useCase.execute(userId, { requireWithdrawPassword: true });
    expect(userService.updatePreferences).toHaveBeenCalledWith(userId, {
      requireWithdrawPassword: true,
    });

    jest.clearAllMocks();
    await useCase.execute(userId, { requireWithdrawPassword: null });
    expect(userService.updatePreferences).toHaveBeenCalledWith(userId, {
      requireWithdrawPassword: null,
    });
  });

  it('ignores requireWithdrawPassword of unexpected type', async () => {
    await useCase.execute(userId, { requireWithdrawPassword: 'yes' });

    expect(userService.updatePreferences).toHaveBeenCalledWith(userId, {});
  });
});