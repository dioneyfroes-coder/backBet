import { RequestWithdrawal } from '../RequestWithdrawal';
import { WithdrawalRequestService } from '../../../domain/services/WithdrawalRequestService';
import { UserService } from '../../../../user/domain/services/UserService';
import { Currency } from '../../../domain/value-objects/Currency';

const mockRequest = { id: 'req-1' } as any;

describe('RequestWithdrawal', () => {
  const withdrawalRequestService = {
    createRequest: jest.fn(),
  } as jest.Mocked<Pick<WithdrawalRequestService, 'createRequest'>>;

  const userService = {
    findById: jest.fn(),
    activateUser: jest.fn(),
  } as jest.Mocked<Pick<UserService, 'findById' | 'activateUser'>>;

  const buildUseCase = () =>
    new RequestWithdrawal(
      withdrawalRequestService as unknown as WithdrawalRequestService,
      userService as unknown as UserService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    withdrawalRequestService.createRequest.mockResolvedValue(mockRequest);
  });

  it('activates pending users after creating a withdrawal request', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue({ status: 'PENDING_VERIFICATION' } as any);

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency);

    expect(result).toBe(mockRequest);
    expect(userService.activateUser).toHaveBeenCalledWith('user-1');
  });

  it('skips activation when user is already verified', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue({ status: 'ACTIVE' } as any);

    await useCase.execute('user-1', 50, 'BRL' as Currency);

    expect(userService.activateUser).not.toHaveBeenCalled();
  });

  it('silently ignores missing users', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue(null);

    await useCase.execute('user-1', 50, 'BRL' as Currency);

    expect(userService.activateUser).not.toHaveBeenCalled();
  });
});
