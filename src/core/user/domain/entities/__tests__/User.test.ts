import { User } from '../User';
import { Email } from '../../value-objects/Email';
import { UserStatus } from '@/core/user/types/user.types';

describe('User Entity', () => {
  let user: User;
  const mockData = {
    id: 'test-id',
    email: new Email('test@example.com'),
    username: 'testuser',
    passwordHash: 'hashed-password',
    status: 'ACTIVE' as UserStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    pixKey: 'user@pix.key',
  };

  beforeEach(() => {
    user = new User(
      mockData.id,
      mockData.email,
      mockData.username,
      mockData.passwordHash,
      mockData.status,
      mockData.createdAt,
      mockData.updatedAt,
      mockData.pixKey,
    );
  });

  describe('constructor', () => {
    it('should create a user with valid data', () => {
      expect(user.id).toBe(mockData.id);
      expect(user.email).toBe(mockData.email);
      expect(user.username).toBe(mockData.username);
      expect(user.status).toBe(mockData.status);
      expect(user.createdAt).toBe(mockData.createdAt);
      expect(user.updatedAt).toBe(mockData.updatedAt);
    });
  });

  describe('canOperate', () => {
    it('should return true when user status is ACTIVE', () => {
      expect(user.canOperate()).toBe(true);
    });

    it('should return false when user status is SUSPENDED', () => {
      user.status = 'SUSPENDED';
      expect(user.canOperate()).toBe(false);
    });

    it('should return true when user status is PENDING_VERIFICATION', () => {
      user.status = 'PENDING_VERIFICATION';
      expect(user.canOperate()).toBe(true);
    });
  });

  describe('suspend', () => {
    it('should change user status to SUSPENDED and update updatedAt', () => {
      const beforeUpdate = user.updatedAt;
      user.suspend();
      expect(user.status).toBe('SUSPENDED');
      expect(user.updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });
  });

  describe('updatePixKey', () => {
    it('should store a trimmed pix key and update updatedAt', () => {
      const beforeUpdate = user.updatedAt;
      user.updatePixKey('  key@example.com  ');
      expect(user.pixKey).toBe('key@example.com');
      expect(user.updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });

    it('should clear pix key when null provided', () => {
      user.updatePixKey(null);
      expect(user.pixKey).toBeNull();
    });
  });

  describe('activate', () => {
    it('should change user status to ACTIVE and update updatedAt', () => {
      user.status = 'SUSPENDED';
      const beforeUpdate = user.updatedAt;
      user.activate();
      expect(user.status).toBe('ACTIVE');
      expect(user.updatedAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });
  });

  describe('toDTO', () => {
    it('should convert user to DTO format', () => {
      const dto = user.toDTO();
      expect(dto).toEqual({
        id: mockData.id,
        email: mockData.email.toString(),
        username: mockData.username,
        status: mockData.status,
        createdAt: mockData.createdAt,
        updatedAt: mockData.updatedAt,
        pixKey: mockData.pixKey,
      });
    });
  });
});
