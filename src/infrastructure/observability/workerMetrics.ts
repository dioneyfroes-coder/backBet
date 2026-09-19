import { Histogram, Counter, Gauge } from 'prom-client';
import { metricsRegistry } from './metrics';

/**
 * Métricas de workers Bull (Fase 10 — Observabilidade).
 *
 * Fecha o ciclo "job processado → duração → profundidade da fila → retry →
 * Prometheus": mesmo o processamento que não toca Mongo/Redis agora fica
 * observável no /metrics.
 */

const workerJobDurationSeconds = new Histogram({
  name: 'backbet_worker_job_duration_seconds',
  help: 'Duração de processamento de jobs Bull por fila e tipo de job',
  labelNames: ['queue', 'job'],
  buckets: [0.005, 0.01, 0.05, 0.15, 0.3, 0.6, 1.2, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

const workerRetriesTotal = new Counter({
  name: 'backbet_worker_retries_total',
  help: 'Total de requeues de jobs por fila (error handling do worker)',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

const workerJobsTotal = new Counter({
  name: 'backbet_worker_jobs_total',
  help: 'Total de jobs concluídos por fila (success/failure)',
  labelNames: ['queue', 'outcome'],
  registers: [metricsRegistry],
});

const mailQueueDepthGauge = new Gauge({
  name: 'backbet_mail_queue_depth',
  help: 'Profundidade da fila de e-mail (contact_queue: waiting+active+delayed)',
  registers: [metricsRegistry],
});

const withdrawalPayoutQueueDepthGauge = new Gauge({
  name: 'backbet_withdrawal_payout_queue_depth',
  help: 'Profundidade da fila de payouts de saque (withdrawal_payouts)',
  registers: [metricsRegistry],
});

export function observeWorkerJob(
  queue: string,
  job: string,
  outcome: 'succeeded' | 'failed',
  durationMs: number,
): void {
  try {
    workerJobDurationSeconds.labels(queue, job).observe(Math.max(0, durationMs) / 1000);
    workerJobsTotal.labels(queue, outcome).inc();
  } catch {
    // métricas nunca derrubam a aplicação
  }
}

export function recordWorkerRetry(queue: string): void {
  try {
    workerRetriesTotal.labels(queue).inc();
  } catch {
    // métricas nunca derrubam a aplicação
  }
}

export function setWorkerQueueDepth(queue: 'mail' | 'withdrawal_payout', depth: number): void {
  try {
    const safe = Math.max(0, depth);
    if (queue === 'mail') {
      mailQueueDepthGauge.set(safe);
    } else {
      withdrawalPayoutQueueDepthGauge.set(safe);
    }
  } catch {
    // métricas nunca derrubam a aplicação
  }
}

type QueueDepthSource = {
  getPendingCount?: () => Promise<number>;
  getJobCounts?: () => Promise<{ waiting?: number; active?: number; delayed?: number }>;
};

export async function sampleQueueDepth(queue: 'mail' | 'withdrawal_payout', source: QueueDepthSource): Promise<void> {
  try {
    if (typeof source?.getJobCounts === 'function') {
      const counts = await source.getJobCounts();
      setWorkerQueueDepth(
        queue,
        (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
      );
      return;
    }
    if (typeof source?.getPendingCount === 'function') {
      setWorkerQueueDepth(queue, await source.getPendingCount());
      return;
    }
    setWorkerQueueDepth(queue, 0);
  } catch {
    setWorkerQueueDepth(queue, 0);
  }
}
