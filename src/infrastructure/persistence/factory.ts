import 'dotenv/config';

const USE_MONGOOSE = process.env.USE_MONGOOSE_PERSISTENCE === 'true';

// Lazy imports to avoid loading mongoose models when not needed
export async function createUserRepository() {
  if (USE_MONGOOSE) {
    const { MongooseUserRepository } = await import(
      './mongoose/repositories/MongooseUserRepository'
    );
    return new MongooseUserRepository();
  }
  const { UserRepository } = await import('@/core/user/domain/repositories/UserRepository');
  return new UserRepository();
}

export async function createWalletRepository() {
  if (USE_MONGOOSE) {
    const { MongooseWalletRepository } = await import(
      './mongoose/repositories/MongooseWalletRepository'
    );
    return new MongooseWalletRepository();
  }
  const { WalletRepository } = await import('@/core/finance/domain/repositories/WalletRepository');
  return new WalletRepository();
}

export async function createBetRepository() {
  if (USE_MONGOOSE) {
    const { MongooseBetRepository } = await import('./mongoose/repositories/MongooseBetRepository');
    return new MongooseBetRepository();
  }
  const { BetRepository } = await import('@/core/betting/domain/repositories/BetRepository');
  return new BetRepository();
}

export async function createEventRepository() {
  // Events currently only have in-memory implementation
  const { EventRepository } = await import('@/core/betting/domain/repositories/EventRepository');
  return new EventRepository();
}

export async function createCreditPackageRepository() {
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

export async function createWithdrawalRequestRepository() {
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

export async function createRiskRepository() {
  if (USE_MONGOOSE) {
    const { MongooseRiskRepository } = await import('./mongoose/repositories/MongooseRiskRepository');
    return new MongooseRiskRepository();
  }
  const { InMemoryRiskRepository } = await import(
    './inmemory/repositories/InMemoryRiskRepository'
  );
  return new InMemoryRiskRepository();
}
