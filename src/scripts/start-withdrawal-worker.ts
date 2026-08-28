#!/usr/bin/env tsx
import { startWithdrawalWorker } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import { WithdrawalRequestService } from '@/core/finance/domain/services/WithdrawalRequestService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';
import {
  createWalletRepository,
  createWithdrawalRequestRepository,
  createLedgerRepository,
} from '@/infrastructure/persistence/factory';

async function main() {
  try {
    if (process.env.USE_MONGOOSE_PERSISTENCE === 'true') {
      await connectMongoDB(getMongoDBConfig());
    }

    const withdrawalRequestRepository = await createWithdrawalRequestRepository();
    const walletRepository = await createWalletRepository();
    const ledgerRepository = await createLedgerRepository();
    const walletService = new WalletService(walletRepository, ledgerRepository);
    const withdrawalRequestService = new WithdrawalRequestService(
      withdrawalRequestRepository,
      walletService,
    );

    console.log('Starting Withdrawal worker...');
    const queue = startWithdrawalWorker(withdrawalRequestService);

    process.on('SIGINT', async () => {
      console.log('Shutting down Withdrawal worker...');
      try {
        await queue.close();
      } catch (err) {
        // ignore
      }
      if (process.env.USE_MONGOOSE_PERSISTENCE === 'true') {
        try {
          await disconnectMongoDB();
        } catch (err) {
          // ignore
        }
      }
      process.exit(0);
    });
  } catch (err) {
    console.error('Failed to start Withdrawal worker', err);
    process.exit(1);
  }
}

main();
