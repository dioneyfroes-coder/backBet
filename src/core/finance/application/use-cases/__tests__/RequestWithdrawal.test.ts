import { RequestWithdrawal } from '../RequestWithdrawal';
import { WithdrawalRequestService } from '../../../domain/services/WithdrawalRequestService';
import { UserService } from '../../../../user/domain/services/UserService';
import { Currency } from '../../../domain/value-objects/Currency';
import { AppError } from '@/shared/errors/AppError';

const mockRequest = { id: 'req-1' } as any;

const buildUser = (overrides: Partial<any> = {}) => {
  const baseUser = {
    id: 'user-1',
    status: 'ACTIVE',
    passwordHash: 'hash',
    preferences: {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: false,
      requireWithdrawPassword: null,
    },
  } as any;
  if (overrides.preferences) {
    baseUser.preferences = { ...baseUser.preferences, ...overrides.preferences };
  }
  return { ...baseUser, ...overrides };
};

describe('RequestWithdrawal', () => {
  const withdrawalRequestService = {
    createRequest: jest.fn(),
  } as jest.Mocked<Pick<WithdrawalRequestService, 'createRequest'>>;

  const userService = {
    findById: jest.fn(),
    activateUser: jest.fn(),
    comparePassword: jest.fn(),
  } as jest.Mocked<Pick<UserService, 'findById' | 'activateUser' | 'comparePassword'>>;

  const buildUseCase = () =>
    new RequestWithdrawal(
      withdrawalRequestService as unknown as WithdrawalRequestService,
      userService as unknown as UserService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawalRequestService.createRequest.mockResolvedValue(mockRequest);
    userService.comparePassword.mockResolvedValue(true);
    userService.findById.mockResolvedValue(buildUser());
  });

  it('activates pending users after creating a withdrawal request', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(buildUser({ status: 'PENDING_VERIFICATION' }));

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(result).toBe(mockRequest);
    expect(userService.activateUser).toHaveBeenCalledWith('user-1');
  });

  it('skips activation when user is already verified', async () => {
    const useCase = buildUseCase();

    await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(userService.activateUser).not.toHaveBeenCalled();
  });

  it('rejects when the user is not found', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(null);

    await expect(useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'any')).rejects.toBeInstanceOf(AppError);
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('requires password when preference is true', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(
      buildUser({ preferences: { requireWithdrawPassword: true } }),
    );

    await expect(useCase.execute('user-1', 50, 'BRL' as Currency)).rejects.toBeInstanceOf(AppError);
    expect(userService.comparePassword).not.toHaveBeenCalled();
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('skips password validation when preference explicitly false', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(
      buildUser({ preferences: { requireWithdrawPassword: false } }),
    );

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency);

    expect(result).toBe(mockRequest);
    expect(userService.comparePassword).not.toHaveBeenCalled();
  });

  it('proceeds with password when preference is null and password valid', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(buildUser({ preferences: { requireWithdrawPassword: null } }));

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');
    expect(result).toBe(mockRequest);
    expect(withdrawalRequestService.createRequest).toHaveBeenCalled();
  });
});
