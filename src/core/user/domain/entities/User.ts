import { Email } from '../value-objects/Email';
import { IUserDTO, UserStatus } from '../../types/user.types';

export class User {
  constructor(
    public readonly id: string,
    public readonly email: Email,
    public username: string,
    public status: UserStatus,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  canOperate(): boolean {
    return this.status === 'ACTIVE';
  }

  suspend(): void {
    this.status = 'SUSPENDED';
    this.updatedAt = new Date();
  }

  activate(): void {
    this.status = 'ACTIVE';
    this.updatedAt = new Date();
  }

  toDTO(): IUserDTO {
    return {
      id: this.id,
      email: this.email.toString(),
      username: this.username,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
