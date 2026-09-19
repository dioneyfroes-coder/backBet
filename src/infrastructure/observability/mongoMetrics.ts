import mongoose from 'mongoose';
import { Counter, Gauge, Histogram } from 'prom-client';
import { metricsRegistry } from './metrics';

/**
 * Métricas de infraestrutura do MongoDB (Fase 10 — Observabilidade).
 *
 * Instrumenta a camada Mongoose por interceptação dos protótipos de Query,
 * Aggregate e de save dos documentos. Por isso a instrumentação é registrada
 * uma única vez (idempotente) e independe da ordem de compilação dos modelos:
 * consultas executadas depois da chamada a enableMongoMetricsInstrumentation
 * passam a medir latência e volume por modelo/operação.
 */

const mongoQueryDurationSeconds = new Histogram({
  name: 'backbet_mongo_query_duration_seconds',
  help: 'Duração de comandos Mongo executados (queries, aggregates e saves)',
  labelNames: ['model', 'op'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

const mongoCommandsTotal = new Counter({
  name: 'backbet_mongo_commands_total',
  help: 'Total de comandos Mongo executados',
  labelNames: ['model', 'op'],
  registers: [metricsRegistry],
});

const mongoConnections = new Gauge({
  name: 'backbet_mongo_connections',
  help: 'Estado da conexão Mongoose (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)',
  registers: [metricsRegistry],
});

export function recordMongoOperation(model: string, op: string, durationMs: number): void {
  const safeModel = model || 'unknown';
  const safeOp = op || 'query';
  const seconds = Math.max(0, durationMs) / 1000;
  mongoQueryDurationSeconds.labels(safeModel, safeOp).observe(seconds);
  mongoCommandsTotal.labels(safeModel, safeOp).inc();
}

export function updateMongoConnectionsGauge(): void {
  try {
    mongoConnections.set(mongoose.connection.readyState);
  } catch {
    // métrica nunca derruba a aplicação
  }
}

const elapsedMs = (started: [number, number]): number => {
  const delta = process.hrtime(started);
  return delta[0] * 1000 + delta[1] / 1e6;
};

const finishQuery = (modelName: string, op: string, started: [number, number]): void => {
  recordMongoOperation(modelName, op, elapsedMs(started));
};

let instrumentationEnabled = false;

export function enableMongoMetricsInstrumentation(): void {
  if (instrumentationEnabled) {
    return;
  }
  instrumentationEnabled = true;

  try {
    const queryPrototype = mongoose.Query.prototype as unknown as Record<string, unknown>;
    const originalQueryExec = queryPrototype.exec as (this: unknown, ...args: unknown[]) => unknown;
    if (typeof originalQueryExec === 'function') {
      queryPrototype.exec = function (this: {
        op?: string;
        model?: { modelName?: string };
      }, ...args: unknown[]): unknown {
        const op = this.op || 'query';
        const modelName = this.model?.modelName || 'unknown';
        const started = process.hrtime();
        const result = originalQueryExec.apply(this, args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).finally(() => finishQuery(modelName, op, started));
        }
        return result;
      };
    }

    const aggregatePrototype = mongoose.Aggregate.prototype as unknown as Record<string, unknown>;
    const originalAggregateExec = aggregatePrototype.exec as (
      this: unknown,
      ...args: unknown[]
    ) => unknown;
    if (typeof originalAggregateExec === 'function') {
      aggregatePrototype.exec = function (this: { _model?: { modelName?: string } }, ...args: unknown[]): unknown {
        const modelName = this._model?.modelName || 'unknown';
        const started = process.hrtime();
        const result = originalAggregateExec.apply(this, args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).finally(() => finishQuery(modelName, 'aggregate', started));
        }
        return result;
      };
    }

    const modelPrototype = mongoose.Model.prototype as Record<string, unknown>;
    const originalSave = modelPrototype.save as (this: unknown, ...args: unknown[]) => unknown;
    if (typeof originalSave === 'function') {
      modelPrototype.save = function (this: { constructor?: { modelName?: string } }, ...args: unknown[]): unknown {
        const modelName = this.constructor?.modelName || 'unknown';
        const started = process.hrtime();
        const result = originalSave.apply(this, args);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).finally(() => finishQuery(modelName, 'save', started));
        }
        return result;
      };
    }
  } catch {
    // a instrumentação é vantajosa mas nunca deve impedir a aplicação de rodar
  }
}

let pollTimer: NodeJS.Timeout | null = null;

export function startMongoMetricsPolling(intervalMs = 5000): () => void {
  updateMongoConnectionsGauge();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(updateMongoConnectionsGauge, intervalMs);
  if (typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }
  return () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}