import { UserService } from '../UserService';
import { User } from '../../entities/User';
import { IUserRepository } from '../../repositories/IUserRepository';
import { Email } from '../../value-objects/Email';
import { UserStatus } from '../../../types/user.types';
import bcrypt from 'bcryptjs';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let mockCreateUserInput: { email: string; username: string; password: string };

  beforeEach(() => {
    mockCreateUserInput = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password123!',
    };

    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    userService = new UserService(mockUserRepository);
  });

  describe('registerUser', () => {
    it('should create a new user when email is not taken', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await userService.registerUser(mockCreateUserInput);

      expect(result).toBeInstanceOf(User);
      expect(result.email).toBeInstanceOf(Email);
      expect(result.email.toString()).toBe(mockCreateUserInput.email);
      expect(result.username).toBe(mockCreateUserInput.username);
      expect(result.status).toBe('ACTIVE');
      expect(mockUserRepository.save).toHaveBeenCalledWith(result);
    });

    it('should throw error when email is already taken', async () => {
      const existingUser = new User(
        'existing-id',
        new Email(mockCreateUserInput.email),
        'existingUser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      await expect(userService.registerUser(mockCreateUserInput)).rejects.toThrow(
        'Email already exists',
      );
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should call generateId when creating user', async () => {
      const randomUUID = '123e4567-e89b-12d3-a456-426614174000';
      const cryptoMock = {
        randomUUID: jest.fn().mockReturnValue(randomUUID),
        subtle: {} as SubtleCrypto,
        getRandomValues: () => new Uint8Array(16),
      };
      globalThis.crypto = cryptoMock as Crypto;

      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await userService.registerUser(mockCreateUserInput);

      expect(result.id).toBe(randomUUID);
      expect(cryptoMock.randomUUID).toHaveBeenCalled();
    });

    it('should set creation and update dates to current time', async () => {
      const now = new Date();
      jest.useFakeTimers();
      jest.setSystemTime(now);

      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await userService.registerUser(mockCreateUserInput);

      expect(result.createdAt).toEqual(now);
      expect(result.updatedAt).toEqual(now);

      jest.useRealTimers();
    });

    it('enforces minimum password length', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        userService.registerUser({ ...mockCreateUserInput, password: '1' }),
      ).rejects.toThrow('Senha deve ter pelo menos');
    });
  });

  describe('updateProfile', () => {
    const userId = 'test-user-id';
    const updateData = {
      username: 'newusername',
    };

    it('should update user profile when found', async () => {
      const user = new User(
        userId,
        new Email('test@example.com'),
        'oldusername',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await userService.updateProfile(userId, updateData);

      expect(user.username).toBe(updateData.username);
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('should throw error when user is not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.updateProfile(userId, updateData)).rejects.toThrow('User not found');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when user is suspended', async () => {
      const user = new User(
        userId,
        new Email('test@example.com'),
        'oldusername',
        'hashed-password',
        'SUSPENDED' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.updateProfile(userId, updateData)).rejects.toThrow(
        'User is suspended',
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('changeEmail', () => {
    const userId = 'test-user-id';
    const newEmail = 'newemail@example.com';

    it('should change user email when email is not taken', async () => {
      const user = new User(
        userId,
        new Email('old@example.com'),
        'testuser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await userService.changeEmail(userId, newEmail);

      expect(user.email.toString()).toBe(newEmail);
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('should throw error when user is not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.changeEmail(userId, newEmail)).rejects.toThrow('User not found');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when new email is already taken', async () => {
      const user = new User(
        userId,
        new Email('old@example.com'),
        'testuser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      const existingUser = new User(
        'other-id',
        new Email(newEmail),
        'otheruser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.findByEmail.mockResolvedValue(existingUser);

      await expect(userService.changeEmail(userId, newEmail)).rejects.toThrow(
        'Email already exists',
      );
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when user is suspended', async () => {
      const user = new User(
        userId,
        new Email('old@example.com'),
        'testuser',
        'hashed-password',
        'SUSPENDED' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.changeEmail(userId, newEmail)).rejects.toThrow('User is suspended');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('suspendUser', () => {
    const userId = 'test-user-id';

    it('should suspend a user successfully', async () => {
      const user = new User(
        userId,
        new Email('test@example.com'),
        'testuser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await userService.suspendUser(userId);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          status: 'SUSPENDED',
        }),
      );
    });

    it('should throw error when user is not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.suspendUser(userId)).rejects.toThrow('User not found');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when user is already suspended', async () => {
      const user = new User(
        userId,
        new Email('test@example.com'),
        'testuser',
        'hashed-password',
        'SUSPENDED' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.suspendUser(userId)).rejects.toThrow('User is already suspended');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('activateUser', () => {
    const userId = 'test-user-id';

    it('should activate a pending user successfully', async () => {
      const user = new User(
        userId,
        new Email('test@example.com'),
        'testuser',
        'hashed-password',
        'PENDING_VERIFICATION' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await userService.activateUser(userId);

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          status: 'ACTIVE',
        }),
      );
    });

    it('should throw error when user is not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.activateUser(userId)).rejects.toThrow('User not found');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('should throw error when user is already active', async () => {
      const user = new User(
        userId,
        new Email('test@example.com'),
        'testuser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.activateUser(userId)).rejects.toThrow('User is already active');
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const userId = 'test-user-id';
      const user = new User(
        userId,
        new Email('test@example.com'),
        'testuser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      const result = await userService.findById(userId);

      expect(result).toEqual(user);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
    });

    it('should return null when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await userService.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return user when email found', async () => {
      const email = 'test@example.com';
      const user = new User(
        'test-id',
        new Email(email),
        'testuser',
        'hashed-password',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findByEmail.mockResolvedValue(user);

      const result = await userService.findByEmail(email);

      expect(result).toEqual(user);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(email);
    });

    it('should return null when email not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const result = await userService.findByEmail('non-existent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('comparePassword', () => {
    it('delegates to bcrypt compare', async () => {
      const password = 'Password123!';
      const hash = await bcrypt.hash(password, 1);
      const user = new User(
        'user',
        new Email('hash@example.com'),
        'user',
        hash,
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );

      await expect(userService.comparePassword(user, password)).resolves.toBe(true);
    });
  });

  describe('updatePixKey', () => {
    const userId = 'user-with-pix';

    it('updates pix key when provided', async () => {
      const user = new User(
        userId,
        new Email('pix@example.com'),
        'userpix',
        'hash',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      const result = await userService.updatePixKey(userId, ' user@pix ');

      expect(result.pixKey).toBe('user@pix');
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('clears pix key when null', async () => {
      const user = new User(
        userId,
        new Email('pix@example.com'),
        'userpix',
        'hash',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
        'old@pix',
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await userService.updatePixKey(userId, null);

      expect(user.pixKey).toBeNull();
    });

    it('throws when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.updatePixKey(userId, 'key')).rejects.toThrow('User not found');
    });

    it('throws when pix key invalid', async () => {
      const user = new User(
        userId,
        new Email('pix@example.com'),
        'userpix',
        'hash',
        'ACTIVE' as UserStatus,
        new Date(),
        new Date(),
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.updatePixKey(userId, '??')).rejects.toThrow('Chave Pix');
    });
  });
});
