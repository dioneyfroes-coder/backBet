import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { User } from '../entities/User';

// users/domain/repositories/IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
  findByRecoveryToken(token: string): Promise<User | null>;
}

// users/domain/repositories/IWalletRepository.ts
export interface IWalletRepository {
  findByUserId(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  update(wallet: Wallet): Promise<void>;
}
