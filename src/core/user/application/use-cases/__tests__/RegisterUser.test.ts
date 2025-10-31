import { RegisterUser } from '../RegisterUser';
import { UserService } from '../../../domain/services/UserService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { User } from '../../../domain/entities/User';
import { Email } from '../../../domain/value-objects/Email';
import { Wallet } from '@/core/finance/domain/entities/Wallet';

jest.mock('../../../domain/services/UserService');
jest.mock('@/core/finance/domain/services/WalletService');

describe('RegisterUser Use Case', () => {
  let registerUser: RegisterUser;
  let mockUserService: jest.Mocked<UserService>;
  let mockWalletService: jest.Mocked<WalletService>;

  beforeEach(() => {
    mockUserService = new UserService({} as any) as jest.Mocked<UserService>;
    mockWalletService = new WalletService({} as any) as jest.Mocked<WalletService>;
    registerUser = new RegisterUser(mockUserService, mockWalletService);
  });

  it('should register user and create wallet successfully', async () => {
    const input = {
      email: 'test@example.com',
      username: 'testuser',
      currency: 'BRL',
    };

    const mockUser = new User(
      'test-id',
      new Email(input.email),
      input.username,
      'PENDING_VERIFICATION',
      new Date(),
      new Date(),
    );

    const mockWallet = new Wallet('test-id', 'BRL');

    mockUserService.registerUser.mockResolvedValue(mockUser);
    mockWalletService.createWallet.mockResolvedValue(mockWallet);

    const result = await registerUser.execute(input);

    expect(result.user).toEqual(mockUser.toDTO());
    expect(result.wallet).toEqual(mockWallet.toDTO());
    expect(mockUserService.registerUser).toHaveBeenCalledWith(input);
    expect(mockWalletService.createWallet).toHaveBeenCalledWith({
      userId: mockUser.id,
      currency: input.currency,
    });
  });

  it('should use default currency when not provided', async () => {
    const input = {
      email: 'test@example.com',
      username: 'testuser',
    };

    const mockUser = new User(
      'test-id',
      new Email(input.email),
      input.username,
      'PENDING_VERIFICATION',
      new Date(),
      new Date(),
    );

    const mockWallet = new Wallet('test-id', 'BRL');

    mockUserService.registerUser.mockResolvedValue(mockUser);
    mockWalletService.createWallet.mockResolvedValue(mockWallet);

    await registerUser.execute(input);

    expect(mockWalletService.createWallet).toHaveBeenCalledWith({
      userId: mockUser.id,
      currency: 'BRL',
    });
  });

  it('should propagate errors from UserService', async () => {
    const error = new Error('User service error');
    mockUserService.registerUser.mockRejectedValue(error);

    await expect(registerUser.execute({
      email: 'test@example.com',
      username: 'testuser',
    })).rejects.toThrow(error);

    expect(mockWalletService.createWallet).not.toHaveBeenCalled();
  });

  it('should propagate errors from WalletService', async () => {
    const mockUser = new User(
      'test-id',
      new Email('test@example.com'),
      'testuser',
      'PENDING_VERIFICATION',
      new Date(),
      new Date(),
    );

    const error = new Error('Wallet service error');
    mockUserService.registerUser.mockResolvedValue(mockUser);
    mockWalletService.createWallet.mockRejectedValue(error);

    await expect(registerUser.execute({
      email: 'test@example.com',
      username: 'testuser',
    })).rejects.toThrow(error);
  });
});