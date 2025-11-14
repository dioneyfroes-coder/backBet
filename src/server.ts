import { createApiServer } from './infrastructure/api/ApiServer';
import { createAuthRoutes } from './infrastructure/api/routes/authRoutes';

/**
 * Função principal para iniciar o servidor BackBet
 */
async function main() {
  try {
    // Obter port da variável de ambiente
    const port = parseInt(process.env.PORT || '3000', 10);

    // Criar servidor
    const apiServer = createApiServer(port);

    // Registrar health checks
    apiServer.registerHealthCheck();

    // Registrar rotas
    const authRoutes = createAuthRoutes();
    apiServer.registerRoutes(authRoutes);

    // TODO: Registrar outras rotas
    // const userRoutes = createUserRoutes();
    // apiServer.registerRoutes(userRoutes);
    // const walletRoutes = createWalletRoutes();
    // apiServer.registerRoutes(walletRoutes);
    // const betRoutes = createBetRoutes();
    // apiServer.registerRoutes(betRoutes);

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
