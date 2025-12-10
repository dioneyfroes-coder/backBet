import 'dotenv/config';
import { createWalletRepository, createUserRepository } from '@/infrastructure/persistence/factory';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';

const USE_MONGOOSE = process.env.USE_MONGOOSE_PERSISTENCE === 'true';

type ScriptOptions = {
  userId?: string;
  email?: string;
  includeHistory: boolean;
  historyLimit: number;
};

function usage(message?: string): never {
  if (message) {
    console.error(`\n${message}\n`);
  }
  console.info(
    `Uso: npm run wallet:balance -- [--userId <id> | --email <email>] [--history <limit>]`,
  );
  console.info(
    'Obs.: também é possível passar o identificador diretamente (ex.: npm run wallet:balance -- <userId>).',
  );
  process.exit(1);
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    includeHistory: false,
    historyLimit: 10,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--userId':
      case '--user-id':
        options.userId = args[++i];
        break;
      case '--email':
        options.email = args[++i];
        break;
      case '--history': {
        options.includeHistory = true;
        const maybeLimit = args[i + 1];
        if (maybeLimit && !maybeLimit.startsWith('--')) {
          const parsed = Number(maybeLimit);
          if (!Number.isNaN(parsed) && parsed > 0) {
            options.historyLimit = parsed;
            i += 1;
          }
        }
        break;
      }
      case '--help':
      case '-h':
        usage();
        break;
      default:
        if (!options.userId && !options.email) {
          if (arg.includes('@')) {
            options.email = arg;
          } else {
            options.userId = arg;
          }
        } else {
          usage(`Parâmetro desconhecido: ${arg}`);
        }
    }
  }

  if (!options.userId && !options.email) {
    usage('Informe pelo menos --userId ou --email.');
  }

  return options;
}

async function ensureMongoConnection(): Promise<void> {
  if (!USE_MONGOOSE) {
    return;
  }
  const cfg = getMongoDBConfig();
  await connectMongoDB(cfg);
}

async function disconnectMongo(): Promise<void> {
  if (!USE_MONGOOSE) {
    return;
  }
  await disconnectMongoDB();
}

async function main(): Promise<void> {
  const options = parseArgs();
  await ensureMongoConnection();

  try {
    const walletRepository = await createWalletRepository();
    let userId = options.userId;

    if (!userId) {
      const userRepository = await createUserRepository();
      const user = await userRepository.findByEmail(options.email!);
      if (!user) {
        usage(`Usuário com email ${options.email} não encontrado.`);
      }
      userId = user.id;
      console.log(`Usuário localizado: ${user.email.value} (${user.id})`);
    }

    const wallet = await walletRepository.findByUserId(userId!);
    if (!wallet) {
      console.error(`✗ Carteira não encontrada para o usuário ${userId}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nSaldo atual da carteira:');
    console.table({
      userId: wallet.userId,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      currency: wallet.currency,
    });

    if (options.includeHistory) {
      const { transactions, total } = await walletRepository.getHistory(
        wallet.userId,
        options.historyLimit,
        0,
      );
      console.log(`\nÚltimas ${transactions.length} transações (total registradas: ${total}):`);
      transactions.forEach((tx, idx) => {
        const createdAtValue =
          tx.createdAt instanceof Date
            ? tx.createdAt.toISOString()
            : typeof tx.createdAt === 'string'
              ? tx.createdAt
              : String(tx.createdAt);
        console.log(
          `${idx + 1}. ${tx.type} | id=${tx.id} | valor=${tx.amount} ${tx.currency} | desc=${tx.description ?? '-'} | data=${createdAtValue}`,
        );
      });
    }
  } catch (error) {
    console.error('✗ Falha ao consultar carteira:', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
}

main();
