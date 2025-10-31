import { IWalletDTO } from "@/core/finance/types/wallet.types";

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface IUserDTO {
  id: string;
  email: string;
  username: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateUserDTO {
  email: string;
  username: string;
  currency?: string;
}

export interface IUserResponseDTO {
  user: IUserDTO;
  wallet: IWalletDTO;
}