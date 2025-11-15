import { User } from '../entities/User';
import { IUserRepository } from '../repositories/IUserRepository';
import { Email } from '../value-objects/Email';
import { ICreateUserDTO } from '../../types/user.types';
import { AppError } from '@/shared/errors/AppError';

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async registerUser(input: ICreateUserDTO): Promise<User> {
    const emailExists = await this.userRepository.findByEmail(input.email);
    if (emailExists) {
      throw new AppError('CONFLICT', 'Email already exists', 409);
    }

    const user = new User(
      crypto.randomUUID(),
      new Email(input.email),
      input.username,
      'PENDING_VERIFICATION',
      new Date(),
      new Date(),
    );

    await this.userRepository.save(user);
    return user;
  }

  async suspendUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  if (user.status === 'SUSPENDED') throw new AppError('BAD_REQUEST', 'User is already suspended', 400);

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

  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }
}
