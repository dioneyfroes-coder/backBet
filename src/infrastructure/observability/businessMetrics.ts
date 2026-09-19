import { Gauge } from 'prom-client';
import { metricsRegistry } from './metrics';

/**
 * Métricas de negócio do BackBet (Fase 10 — Observabilidade).
 *
 * Ao contrário das métricas de infraestrutura (Mongo/Redis/worker), estas
 * medem o que a operação entrega ao domínio financeiro:
 *  - saldo da casa (créditos menos débitos na ledger);
 *  - exposição em aberto (soma de apostas não resolvidas);
 *  - volume financeiro movimentado no período;
 *  - saques pendentes e em processamento (giro financeiro);
 *  - parcela da exposição considerada de alto risco.
 *
 * A coleta é separada em dois passos testáveis de forma independente:
 *  1. collectBusinessMetrics(snapshot) — função pura que grava os gauges a
 *     partir de um snapshot já calculado;
 *  2. startBusinessMetricsPolling(collector, interval) — agenda a coleta via
 *     uma função injetada (porta, nunca uma implementação de repositório
 *     concreta), devolvendo um stopper para os testes herméticos.
 */

const houseBalanceGauge = new Gauge({
  name: 'backbet_business_house_balance',
  help: 'Saldo da casa: créditos menos débitos na ledger',
  registers: [metricsRegistry],
});

const totalExposureGauge = new Gauge({
  name: 'backbet_business_total_exposure',
  help: 'Exposição em aberto: soma de apostas ainda não resolvidas',
  registers: [metricsRegistry],
});

const financialVolumeGauge = new Gauge({
  name: 'backbet_business_financial_volume',
  help: 'Volume financeiro movimentado (depósitos + saques) no período',
  registers: [metricsRegistry],
});

const pendingWithdrawalsGauge = new Gauge({
  name: 'backbet_business_pending_withdrawals',
  help: 'Quantidade de saques pendentes de aprovação',
  registers: [metricsRegistry],
});

const processingWithdrawalsGauge = new Gauge({
  name: 'backbet_business_processing_withdrawals',
  help: 'Quantidade de saques em processamento (giro financeiro)',
  registers: [metricsRegistry],
});

const riskyExposureGauge = new Gauge({
  name: 'backbet_business_risky_exposure',
  help: 'Parcela da exposição considerada de alto risco',
  registers: [metricsRegistry],
});

export interface BusinessMetricsSnapshot {
  houseBalance: number;
  totalExposure: number;
  financialVolume: number;
  pendingWithdrawals: number;
  processingWithdrawals: number;
  riskyExposure: number;
}

export type BusinessMetricsCollector = () => Promise<BusinessMetricsSnapshot> | BusinessMetricsSnapshot;

let lastSnapshot: BusinessMetricsSnapshot | null = null;
let pollingTimer: NodeJS.Timeout | null = null;

const safeNumber = (value: number): number => (Number.isFinite(value) ? value : 0);
const safeCount = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

export function collectBusinessMetrics(snapshot: BusinessMetricsSnapshot): void {
  const safe: BusinessMetricsSnapshot = {
    houseBalance: safeNumber(snapshot.houseBalance),
    totalExposure: safeNumber(snapshot.totalExposure),
    financialVolume: safeNumber(snapshot.financialVolume),
    pendingWithdrawals: safeCount(snapshot.pendingWithdrawals),
    processingWithdrawals: safeCount(snapshot.processingWithdrawals),
    riskyExposure: safeNumber(snapshot.riskyExposure),
  };
  lastSnapshot = { ...safe };
  houseBalanceGauge.set(safe.houseBalance);
  totalExposureGauge.set(safe.totalExposure);
  financialVolumeGauge.set(safe.financialVolume);
  pendingWithdrawalsGauge.set(safe.pendingWithdrawals);
  processingWithdrawalsGauge.set(safe.processingWithdrawals);
  riskyExposureGauge.set(safe.riskyExposure);
}

export function getBusinessMetricsSnapshot(): BusinessMetricsSnapshot | null {
  return lastSnapshot ? { ...lastSnapshot } : null;
}

export function startBusinessMetricsPolling(
  collector: BusinessMetricsCollector,
  intervalMs = 10_000,
): () => void {
  if (typeof collector !== 'function') {
    return () => undefined;
  }
  const tick = async (): Promise<void> => {
    try {
      const snapshot = await collector();
      if (snapshot && typeof snapshot === 'object') {
        collectBusinessMetrics(snapshot);
      }
    } catch {
      // a coleta nunca deve derrubar a aplicação
    }
  };
  void tick();
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }
  pollingTimer = setInterval(() => void tick(), intervalMs);
  if (typeof pollingTimer.unref === 'function') {
    pollingTimer.unref();
  }
  return () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };
}

export default startBusinessMetricsPolling;
