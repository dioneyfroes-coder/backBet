import { RequestWithdrawal } from '../RequestWithdrawal';
import { WithdrawalRequestService } from '../../../domain/services/WithdrawalRequestService';
import { UserService } from '../../../../user/domain/services/UserService';
import { Currency } from '../../../domain/value-objects/Currency';
import { AppError } from '@/shared/errors/AppError';

const mockRequest = { id: 'req-1' } as any;

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
  });

  it('activates pending users after creating a withdrawal request', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue({ status: 'PENDING_VERIFICATION' } as any);

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(result).toBe(mockRequest);
    expect(userService.activateUser).toHaveBeenCalledWith('user-1');
  });

  it('skips activation when user is already verified', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue({ status: 'ACTIVE' } as any);

    await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(userService.activateUser).not.toHaveBeenCalled();
  });

  it('silently ignores missing users', async () => {
    const useCase = buildUseCase();
    // first call: password validation (return a user), second call: verifyUserIfPending (return null)
    (userService.findById as jest.Mock)
      .mockResolvedValueOnce({ id: 'user-1' } as any)
      .mockResolvedValueOnce(null);

    await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(userService.activateUser).not.toHaveBeenCalled();
  });

  it('requires password when configured and rejects missing password with 403', async () => {
    const useCase = buildUseCase();
    // If no password provided and requirement is enabled, should throw AppError 403
    await expect(useCase.execute('user-1', 50, 'BRL' as Currency)).rejects.toBeInstanceOf(AppError);
    try {
      await useCase.execute('user-1', 50, 'BRL' as Currency);
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('rejects when password is invalid', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue({ id: 'user-1' } as any);
    userService.comparePassword.mockResolvedValue(false);

    await expect(
      useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'wrong'),
    ).rejects.toBeInstanceOf(AppError);
    try {
      await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'wrong');
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('proceeds when password is valid', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue({ id: 'user-1' } as any);
    userService.comparePassword.mockResolvedValue(true);

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');
    expect(result).toBe(mockRequest);
    expect(withdrawalRequestService.createRequest).toHaveBeenCalled();
  });
});
