// src/server.ts

import { appConfig } from '@/shared/config/appConfig';
import { createApiServer } from './infrastructure/api/ApiServer';
import { createApiRouter } from './infrastructure/api/routes';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from './infrastructure/persistence/mongoose/config';
import '@/infrastructure/observability/cacheMetrics';
import { createHouseTreasuryRepository } from '@/infrastructure/persistence/factory';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { TreasuryRebalanceJob } from '@/infrastructure/jobs/TreasuryRebalanceJob';
// route creators are loaded dynamically (may be async factories)

/**
 * Função principal para iniciar o servidor BackBet
 */
async function main() {
  let treasuryJob: TreasuryRebalanceJob | undefined;
  const stopJobs = () => {
    treasuryJob?.stop();
    treasuryJob = undefined;
  };

  try {
    // Obter port da variável de ambiente
    const port = appConfig.server.port;

    // Se estiver usando persistência Mongoose, conectar ao MongoDB antes de iniciar
    if (process.env.USE_MONGOOSE_PERSISTENCE === 'true') {
      const cfg = getMongoDBConfig();
      await connectMongoDB(cfg);

      // Garantir desconexão ao encerrar a aplicação
      const shutdown = async () => {
        try {
          stopJobs();
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

    process.on('SIGINT', stopJobs);
    process.on('SIGTERM', stopJobs);

    // Criar servidor
    const apiServer = createApiServer(port);

    // Registrar health checks
    apiServer.registerHealthCheck();
    apiServer.registerMetricsEndpoint();

    // Registrar rotas via roteador agregado
    const apiRouter = await createApiRouter({
      base: {
        dependencyHealthProvider: () => apiServer.getDependencyHealthSnapshot(),
      },
      admin: {
        dependencyHealthProvider: () => apiServer.getDependencyHealthSnapshot(),
      },
    });
    apiServer.registerRoutes(apiRouter);

    const treasuryRepository = await createHouseTreasuryRepository();
    const treasuryService = new HouseTreasuryService(treasuryRepository, {
      walletId: appConfig.treasury.walletId,
      currency: appConfig.treasury.currency,
    });
    treasuryJob = new TreasuryRebalanceJob(treasuryService, {
      intervalMs: appConfig.treasury.rebalanceIntervalMs,
      targetPrizeRatio: appConfig.treasury.targetPrizeRatio,
      minProfitBuffer: appConfig.treasury.minProfitBuffer,
      maxTransferPerRun: appConfig.treasury.maxTransferPerRun,
    });
    treasuryJob.start();

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
    stopJobs();
    process.exit(1);
  }
}

// Executar
main();
