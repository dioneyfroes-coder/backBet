#!/usr/bin/env tsx
import { startContactWorker } from '@/infrastructure/mailer/ContactWorker';

async function main() {
  try {
    console.log('Starting Contact worker...');
    const queue = startContactWorker();
    // keep process alive
    process.on('SIGINT', async () => {
      console.log('Shutting down Contact worker...');
      try {
        await queue.close();
      } catch (err) {
        // ignore
      }
      process.exit(0);
    });
  } catch (err) {
    console.error('Failed to start Contact worker', err);
    process.exit(1);
  }
}

main();
