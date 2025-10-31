import { User } from '../entities/User';
import { IUserRepository } from '../repositories/IUserRepository';
import { Email } from '../value-objects/Email';
import { ICreateUserDTO } from '../../types/user.types';

export class UserService {
  constructor(private userRepository: IUserRepository) {}

  async registerUser(input: ICreateUserDTO): Promise<User> {
    const emailExists = await this.userRepository.findByEmail(input.email);
    if (emailExists) {
      throw new Error('Email already exists');
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
    if (!user) throw new Error('User not found');
    if (user.status === 'SUSPENDED') throw new Error('User is already suspended');

    user.status = 'SUSPENDED';
    await this.userRepository.update(user);
  }

  async activateUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.status === 'ACTIVE') throw new Error('User is already active');

    user.status = 'ACTIVE';
    await this.userRepository.update(user);
  }

  async updateProfile(userId: string, updateData: { username: string }): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.status === 'SUSPENDED') throw new Error('User is suspended');

    user.username = updateData.username;
    await this.userRepository.update(user);
  }

  async changeEmail(userId: string, newEmail: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.status === 'SUSPENDED') throw new Error('User is suspended');

    const emailExists = await this.userRepository.findByEmail(newEmail);
    if (emailExists) throw new Error('Email already exists');

    user.email = new Email(newEmail);
    await this.userRepository.update(user);
  }
}

