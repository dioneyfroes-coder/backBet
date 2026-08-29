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
import {
  createHouseTreasuryRepository,
  createAuditEventRepository,
  createBetRepository,
  createSigapSubmissionRepository,
} from '@/infrastructure/persistence/factory';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';
import { TreasuryRebalanceJob } from '@/infrastructure/jobs/TreasuryRebalanceJob';
import { TreasuryReconciliationJob } from '@/infrastructure/jobs/TreasuryReconciliationJob';
import { AuditRetentionJob } from '@/infrastructure/jobs/AuditRetentionJob';
import { AuditService } from '@/core/audit/domain/services/AuditService';
import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { SigapTransmissionJob } from '@/infrastructure/jobs/SigapTransmissionJob';
import { createSigapProviders } from '@/infrastructure/sigap/sigapFactory';
import { startContactWorker } from '@/infrastructure/mailer/ContactWorker';
import { startWithdrawalWorker } from '@/infrastructure/withdrawals/WithdrawalPayoutWorker';
import type { Queue as BullQueue } from 'bull';
// route creators are loaded dynamically (may be async factories)

/**
 * Função principal para iniciar o servidor BackBet
 */
async function main() {
  let treasuryJob: TreasuryRebalanceJob | undefined;
  let treasuryReconciliationJob: TreasuryReconciliationJob | undefined;
  let auditRetentionJob: AuditRetentionJob | undefined;
  let sigapTransmissionJob: SigapTransmissionJob | undefined;
  let contactQueue: BullQueue | undefined;
  let withdrawalQueue: BullQueue | undefined;

  const stopJobs = () => {
    treasuryJob?.stop();
    treasuryJob = undefined;
    treasuryReconciliationJob?.stop();
    treasuryReconciliationJob = undefined;
    auditRetentionJob?.stop();
    auditRetentionJob = undefined;
    sigapTransmissionJob?.stop();
    sigapTransmissionJob = undefined;
    if (contactQueue) {
      // close asynchronously but don't block stopJobs
      void contactQueue.close().catch(() => undefined);
      contactQueue = undefined;
    }
    if (withdrawalQueue) {
      void withdrawalQueue.close().catch(() => undefined);
      withdrawalQueue = undefined;
    }
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

    treasuryReconciliationJob = new TreasuryReconciliationJob(treasuryService, {
      intervalMs: appConfig.treasury.reconciliationIntervalMs,
    });
    treasuryReconciliationJob.start();

    // Auditoria (Fase 15): persistência de eventos de auditoria,
    // logs de acesso e política de retenção.
    if (appConfig.audit.enabled) {
      const auditRepository = await createAuditEventRepository();
      const auditService = new AuditService(auditRepository);

      if (appConfig.audit.accessLogEnabled) {
        apiServer.setAuditAccessLogger((info) => {
          void auditService
            .recordAccess({
              action: 'http.request',
              actorUserId: info.userId,
              resourceType: 'http',
              resourceId: undefined,
              ip: info.ip,
              requestId: info.requestId,
              status: info.status,
              method: info.method,
              path: info.path,
              durationMs: info.durationMs,
            })
            .catch(() => undefined);
        });
      }

      auditRetentionJob = new AuditRetentionJob(auditService, {
        intervalMs: appConfig.audit.retentionJobIntervalMs,
        retentionDays: appConfig.audit.retentionDays,
      });
      auditRetentionJob.start();
    }

    // SIGAP (Fase 16): transmissão regulatória diária. O job transmite o
    // agregado OPERADOR_DIARIO; os arquivos por apostador são acionados via
    // endpoint admin.
    if (appConfig.sigap.enabled) {
      const sigapSubmissionRepository = await createSigapSubmissionRepository();
      const sigapProviders = createSigapProviders();
      const sigapService = new SigapService({
        submissionRepository: sigapSubmissionRepository,
        transmissionProvider: sigapProviders.transmission,
        impedimentProvider: sigapProviders.impediment,
      });
      const betRepository = await createBetRepository();
      sigapTransmissionJob = new SigapTransmissionJob(sigapService, {
        intervalMs: appConfig.sigap.transmissionJobIntervalMs,
        collectBets: async (referenceDate: string) => {
          const from = new Date(`${referenceDate}T00:00:00Z`);
          const to = new Date(`${referenceDate}T23:59:59.999Z`);
          const bets = (await betRepository.findByStatus('PENDING')).filter((b) => {
            const t = b.createdAt.getTime();
            return t >= from.getTime() && t <= to.getTime();
          });
          return bets;
        },
      });
      sigapTransmissionJob.start();
    }

    // Registrar handlers globais
    apiServer.get404Handler();
    apiServer.registerErrorHandler();

    // Iniciar servidor
    apiServer.start();

    // Optionally start the contact worker in-process when requested via env
    if (process.env.START_CONTACT_WORKER === 'true') {
      try {
        contactQueue = startContactWorker();
        const closeQueue = async () => {
          try {
            await contactQueue?.close();
          } catch (err) {
            // ignore
          }
        };
        process.on('SIGINT', closeQueue);
        process.on('SIGTERM', closeQueue);
      } catch (err) {
        console.error('Failed to start contact worker in-process', err);
      }
    }

    // Optionally start the withdrawal payout worker in-process when requested via env
    if (process.env.START_WITHDRAWAL_WORKER === 'true') {
      try {
        withdrawalQueue = startWithdrawalWorker();
        const closeWithdrawal = async () => {
          try {
            await withdrawalQueue?.close();
          } catch (err) {
            // ignore
          }
        };
        process.on('SIGINT', closeWithdrawal);
        process.on('SIGTERM', closeWithdrawal);
      } catch (err) {
        console.error('Failed to start withdrawal worker in-process', err);
      }
    }
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    stopJobs();
    process.exit(1);
  }
}

// Executar
main();
