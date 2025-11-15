import 'dotenv/config';
import { createApiServer } from './infrastructure/api/ApiServer';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from './infrastructure/persistence/mongoose/config';
// route creators are loaded dynamically (may be async factories)

/**
 * Função principal para iniciar o servidor BackBet
 */
async function main() {
  try {
    // Obter port da variável de ambiente
    const port = parseInt(process.env.PORT || '3000', 10);

    // Se estiver usando persistência Mongoose, conectar ao MongoDB antes de iniciar
    if (process.env.USE_MONGOOSE_PERSISTENCE === 'true') {
      const cfg = getMongoDBConfig();
      await connectMongoDB(cfg);

      // Garantir desconexão ao encerrar a aplicação
      const shutdown = async () => {
        try {
          await disconnectMongoDB();
          process.exit(0);
        } catch (err) {
          console.error('Erro ao desconectar MongoDB durante shutdown', err);
          process.exit(1);
        }
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }

    // Criar servidor
    const apiServer = createApiServer(port);

    // Registrar health checks
    apiServer.registerHealthCheck();

    // Registrar rotas (rotas agora podem ser assíncronas pois usam factories)
  const authRoutes = await import('./infrastructure/api/routes/authRoutes').then(m => m.createAuthRoutes());
  apiServer.registerRoutes(authRoutes, '/auth');

  const userRoutes = await import('./infrastructure/api/routes/userRoutes').then(m => m.createUserRoutes());
  apiServer.registerRoutes(userRoutes, '/users');

  const walletRoutes = await import('./infrastructure/api/routes/walletRoutes').then(m => m.createWalletRoutes());
  apiServer.registerRoutes(walletRoutes, '/wallets');

  const betRoutes = await import('./infrastructure/api/routes/betRoutes').then(m => m.createBetRoutes());
  apiServer.registerRoutes(betRoutes, '/bets');

    // TODO: Registrar outras rotas
    // const betRoutes = createBetRoutes();
    // apiServer.registerRoutes(betRoutes, '/bets');

    // Registrar handlers globais
    apiServer.get404Handler();
    apiServer.registerErrorHandler();

    // Iniciar servidor
    apiServer.start();
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Executar
main();
