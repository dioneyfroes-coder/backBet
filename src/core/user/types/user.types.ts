import { IWalletDTO } from '@/core/finance/types/wallet.types';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface IUserDTO {
  id: string;
  email: string;
  username: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  pixKey?: string | null;
  documents?: IUserDocumentDTO[];
  preferences?: IUserPreferences;
}

export interface ICreateUserDTO {
  email: string;
  username: string;
  password?: string;
  currency?: string;
}

export interface IUserResponseDTO {
  user: IUserDTO;
  wallet: IWalletDTO;
}

export interface IUserDocumentDTO {
  id: string;
  type?: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: string;
  verified?: boolean;
}

export interface IUserPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  requireWithdrawPassword?: boolean | null; // per-user override (optional, nullable)
}
