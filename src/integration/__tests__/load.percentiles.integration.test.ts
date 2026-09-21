import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import IORedis from 'ioredis';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseWalletRepository';
import { MongooseLedgerRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseLedgerRepository';
import { WalletModel } from '@/infrastructure/persistence/mongoose/schemas/WalletSchema';
import { LedgerEntryModel } from '@/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema';
import { WalletService } from '@/core/finance/domain/services/WalletService';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

// Fase 13 — Benchmark: descobrir o limite operacional real do modelo atual.
// Sem otimização prematura: apenas medir, sob os níveis pedidos no plano
// (50..500 concorrentes):
//   - contenção (N operações na MESMA carteira => serialização do documento
//     único): mede o teto patológico e o custo de CAS/retry.
//   - distribuído (N carteiras DISTINTAS, 1 op cada => eixo horizontal): mede o
//     throughput real da API+Mongo com contenção removida.
// Por onda mede: p50/p95/p99/mean/max de latência por operação, conflitos
// (AppError CONFLICT 409 do CAS de versão), retries (reexecuções), tempo de
// transação (duração da onda) e ops/sec. Também coleta telemetria de recursos
// (item #14 do plano): CPU%/RSS do processo da suíte durante a onda (medidos com
// process.cpuUsage/process.memoryUsage) e a latência de round-trip de Mongos e
// Redis (pings amostrados a cada PERC_SAMPLE_MS enquanto a onda corre). O
// CPU/RAM dos containers de infra (mongodb/redis) é amostrado pelo driver via
// `docker stats`. O gargalo de contenção pode durar
// muito; cada nível roda em `it` próprio com orçamento (PERC_MAX_WAVE_MS) —
// quando estourado, a onda é marcada `capped` com N ops concluídas no orçamento
// (medição honesta do teto, sem travar a suíte).
// Emite uma linha `PERC <json>` por cenário, consumida por
// scripts/percentile-driver.cjs / scripts/collect-perc-report.cjs.
const LEVELS = (process.env.PERC_LEVELS ?? '50,100,150,200,300,500')
  .split(',')
  .map((v) => Number(v))
  .filter((v) => Number.isInteger(v) && v > 0);
const SCENARIOS = (process.env.PERC_SCENARIOS ?? 'contention,distributed')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s === 'contention' || s === 'distributed');
const MAX_WAVE_MS = Number(process.env.PERC_MAX_WAVE_MS ?? 20 * 60 * 1000);
const SAMPLE_MS = Number(process.env.PERC_SAMPLE_MS ?? 200);
const DEPOSIT_AMOUNT = 1.25;
const MB = 1024 * 1024;

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
}

interface ResourceTelemetry {
  cpuPct: number;
  rssStartMb: number;
  rssPeakMb: number;
  mongoPingMs: number;
  redisPingMs: number;
  samples: number;
}

interface ScenarioReport {
  runId: string;
  scenario: 'contention' | 'distributed';
  level: number;
  ops: number;
  fulfilled: number;
  rejected: number;
  deferred: number;
  capped: boolean;
  rejectedCodes: Record<string, number>;
  conflicts: number;
  retries: number;
  latencyMs: LatencyStats;
  wallMs: number;
  opsPerSec: number;
  telemetry: ResourceTelemetry;
}

interface WaveTelemetry {
  results: PromiseSettledResult<unknown>[];
  conflicts: number;
  deferred: number;
  capped: boolean;
  wallMs: number;
  sortedLatenciesMs: number[];
  telemetry: ResourceTelemetry;
}

const isConflict = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  (error as { code?: string }).code === 'CONFLICT';

const WAVE_CAP = Object.assign(new Error('WAVE_CAP'), { code: 'WAVE_CAP' });

const rejectionCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code) || 'UNKNOWN';
  }
  if (error instanceof Error) return error.name;
  return 'UNKNOWN';
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const medianOf = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
};

const statsOf = (sorted: number[]): LatencyStats => {
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: Math.round(mean * 100) / 100,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
};

