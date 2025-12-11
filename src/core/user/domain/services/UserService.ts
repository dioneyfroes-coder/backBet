import { User } from '../entities/User';
import { IUserRepository } from '../repositories/IUserRepository';
import { Email } from '../value-objects/Email';
import { ICreateUserDTO, UserStatus } from '../../types/user.types';
import { AppError } from '@/shared/errors/AppError';
import { userConfig } from '../../config/user-config';
import bcrypt from 'bcryptjs';

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async registerUser(input: ICreateUserDTO): Promise<User> {
    const emailExists = await this.userRepository.findByEmail(input.email);
    if (emailExists) {
      throw new AppError('CONFLICT', 'Email already exists', 409);
    }

    let passwordHash = '';
    const shouldAutoActivate = userConfig.autoActivateSignups;
    let status: UserStatus = shouldAutoActivate ? 'ACTIVE' : 'PENDING_VERIFICATION';

    if (input.password) {
      if (input.password.length < userConfig.minPasswordLength) {
        throw new AppError(
          'BAD_REQUEST',
          `Senha deve ter pelo menos ${userConfig.minPasswordLength} caracteres`,
          400,
        );
      }
      passwordHash = await bcrypt.hash(input.password, 12);
      status = shouldAutoActivate ? 'ACTIVE' : 'PENDING_VERIFICATION';
    } else {
      // Accounts created via Clerk (lazy creation) do not store a local password
      // and are considered immediately active because identity is managed by Clerk.
      passwordHash = '';
      status = 'ACTIVE';
    }

    const user = new User(
      crypto.randomUUID(),
      new Email(input.email),
      input.username,
      passwordHash,
      status,
      new Date(),
      new Date(),
      null,
    );

    await this.userRepository.save(user);
    return user;
  }

  async suspendUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    if (user.status === 'SUSPENDED')
      throw new AppError('BAD_REQUEST', 'User is already suspended', 400);

    user.status = 'SUSPENDED';
    await this.userRepository.update(user);
  }

  async activateUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    if (user.status === 'ACTIVE') throw new AppError('BAD_REQUEST', 'User is already active', 400);

    user.status = 'ACTIVE';
    await this.userRepository.update(user);
  }

  async updateProfile(userId: string, updateData: { username: string }): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    if (user.status === 'SUSPENDED') throw new AppError('BAD_REQUEST', 'User is suspended', 400);

    user.username = updateData.username;
    await this.userRepository.update(user);
  }

  async changeEmail(userId: string, newEmail: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    if (user.status === 'SUSPENDED') throw new AppError('BAD_REQUEST', 'User is suspended', 400);

    const emailExists = await this.userRepository.findByEmail(newEmail);
    if (emailExists) throw new AppError('CONFLICT', 'Email already exists', 409);

    user.email = new Email(newEmail);
    await this.userRepository.update(user);
  }

  async updatePixKey(userId: string, pixKey: string | null | undefined): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError('BAD_REQUEST', 'User is suspended', 400);
    }

    const sanitizedKey = this.normalizePixKey(pixKey);
    user.updatePixKey(sanitizedKey);
    await this.userRepository.update(user);
    return user;
  }

  async addDocument(userId: string, document: {
    id: string;
    type?: string | null;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    uploadedAt: string;
    verified?: boolean;
  }): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    if (user.status === 'SUSPENDED') throw new AppError('BAD_REQUEST', 'User is suspended', 400);

    user.addDocument(document);
    await this.userRepository.update(user);
  }

  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async comparePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  private normalizePixKey(pixKey: string | null | undefined): string | null {
    if (pixKey === null || pixKey === undefined) {
      return null;
    }
    const trimmed = pixKey.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length < 5 || trimmed.length > 140) {
      throw new AppError('BAD_REQUEST', 'Chave Pix deve ter entre 5 e 140 caracteres', 400);
    }
    const allowed = /^[A-Za-z0-9@.+\-_:]{3,}$/;
    if (!allowed.test(trimmed)) {
      throw new AppError('BAD_REQUEST', 'Chave Pix contém caracteres inválidos', 400);
    }
    return trimmed;
  }
}
