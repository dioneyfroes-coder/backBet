import 'dotenv/config';
import { appConfig } from '@/shared/config/appConfig';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { createHouseTreasuryRepository } from '@/infrastructure/persistence/factory';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';

const USE_MONGOOSE = process.env.USE_MONGOOSE_PERSISTENCE === 'true';

type ParsedArgs = {
  amount: number;
  description: string;
};

function parseArgs(): ParsedArgs {
  const [, , amountArg, ...descriptionParts] = process.argv;
  const amount = Number(amountArg);

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('✗ Informe um valor numérico positivo. Ex: npm run seed:treasury -- 5000 "Seed inicial"');
    process.exit(1);
  }

  const description = descriptionParts.join(' ').trim() || 'Initial treasury seed';
  return { amount, description };
}

async function ensureMongoConnection() {
  if (!USE_MONGOOSE) {
    return;
  }

  const cfg = getMongoDBConfig();
  await connectMongoDB(cfg);
}

async function main() {
  const { amount, description } = parseArgs();
  await ensureMongoConnection();

  try {
    const repository = await createHouseTreasuryRepository();
    const treasuryService = new HouseTreasuryService(repository, {
      walletId: appConfig.treasury.walletId,
      currency: appConfig.treasury.currency,
    });

    const before = await treasuryService.getSnapshot();
    const after = await treasuryService.recordProfit(amount, description, {
      context: 'seed-script',
      source: 'seedHouseTreasury',
    });

    console.log('✅ Seed aplicado com sucesso');
    console.log('Carteira:', after.walletId);
    console.log('Descrição:', description);
    console.log('Valor adicionado (lucro):', amount);
    console.table({
      profitBefore: before.profitBalance,
      profitAfter: after.profitBalance,
      prizeReserveBefore: before.prizeReserveBalance,
      prizeReserveAfter: after.prizeReserveBalance,
    });
  } catch (error) {
    console.error('✗ Falha ao semear treasury:', error);
    process.exitCode = 1;
  } finally {
    if (USE_MONGOOSE) {
      await disconnectMongoDB();
    }
  }
}

main();
