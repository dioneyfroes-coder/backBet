/* eslint-env node */
'use strict';
// Worker sintético usado no bench PM2 (scripts/run-pm2-bench.cjs).
// Processa jobs da fila bench_ping com um delay configurável, um lock renovado
// (lockDuration) e a opção de crashar após N jobs concluídos — para exercitar
// o autorestart do PM2 + recuperação de stalled jobs do BullMQ.
//
// Variáveis:
//   BENCH_PING_QUEUE   nome da fila (default bench_ping)
//   BENCH_PING_MS      tempo "de trabalho" por job (default 25)
//   BENCH_LOCK_MS      lockDuration (default 30000)
//   BENCH_STALL_MS     stalledInterval (default = lockDuration)
//   BENCH_CRASH_AFTER  crashar (process.exit(1)) após N jobs concluídos
const { Worker } = require('bullmq');
const IORedis = require('ioredis');

// O BullMQ v6 NÃO aceita `connection` como string de URL (cai em
// host:127.0.0.1:6379); é necessário passar um cliente ioredis, como o
// createBullMqConnection() da aplicação (src/infrastructure/queues/).
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});
connection.on('error', () => {});
const QUEUE = process.env.BENCH_PING_QUEUE || 'bench_ping';
const PING_MS = Number(process.env.BENCH_PING_MS || 25);
const LOCK_MS = Number(process.env.BENCH_LOCK_MS || 30000);
const STALL_MS = Number(process.env.BENCH_STALL_MS || LOCK_MS);
const CRASH_AFTER = process.env.BENCH_CRASH_AFTER ? Number(process.env.BENCH_CRASH_AFTER) : null;

let handled = 0;

const worker = new Worker(
  QUEUE,
  async () => {
    if (PING_MS > 0) {
      await new Promise((r) => setTimeout(r, PING_MS));
    }
    return { ok: true };
  },
  {
    connection,
    concurrency: 1,
    lockDuration: LOCK_MS,
    stalledInterval: STALL_MS,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
);

worker.on('ready', () => {
  console.log(`[bench-ping] ready queue=${QUEUE} ping=${PING_MS}ms lock=${LOCK_MS}ms stall=${STALL_MS}ms crashAfter=${CRASH_AFTER}`);
});
worker.on('completed', () => {
  if (CRASH_AFTER !== null) {
    handled += 1;
    if (handled >= CRASH_AFTER) {
      console.log(`[bench-ping] crash trigger apos ${handled} jobs — process.exit(1) para testar autorestart do PM2`);
      setImmediate(() => process.exit(1));
    }
  }
});
worker.on('failed', (job, err) => {
  console.error('[bench-ping] failed', job && job.id, err && err.message);
});

const shutdown = (signal) => {
  console.log(`[bench-ping] ${signal} recebido, fechando worker`);
  worker.close().catch(() => {}).finally(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));