describeReal('Fase 13 — Benchmark de percentis (50..500 concorrentes) — MongoDB real', () => {
  jest.setTimeout(Math.max(MAX_WAVE_MS + 5 * 60 * 1000, 3_600_000));

  const runId = randomUUID();
  const prefix = `perc-${runId}`;
  const resourceIds: string[] = [];

  const walletRepo = new MongooseWalletRepository();
  const ledgerRepo = new MongooseLedgerRepository();
  const walletService = new WalletService(walletRepo, ledgerRepo);

  // Sonda opcional do Redis só para medir latência; se REDIS_URL não estiver
  // definida a métrica vem zerada e a suíte segue (o benchmark é de Mongo).
  let redisProbe: IORedis | null = null;

  const pingMongo = async (): Promise<number> => {
    const startedAt = Date.now();
    await mongoose.connection.db!.admin().command({ ping: 1 });
    return Date.now() - startedAt;
  };

  const pingRedis = async (): Promise<number | null> => {
    if (!redisProbe) return null;
    const startedAt = Date.now();
    await redisProbe.ping();
    return Date.now() - startedAt;
  };

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
    if (runRealIntegration && process.env.REDIS_URL) {
      redisProbe = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      redisProbe.on('error', () => {
        // silencia erros do probe — a métrica é opcional
      });
    }
  });

  afterAll(async () => {
    if (runRealIntegration) {
      await Promise.all([
        WalletModel.deleteMany({ userId: { $in: resourceIds } }),
        LedgerEntryModel.deleteMany({ userId: { $in: resourceIds } }),
      ]);
      if (redisProbe) await redisProbe.quit();
      await disconnectMongoDB();
    }
  });

  const runWave = async (operations: Array<() => Promise<unknown>>): Promise<WaveTelemetry> => {
    const latencies: number[] = [];
    let conflicts = 0;
    let deferred = 0;
    let capped = false;
    const wallStart = Date.now();
    const cpuStart = process.cpuUsage();
    const rssStartMb = process.memoryUsage().rss / MB;
    let rssPeakMb = rssStartMb;
    const mongoRtts: number[] = [];
    const redisRtts: number[] = [];
    let samples = 0;
    let sampling = false;
    const results: PromiseSettledResult<unknown>[] = new Array(operations.length);
    const started = Array.from({ length: operations.length }, () => Date.now());

    const runOne = async (i: number): Promise<void> => {
      for (;;) {
        if (capped) {
          results[i] = { status: 'rejected', reason: WAVE_CAP };
          deferred += 1;
          return;
        }
        try {
          const value = await operations[i]();
          results[i] = { status: 'fulfilled', value };
          latencies.push(Date.now() - started[i]);
          return;
        } catch (error) {
          if (isConflict(error)) {
            conflicts += 1;
            continue;
          }
          results[i] = { status: 'rejected', reason: error };
          latencies.push(Date.now() - started[i]);
          return;
        }
      }
    };

    const watch = (async () => {
      for (;;) {
        if (Date.now() - wallStart >= MAX_WAVE_MS) {
          capped = true;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })();

    const sampler = setInterval(async () => {
      if (sampling) return;
      sampling = true;
      try {
        const rss = process.memoryUsage().rss / MB;
        if (rss > rssPeakMb) rssPeakMb = rss;
        mongoRtts.push(await pingMongo());
        const redisRtt = await pingRedis();
        if (redisRtt !== null) redisRtts.push(redisRtt);
        samples += 1;
      } catch {
        // sonda de latência é best-effort; nunca derruba a onda
      } finally {
        sampling = false;
      }
    }, SAMPLE_MS);

    await Promise.all(operations.map((_, i) => runOne(i)));
    clearInterval(sampler);
    const wallMs = Date.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    return {
      results,
      conflicts,
      deferred,
      capped,
      wallMs,
      sortedLatenciesMs: latencies.sort((a, b) => a - b),
      telemetry: {
        cpuPct: wallMs > 0 ? round2((cpuMs / wallMs) * 100) : 0,
        rssStartMb: round2(rssStartMb),
        rssPeakMb: round2(rssPeakMb),
        mongoPingMs: round2(medianOf(mongoRtts)),
        redisPingMs: round2(medianOf(redisRtts)),
        samples,
      },
    };
  };

  const runScenario = (
    scenario: 'contention' | 'distributed',
    level: number,
    wave: WaveTelemetry,
  ): ScenarioReport => {
    const fulfilled = wave.results.filter((r) => r.status === 'fulfilled').length;
    const rejectedCodes: Record<string, number> = {};
    for (const r of wave.results) {
      if (r.status === 'rejected') {
        const code = rejectionCode(r.reason);
        rejectedCodes[code] = (rejectedCodes[code] ?? 0) + 1;
      }
    }
    const report: ScenarioReport = {
      runId,
      scenario,
      level,
      ops: level,
      fulfilled,
      rejected: wave.results.filter((r) => r.status === 'rejected' && r.reason !== WAVE_CAP).length,
      deferred: wave.deferred,
      capped: wave.capped,
      rejectedCodes,
      conflicts: wave.conflicts,
      retries: wave.conflicts,
      latencyMs: statsOf(wave.sortedLatenciesMs),
      wallMs: wave.wallMs,
      opsPerSec: Math.round((level * 1000) / Math.max(1, wave.wallMs)),
      telemetry: wave.telemetry,
    };
    console.log(`PERC ${JSON.stringify(report)}`);
    return report;
  };

  for (const level of LEVELS) {
    it(`nível ${level}: contenção (mesma carteira) + distribuído (carteiras distintas)`, async () => {
      // ---------- Cenário 1: CONTENÇÃO (mesma carteira) ----------
      if (SCENARIOS.includes('contention')) {
        const contentionUserId = `${prefix}-cont-${level}`;
        resourceIds.push(contentionUserId);
        await walletService.createWallet({ userId: contentionUserId, currency: 'BRL' });

        const contention = await runWave(
          Array.from({ length: level }, () => () => walletService.deposit(contentionUserId, DEPOSIT_AMOUNT)),
        );
        const contentionReport = runScenario('contention', level, contention);

        const contentionWallet = await walletService.findByUserId(contentionUserId);
        const contentionLedgerCount = await LedgerEntryModel.countDocuments({
          userId: contentionUserId,
          type: 'DEPOSIT',
        });
        expect(contentionLedgerCount).toBe(contentionReport.fulfilled);
        expect(contentionWallet).not.toBeNull();
        if (contentionReport.capped) {
          expect(contentionWallet!.balance).toBeCloseTo(DEPOSIT_AMOUNT * contentionReport.fulfilled, 6);
          expect(contentionReport.fulfilled + contentionReport.rejected + contentionReport.deferred).toBe(level);
        } else {
          expect(contentionWallet!.balance).toBeCloseTo(DEPOSIT_AMOUNT * level, 6);
          expect(contentionReport.rejected).toBe(0);
        }
      }

      // ---------- Cenário 2: DISTRIBUÍDO (carteiras distintas) ----------
      if (SCENARIOS.includes('distributed')) {
        const distributedUserIds = Array.from(
          { length: level },
          (_, i) => `${prefix}-dist-${level}-${i}`,
        );
        resourceIds.push(...distributedUserIds);
        await Promise.all(
          distributedUserIds.map((userId) => walletService.createWallet({ userId, currency: 'BRL' })),
        );

        const distributed = await runWave(
          distributedUserIds.map((userId) => () => walletService.deposit(userId, DEPOSIT_AMOUNT)),
        );
        const distributedReport = runScenario('distributed', level, distributed);

        const distributedLedgerCount = await LedgerEntryModel.countDocuments({
          userId: { $in: distributedUserIds },
          type: 'DEPOSIT',
        });
        expect(distributedLedgerCount).toBe(distributedReport.fulfilled);
        for (const userId of distributedUserIds) {
          const wallet = await walletService.findByUserId(userId);
          expect(wallet?.balance).toBeCloseTo(DEPOSIT_AMOUNT, 6);
        }
      }
    });
  }
});