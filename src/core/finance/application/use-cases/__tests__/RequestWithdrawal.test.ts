describe('validação de valor de saque', () => {
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
    withdrawalRequestService.createRequest.mockResolvedValue({ id: 'req-1' } as any);
    userService.comparePassword.mockResolvedValue(true);
    userService.findById.mockResolvedValue(
      new User(
        'user-1',
        new Email('user1@example.com'),
        'user1',
        'hash',
        'ACTIVE',
        new Date(),
        new Date(),
        null,
        [],
        {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: null,
        },
      ),
    );
  });

  it('rejeita saque com valor negativo', async () => {
    const useCase = buildUseCase();
    await expect(
      useCase.execute('user-1', -10, 'BRL' as Currency, undefined, 'senha'),
    ).rejects.toThrow(AppError);
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('rejeita saque com valor zero', async () => {
    const useCase = buildUseCase();
    await expect(
      useCase.execute('user-1', 0, 'BRL' as Currency, undefined, 'senha'),
    ).rejects.toThrow(AppError);
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });
});
import { RequestWithdrawal } from '../RequestWithdrawal';
import { WithdrawalRequestService } from '../../../domain/services/WithdrawalRequestService';
import { UserService } from '../../../../user/domain/services/UserService';
import { Currency } from '../../../domain/value-objects/Currency';
import { AppError } from '@/shared/errors/AppError';
import { Email } from '../../../../user/domain/value-objects/Email';
import { User } from '../../../../user/domain/entities/User';

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
    userService.findById.mockResolvedValue(
      new User(
        'user-1',
        new Email('user1@example.com'),
        'user1',
        'hash',
        'ACTIVE',
        new Date(),
        new Date(),
        null,
        [],
        {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: null,
        },
      ),
    );
  });

  it('activates pending users BEFORE creating a withdrawal request', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(
      new User(
        'user-1',
        new Email('user1@example.com'),
        'user1',
        'hash',
        'PENDING_VERIFICATION',
        new Date(),
        new Date(),
        null,
        [],
        {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: null,
        },
      ),
    );

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(result).toBe(mockRequest);
    expect(userService.activateUser).toHaveBeenCalledWith('user-1');
    const activateOrder = (userService.activateUser as jest.Mock).mock.invocationCallOrder[0];
    const createOrder = (withdrawalRequestService.createRequest as jest.Mock).mock
      .invocationCallOrder[0];
    expect(activateOrder).toBeLessThan(createOrder);
  });

  it('skips activation when user is already verified', async () => {
    const useCase = buildUseCase();

    await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');

    expect(userService.activateUser).not.toHaveBeenCalled();
  });

  it('rejects when the user is not found', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(null);

    await expect(
      useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'any'),
    ).rejects.toBeInstanceOf(AppError);
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('requires password when preference is true', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValue(
      new User(
        'user-1',
        new Email('user1@example.com'),
        'user1',
        'hash',
        'ACTIVE',
        new Date(),
        new Date(),
        null,
        [],
        {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: true,
        },
      ),
    );
    await expect(useCase.execute('user-1', 50, 'BRL' as Currency)).rejects.toBeInstanceOf(AppError);
    expect(userService.comparePassword).not.toHaveBeenCalled();
    expect(withdrawalRequestService.createRequest).not.toHaveBeenCalled();
  });

  it('proceeds with password when preference is null and password valid', async () => {
    const useCase = buildUseCase();
    userService.findById.mockResolvedValueOnce(
      new User(
        'user-1',
        new Email('user1@example.com'),
        'user1',
        'hash',
        'ACTIVE',
        new Date(),
        new Date(),
        null,
        [],
        {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: null,
        },
      ),
    );

    const result = await useCase.execute('user-1', 50, 'BRL' as Currency, undefined, 'correct');
    expect(result).toBe(mockRequest);
    expect(withdrawalRequestService.createRequest).toHaveBeenCalled();
  });
});
