import { User } from '../User';
import { Email } from '../../value-objects/Email';
import { UserStatus } from '@/core/user/types/user.types';

describe('User Entity', () => {
  let user: User;
  const mockData = {
    id: 'test-id',
    email: new Email('test@example.com'),
    username: 'testuser',
    status: 'ACTIVE' as UserStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    user = new User(
      mockData.id,
      mockData.email,
      mockData.username,
      mockData.status,
      mockData.createdAt,
      mockData.updatedAt,
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

    it('should return false when user status is PENDING_VERIFICATION', () => {
      user.status = 'PENDING_VERIFICATION';
      expect(user.canOperate()).toBe(false);
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
      });
    });
  });
});