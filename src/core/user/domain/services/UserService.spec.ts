import { UserService } from './UserService';
import { IUserRepository } from '../repositories/IUserRepository';
import { Email } from '../value-objects/Email';
import { User } from '../entities/User';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn()
    };
    userService = new UserService(mockUserRepository);
  });

  describe('registerUser', () => {
    const validInput = {
      email: 'test@example.com',
      username: 'testuser'
    };

    it('deve criar um novo usuário com sucesso', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(undefined);

      const result = await userService.registerUser(validInput);

      expect(result).toBeInstanceOf(User);
      expect(result.email.value).toBe(validInput.email);
      expect(result.username).toBe(validInput.username);
      expect(result.status).toBe('PENDING_VERIFICATION');
      expect(mockUserRepository.save).toHaveBeenCalledWith(expect.any(User));
    });

    it('deve lançar erro se o email já existir', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(new User(
        '1',
        new Email('test@example.com'),
        'existinguser',
        'ACTIVE',
        new Date(),
        new Date()
      ));

      await expect(userService.registerUser(validInput))
        .rejects
        .toThrow('Email already exists');

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('suspendUser', () => {
    it('deve suspender um usuário ativo com sucesso', async () => {
      const user = new User(
        '1',
        new Email('test@example.com'),
        'testuser',
        'ACTIVE',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(undefined);

      await userService.suspendUser('1');

      expect(user.status).toBe('SUSPENDED');
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('deve lançar erro se o usuário não existir', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.suspendUser('1'))
        .rejects
        .toThrow('User not found');
    });

    it('deve lançar erro se o usuário já estiver suspenso', async () => {
      const user = new User(
        '1',
        new Email('test@example.com'),
        'testuser',
        'SUSPENDED',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.suspendUser('1'))
        .rejects
        .toThrow('User is already suspended');
    });
  });

  describe('activateUser', () => {
    it('deve ativar um usuário pendente com sucesso', async () => {
      const user = new User(
        '1',
        new Email('test@example.com'),
        'testuser',
        'PENDING_VERIFICATION',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(undefined);

      await userService.activateUser('1');

      expect(user.status).toBe('ACTIVE');
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('deve lançar erro se o usuário não existir', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.activateUser('1'))
        .rejects
        .toThrow('User not found');
    });

    it('deve lançar erro se o usuário já estiver ativo', async () => {
      const user = new User(
        '1',
        new Email('test@example.com'),
        'testuser',
        'ACTIVE',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.activateUser('1'))
        .rejects
        .toThrow('User is already active');
    });
  });

  describe('updateProfile', () => {
    it('deve atualizar o perfil do usuário com sucesso', async () => {
      const user = new User(
        '1',
        new Email('test@example.com'),
        'oldusername',
        'ACTIVE',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.update.mockResolvedValue(undefined);

      await userService.updateProfile('1', { username: 'newusername' });

      expect(user.username).toBe('newusername');
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('deve lançar erro se o usuário não existir', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.updateProfile('1', { username: 'newusername' }))
        .rejects
        .toThrow('User not found');
    });

    it('deve lançar erro se o usuário estiver suspenso', async () => {
      const user = new User(
        '1',
        new Email('test@example.com'),
        'testuser',
        'SUSPENDED',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.updateProfile('1', { username: 'newusername' }))
        .rejects
        .toThrow('User is suspended');
    });
  });

  describe('changeEmail', () => {
    it('deve alterar o email do usuário com sucesso', async () => {
      const user = new User(
        '1',
        new Email('old@example.com'),
        'testuser',
        'ACTIVE',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.update.mockResolvedValue(undefined);

      await userService.changeEmail('1', 'new@example.com');

      expect(user.email.value).toBe('new@example.com');
      expect(mockUserRepository.update).toHaveBeenCalledWith(user);
    });

    it('deve lançar erro se o usuário não existir', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(userService.changeEmail('1', 'new@example.com'))
        .rejects
        .toThrow('User not found');
    });

    it('deve lançar erro se o usuário estiver suspenso', async () => {
      const user = new User(
        '1',
        new Email('old@example.com'),
        'testuser',
        'SUSPENDED',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);

      await expect(userService.changeEmail('1', 'new@example.com'))
        .rejects
        .toThrow('User is suspended');
    });

    it('deve lançar erro se o novo email já existir', async () => {
      const user = new User(
        '1',
        new Email('old@example.com'),
        'testuser',
        'ACTIVE',
        new Date(),
        new Date()
      );
      mockUserRepository.findById.mockResolvedValue(user);
      mockUserRepository.findByEmail.mockResolvedValue(new User(
        '2',
        new Email('new@example.com'),
        'otheruser',
        'ACTIVE',
        new Date(),
        new Date()
      ));

      await expect(userService.changeEmail('1', 'new@example.com'))
        .rejects
        .toThrow('Email already exists');
    });
  });
});