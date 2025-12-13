#!/usr/bin/env tsx
import { startWithdrawalWorker } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';

async function main() {
  try {
    console.log('Starting Withdrawal worker...');
    const queue = startWithdrawalWorker();

    process.on('SIGINT', async () => {
      console.log('Shutting down Withdrawal worker...');
      try {
        await queue.close();
      } catch (err) {
        // ignore
      }
      process.exit(0);
    });
  } catch (err) {
    console.error('Failed to start Withdrawal worker', err);
    process.exit(1);
  }
}

main();
