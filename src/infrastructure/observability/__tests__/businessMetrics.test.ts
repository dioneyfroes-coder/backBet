import {
  collectBusinessMetrics,
  getBusinessMetricsSnapshot,
  startBusinessMetricsPolling,
  type BusinessMetricsSnapshot,
} from '../businessMetrics';
import { metricsRegistry } from '../metrics';

const makeSnapshot = (overrides: Partial<BusinessMetricsSnapshot> = {}): BusinessMetricsSnapshot => ({
  houseBalance: 12_500,
  totalExposure: 87_000.5,
  financialVolume: 210_000,
  pendingWithdrawals: 3,
  processingWithdrawals: 1,
  riskyExposure: 9_200,
  ...overrides,
});

const gauge = async (name: string): Promise<number> => {
  const json = await metricsRegistry.getMetricsAsJSON();
  const metric = json.find((m) => m.name === name);
  if (!metric || !('values' in metric)) {
    return Number.NaN;
  }
  const first = (metric as { values: Array<{ value: number }> }).values[0];
  return first ? Number(first.value) : Number.NaN;
};

describe('businessMetrics — Fase 10 (métricas de negócio)', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  it('grava os gauges de negócio no registry do Prometheus', async () => {
    collectBusinessMetrics(makeSnapshot());

    await expect(gauge('backbet_business_house_balance')).resolves.toBe(12_500);
    await expect(gauge('backbet_business_total_exposure')).resolves.toBe(87_000.5);
    await expect(gauge('backbet_business_financial_volume')).resolves.toBe(210_000);
    await expect(gauge('backbet_business_pending_withdrawals')).resolves.toBe(3);
    await expect(gauge('backbet_business_processing_withdrawals')).resolves.toBe(1);
    await expect(gauge('backbet_business_risky_exposure')).resolves.toBe(9_200);
  });

  it('saneia valores não-financeiros e negativos para não contaminar a série', async () => {
    collectBusinessMetrics(
      makeSnapshot({
        houseBalance: Number.NaN,
        totalExposure: Number.POSITIVE_INFINITY,
        riskyExposure: Number.NEGATIVE_INFINITY,
      }),
    );

    await expect(gauge('backbet_business_house_balance')).resolves.toBe(0);
    await expect(gauge('backbet_business_total_exposure')).resolves.toBe(0);
    await expect(gauge('backbet_business_risky_exposure')).resolves.toBe(0);
  });

  it('guarda o snapshot para consumo interno e dashboard', () => {
    collectBusinessMetrics(makeSnapshot({ riskyExposure: 9_200 }));
    const saved = getBusinessMetricsSnapshot();
    expect(saved).not.toBeNull();
    expect(saved?.riskyExposure).toBe(9_200);
    expect(saved).not.toBe(getBusinessMetricsSnapshot());
  });

  it('agenda o polling, coleta e o stopper para a coleta', async () => {
    const seen = () => getBusinessMetricsSnapshot();
    const stop = startBusinessMetricsPolling(async () => makeSnapshot(), 20);
    await new Promise((resolve) => setTimeout(resolve, 55));
    const whileRunning = seen();
    stop();
    await new Promise((resolve) => setTimeout(resolve, 45));
    expect(whileRunning).not.toBeNull();
    expect(getBusinessMetricsSnapshot()).not.toBe(whileRunning);
  });
});
