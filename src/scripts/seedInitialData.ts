import 'dotenv/config';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { createUserRepository, createWalletRepository } from '@/infrastructure/persistence/factory';
import { UserService } from '@/core/user/domain/services/UserService';
import { WalletService } from '@/core/finance/domain/services/WalletService';
import { RegisterUser } from '@/core/user/application/use-cases/RegisterUser';
import { AppError } from '@/shared/errors/AppError';

const defaults = [
  {
    email: 'dev@backbet.local',
    username: 'dev_user',
    firstName: 'Dev',
    lastName: 'Backbet',
    password: 'Password123!',
  },
];

async function main() {
  const config = getMongoDBConfig();
  await connectMongoDB(config);

  try {
    const userRepository = await createUserRepository();
    const walletRepository = await createWalletRepository();

    const userService = new UserService(userRepository as any);
    const walletService = new WalletService(walletRepository as any);
    const registerUser = new RegisterUser(userService, walletService);

    for (const user of defaults) {
      try {
        await registerUser.execute({
          email: user.email,
          username: user.username,
          password: user.password,
          currency: 'BRL',
        });
        console.log(`✅ Usuário seed '${user.email}' criado.`);
      } catch (error) {
        if (error instanceof AppError && error.code === 'CONFLICT') {
          console.log(`⚠️ Usuário '${user.email}' já existe (ignorado).`);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('✗ Falha ao executar seed inicial', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongoDB();
  }
}

main();
