import { Email } from '../value-objects/Email';
import { IUserDTO, UserStatus } from '../../types/user.types';

export class User {
  // ...
  setPassword(newPassword: string) {
    // Aqui deveria ser feito o hash, mas para teste simples:
    this.passwordHash = newPassword;
  }
  constructor(
    public readonly id: string,
    public email: Email,
    public username: string,
    public passwordHash: string,
    public status: UserStatus,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public pixKey: string | null = null,
    public documents: Array<{
      id: string;
      type?: string | null;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
      uploadedAt: string;
      verified?: boolean;
    }> = [],
    public preferences: {
      emailNotifications: boolean;
      smsNotifications: boolean;
      marketingEmails: boolean;
      requireWithdrawPassword?: boolean | null;
    } = {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: false,
      requireWithdrawPassword: null,
    },
    public passwordRecovery?: {
      token: string;
      expiresAt: Date;
    },
    public pixUpdatedAt?: Date | null,
  ) {}

  canOperate(): boolean {
    return this.status !== 'SUSPENDED';
  }

  suspend(): void {
    this.status = 'SUSPENDED';
    this.updatedAt = new Date();
  }

  activate(): void {
    this.status = 'ACTIVE';
    this.updatedAt = new Date();
  }

  updatePixKey(pixKey: string | null): void {
    this.pixKey = pixKey ? pixKey.trim() : null;
    this.pixUpdatedAt = new Date();
    this.updatedAt = new Date();
  }

  addDocument(doc: {
    id: string;
    type?: string | null;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string;
    uploadedAt: string;
    verified?: boolean;
  }): void {
    this.documents.push(doc);
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
      pixKey: this.pixKey,
      pixUpdatedAt: this.pixUpdatedAt ?? null,
      documents: this.documents,
      preferences: this.preferences,
    };
  }
}
