import 'dotenv/config';
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { IEventRepository } from '@/core/betting/domain/repositories/IEventRepository';
import { ICreditPackageRepository } from '@/core/finance/domain/repositories/ICreditPackageRepository';
import { IWithdrawalRequestRepository } from '@/core/finance/domain/repositories/IWithdrawalRequestRepository';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IGameRoundRepository } from '@/core/game/domain/repositories/IGameRoundRepository';
import { IHouseTreasuryRepository } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { IIdentityVerificationRepository } from '@/core/compliance/domain/repositories/IIdentityVerificationRepository';
import { IResponsibleGamblingRepository } from '@/core/responsibleGambling/domain/repositories/IResponsibleGamblingRepository';

const USE_MONGOOSE = process.env.USE_MONGOOSE_PERSISTENCE === 'true';

// Lazy imports to avoid loading mongoose models when not needed
export async function createUserRepository(): Promise<IUserRepository> {
  if (USE_MONGOOSE) {
    const { MongooseUserRepository } = await import(
      './mongoose/repositories/MongooseUserRepository'
    );
    return new MongooseUserRepository();
  }
  const { UserRepository } = await import('@/core/user/domain/repositories/UserRepository');
  return new UserRepository();
}

export async function createWalletRepository(): Promise<IWalletRepository> {
  if (USE_MONGOOSE) {
    const { MongooseWalletRepository } = await import(
      './mongoose/repositories/MongooseWalletRepository'
    );
    return new MongooseWalletRepository();
  }
  const { WalletRepository } = await import('@/core/finance/domain/repositories/WalletRepository');
  return new WalletRepository();
}

export async function createLedgerRepository(): Promise<ILedgerRepository> {
  if (USE_MONGOOSE) {
    const { MongooseLedgerRepository } = await import(
      './mongoose/repositories/MongooseLedgerRepository'
    );
    return new MongooseLedgerRepository();
  }
  const { InMemoryLedgerRepository } = await import(
    '@/core/finance/domain/repositories/InMemoryLedgerRepository'
  );
  return new InMemoryLedgerRepository();
}

export async function createBetRepository(): Promise<IBetRepository> {
  if (USE_MONGOOSE) {
    const { MongooseBetRepository } = await import('./mongoose/repositories/MongooseBetRepository');
    return new MongooseBetRepository();
  }
  const { BetRepository } = await import('@/core/betting/domain/repositories/BetRepository');
  return new BetRepository();
}

export async function createEventRepository(): Promise<IEventRepository> {
  // Events currently only have in-memory implementation
  const { EventRepository } = await import('@/core/betting/domain/repositories/EventRepository');
  return new EventRepository();
}

export async function createCreditPackageRepository(): Promise<ICreditPackageRepository> {
  if (USE_MONGOOSE) {
    const { MongooseCreditPackageRepository } = await import(
      './mongoose/repositories/MongooseCreditPackageRepository'
    );
    return new MongooseCreditPackageRepository();
  }
  const { CreditPackageRepository } = await import(
    '@/core/finance/domain/repositories/CreditPackageRepository'
  );
  return new CreditPackageRepository();
}

export async function createWithdrawalRequestRepository(): Promise<IWithdrawalRequestRepository> {
  if (USE_MONGOOSE) {
    const { MongooseWithdrawalRequestRepository } = await import(
      './mongoose/repositories/MongooseWithdrawalRequestRepository'
    );
    return new MongooseWithdrawalRequestRepository();
  }
  const { WithdrawalRequestRepository } = await import(
    '@/core/finance/domain/repositories/WithdrawalRequestRepository'
  );
  return new WithdrawalRequestRepository();
}

export async function createRiskRepository(): Promise<IRiskRepository> {
  if (USE_MONGOOSE) {
    const { MongooseRiskRepository } = await import(
      './mongoose/repositories/MongooseRiskRepository'
    );
    return new MongooseRiskRepository();
  }
  const { InMemoryRiskRepository } = await import('./inmemory/repositories/InMemoryRiskRepository');
  return new InMemoryRiskRepository();
}

export async function createGameRoundRepository(): Promise<IGameRoundRepository> {
  // Ainda não há implementação Mongoose
  const { InMemoryGameRoundRepository } = await import(
    '@/core/game/domain/repositories/InMemoryGameRoundRepository'
  );
  return new InMemoryGameRoundRepository();
}

export async function createHouseTreasuryRepository(): Promise<IHouseTreasuryRepository> {
  if (USE_MONGOOSE) {
    const { MongooseHouseTreasuryRepository } = await import(
      './mongoose/repositories/MongooseHouseTreasuryRepository'
    );
    return new MongooseHouseTreasuryRepository();
  }
  const { HouseTreasuryRepository } = await import(
    '@/core/treasury/domain/repositories/HouseTreasuryRepository'
  );
  return new HouseTreasuryRepository();
}

export async function createIdentityVerificationRepository(): Promise<IIdentityVerificationRepository> {
  if (USE_MONGOOSE) {
    const { MongooseIdentityVerificationRepository } = await import(
      './mongoose/repositories/MongooseIdentityVerificationRepository'
    );
    return new MongooseIdentityVerificationRepository();
  }
  const { IdentityVerificationRepository } = await import(
    '@/core/compliance/domain/repositories/IdentityVerificationRepository'
  );
  return new IdentityVerificationRepository();
}

export async function createResponsibleGamblingRepository(): Promise<IResponsibleGamblingRepository> {
  if (USE_MONGOOSE) {
    const { MongooseResponsibleGamblingProfileRepository } = await import(
      './mongoose/repositories/MongooseResponsibleGamblingProfileRepository'
    );
    return new MongooseResponsibleGamblingProfileRepository();
  }
  const { ResponsibleGamblingRepository } = await import(
    '@/core/responsibleGambling/domain/repositories/ResponsibleGamblingRepository'
  );
  return new ResponsibleGamblingRepository();
}
