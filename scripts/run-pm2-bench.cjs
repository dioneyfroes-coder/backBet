/* eslint-env node */
'use strict';
// Orquestrador do bench de PM2 (cenários pesados da fase P1).
//
// Uso:
//   node scripts/run-pm2-bench.cjs                  # roda todos os cenários
//   node scripts/run-pm2-bench.cjs e2e throughput    # subconjunto
//   BENCH_FAST=1 node scripts/run-pm2-bench.cjs      # lock/stall curtos (mais rápido)
//
// Cenários (worker sintético bench_ping):
//   e2e         início-ao-fim REAL: deposit -> withdrawal APPROVED -> payout
//               COMPLETED (wallet/ledger debitados) pelos 4 workers do PM2
//   throughput  filas: 400 jobs com 1 instância vs 4 instâncias
//   interrupt   início-interrupção-continuação: scale 4->1 no meio do batch
//               (jobs presos viram stalled e são retomados)
//   switch      troca de worker em pleno vôo: app A derrubado, app B assume
//   crash       crash do worker (process.exit(1)) + autorestart do PM2 + retry
//   perf500     comparação de desempenho: 500 jobs com PM2 (4 inst) vs sem PM2
//               (1 e 4 processos diretos spawnados sem orquestrador)
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Queue } = require('bullmq');
const pm2 = require('pm2');
const { benchEnv, PING_QUEUE } = require('./pm2-bench-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const PING_WORKER_SCRIPT = path.join('scripts', 'bench-ping-worker.cjs');

const args = process.argv.slice(2);
const ALL_SCENARIOS = ['e2e', 'throughput', 'interrupt', 'switch', 'crash', 'perf500'];
const scenarios = !args.length || args.includes('all') ? ALL_SCENARIOS : args;
const FAST = process.env.BENCH_FAST === '1';

const log = (...m) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
  log(`OK: ${msg}`);
}

// ------------------------- helpers do PM2 -------------------------
const connect = () => new Promise((res, rej) => pm2.connect(true, (e) => (e ? rej(e) : res())));
const disconnect = () => new Promise((r) => pm2.disconnect(() => r()));
const startApp = (cfg) => new Promise((res, rej) => pm2.start(cfg, (e) => (e ? rej(e) : res())));
const startFile = (rel, opts) =>
  new Promise((res, rej) => pm2.start(path.join(ROOT, rel), opts || {}, (e) => (e ? rej(e) : res())));
const deleteApp = (sel) => new Promise((res, rej) => pm2.delete(sel, (e) => (e ? rej(e) : res())));
const scaleApp = (name, n) => new Promise((res, rej) => pm2.scale(name, n, (e) => (e ? rej(e) : res())));
const listApps = () => new Promise((res, rej) => pm2.list((e, d) => (e ? rej(e) : res(d))));

async function deleteStartsWith(prefix) {
  const apps = await listApps();
  for (const app of apps) {
    if (app.name && String(app.name).startsWith(prefix)) {
      try {
        await deleteApp(app.name);
      } catch {}
    }
  }
}

async function onlineCount(name) {
  const apps = await listApps();
  return apps.filter((a) => a.name === name && a.pm2_env && a.pm2_env.status === 'online').length;
}

async function waitOnline(name, n, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await onlineCount(name)) >= n) return;
    await sleep(500);
  }
  throw new Error(`timeout aguardando ${name} online (esperava ${n})`);
}

// ------------------------- helpers da fila -------------------------
const IORedis = require('ioredis');

function makeQueue() {
  const connection = new IORedis(benchEnv().REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', () => {});
  return new Queue(PING_QUEUE, { connection });
}

async function qCounts(q) {
  const c = await q.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  c.waiting = c.waiting || 0;
  c.active = c.active || 0;
  c.delayed = c.delayed || 0;
  c.completed = c.completed || 0;
  c.failed = c.failed || 0;
  return c;
}

async function enqueue(q, total) {
  await q.obliterate({ force: true });
  await q.addBulk(Array.from({ length: total }, (_, i) => ({ name: 'ping', data: { i } })));
}

async function waitDrain(q, total, timeoutMs, label) {
  const start = Date.now();
  let lastLog = 0;
  while (Date.now() - start < timeoutMs) {
    const c = await qCounts(q);
    const finished = c.completed + c.failed;
    const pending = c.waiting + c.active + c.delayed;
    const now = Date.now();
    if (now - lastLog >= 5000) {
      lastLog = now;
      log(`${label}: done=${finished}/${total} waiting=${c.waiting} active=${c.active} delayed=${c.delayed} failed=${c.failed}`);
    }
    if (finished >= total && pending === 0) {
      return { finished, failed: c.failed, ms: Date.now() - start };
    }
    await sleep(1000);
  }
  const c = await qCounts(q);
  throw new Error(`${label}: timeout (${Date.now() - start}ms) ${JSON.stringify(c)}`);
}

async function waitFinishedAtLeast(q, n, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = await qCounts(q);
    if (c.completed + c.failed >= n) return c;
    await sleep(400);
  }
  throw new Error(`timeout esperando >= ${n} jobs concluídos`);
}

// ------------------------- driver tsx (E2E real) -------------------------
function runTsx(relScript, extraEnv, timeoutMs) {
  return new Promise((resolve) => {
    const tsxBin = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    const child = spawn(process.execPath, [tsxBin, relScript], {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += String(d);
      process.stdout.write(String(d));
    });
    child.stderr.on('data', (d) => {
      err += String(d);
      process.stdout.write(String(d));
    });
    const t = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code, out, err });
    });
  });
}

function pingEnv(extra = {}) {
  const env = benchEnv();
  Object.assign(env, {
    BENCH_PING_MS: '30',
    BENCH_LOCK_MS: FAST ? '6000' : '30000',
    BENCH_STALL_MS: FAST ? '1500' : '30000',
    ...extra,
  });
  return env;
}

const pingApp = (name, instances, extraEnv = {}) => ({
  name,
  script: PING_WORKER_SCRIPT,
  cwd: ROOT,
  exec_mode: 'cluster',
  instances,
  max_memory_restart: '256M',
  autorestart: true,
  watch: false,
  merge_logs: true,
  env: pingEnv(extraEnv),
});

// ------------------------- cenários -------------------------
function spawnDirectWorker(extraEnv = {}) {
  const child = spawn(process.execPath, [PING_WORKER_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, ...pingEnv(extraEnv) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => {
    out += String(d);
    process.stdout.write(String(d));
  });
  child.stderr.on('data', (d) => {
    out += String(d);
    process.stdout.write(String(d));
  });
  return { child, get ready() { return out.includes('[bench-ping] ready'); } };
}

async function waitDirectWorkerReady(w, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (w.ready) return;
    if (w.child.exitCode !== null) throw new Error('worker direto morreu antes do ready');
    await sleep(300);
  }
  throw new Error('timeout aguardando worker direto ready');
}

const waitExit = (child) => new Promise((r) => child.on('exit', () => r()));

async function measureDirect(q, total, procs) {
  await enqueue(q, total);
  const workers = Array.from({ length: procs }, () => spawnDirectWorker());
  try {
    for (const w of workers) await waitDirectWorkerReady(w, 30_000);
    const res = await waitDrain(q, total, FAST ? 120_000 : 300_000, `[sem PM2 ${procs} proc]`);
    // jobs activos em voo terminam antes do SIGTERM
    await sleep(1000);
    return res;
  } finally {
    for (const w of workers) w.child.kill('SIGTERM');
    try {
      await Promise.all(workers.map((w) => waitExit(w.child)));
    } catch {}
  }
}

async function measureWithPm(q, total, instances) {
  const name = 'bench-ping-pm';
  await enqueue(q, total);
  await startApp(pingApp(name, instances));
  try {
    await waitOnline(name, instances, 30_000);
    return await waitDrain(q, total, FAST ? 120_000 : 300_000, `[PM2 ${instances}x]`);
  } finally {
    await deleteApp(name).catch(() => {});
  }
}

async function scenarioPerf500() {
  log('=== cenário: 500 jobs — PM2 (4 inst) vs sem PM2 (1 e 4 processos diretos) ===');
  const q = makeQueue();
  const total = 500;
  try {
    const r_direct1 = await measureDirect(q, total, 1);
    const r_direct4 = await measureDirect(q, total, 4);
    const r_pm4 = await measureWithPm(q, total, 4);
    const rate = (ms) => (ms > 0 ? Math.round((total / ms) * 1000) : 0);
    log('RESULTADO 500 jobs:');
    log(`  sem PM2 (1 proc) : ${r_direct1.ms}ms (${rate(r_direct1.ms)}/s)  failed=${r_direct1.failed}`);
    log(`  sem PM2 (4 proc) : ${r_direct4.ms}ms (${rate(r_direct4.ms)}/s)  failed=${r_direct4.failed}`);
    log(`  com PM2 (4 inst) : ${r_pm4.ms}ms (${rate(r_pm4.ms)}/s)  failed=${r_pm4.failed}`);
    log(`  speedup PM2 4x vs 1 proc       = ${(r_direct1.ms / r_pm4.ms).toFixed(2)}x`);
    log(`  overhead PM2 (4x/4 proc sem)   = ${((r_pm4.ms / r_direct4.ms) * 100 - 100).toFixed(1)}%`);
    assert(r_direct1.failed === 0 && r_direct4.failed === 0 && r_pm4.failed === 0, 'zero falhas em todas as variantes');
  } finally {
    try {
      await q.close();
    } catch {}
  }
}

async function ensureWithdrawalWorkers() {
  if ((await onlineCount('bench-withdrawal-worker', 1)) >= 1) return;
  await deleteApp('bench-withdrawal-worker').catch(() => {});
  log('subindo bench-withdrawal-worker a partir de ecosystem.bench.config.cjs');
  await startFile('ecosystem.bench.config.cjs', { only: 'bench-withdrawal-worker' });
  await waitOnline('bench-withdrawal-worker', 4, 30_000);
}

async function scenarioE2E() {
  log('=== cenário: início-ao-fim (deposit -> withdrawal APPROVED -> payout pelos 4 workers PM2) ===');
  await ensureWithdrawalWorkers();
  const res = await runTsx(path.join('src', 'scripts', 'bench-e2e.ts'), benchEnv(), 240_000);
  assert(res.code === 0, `driver E2E finalizou com exit=0 (code=${res.code})`);
}

async function scenarioThroughput() {
  log('=== cenário: filas — 400 jobs, 1 instância vs 4 instâncias ===');
  const q = makeQueue();
  try {
    await enqueue(q, 400);
    await startApp(pingApp('bench-ping-1', 1));
    await waitOnline('bench-ping-1', 1, 20_000);
    const r1 = await waitDrain(q, 400, FAST ? 60_000 : 180_000, '[1 instancia]');
    await deleteApp('bench-ping-1');

    await enqueue(q, 400);
    await startApp(pingApp('bench-ping-4', 4));
    await waitOnline('bench-ping-4', 4, 20_000);
    const r4 = await waitDrain(q, 400, FAST ? 60_000 : 180_000, '[4 instancias]');
    await deleteApp('bench-ping-4');

    const rate = (total, ms) => (ms > 0 ? Math.round((total / ms) * 1000) : 0);
    log(`RESULTADO filas: 1x=${r1.ms}ms (${rate(400, r1.ms)}/s)  4x=${r4.ms}ms (${rate(400, r4.ms)}/s)  speedup=${(r1.ms / r4.ms).toFixed(2)}x`);
  } finally {
    try {
      await q.close();
    } catch {}
  }
}

async function scenarioInterrupt() {
  log('=== cenário: início-interrupção-continuação (scale 4->1 no meio do batch) ===');
  const q = makeQueue();
  try {
    await enqueue(q, 300);
    await startApp(pingApp('bench-ping-ir', 4));
    await waitOnline('bench-ping-ir', 4, 20_000);
    await waitFinishedAtLeast(q, 60, 30_000);
    const before = await qCounts(q);
    log(`interrompendo: scale 4 -> 1 (jobs em voo ficam presos ate o lock expirar e o stalled check retomar)`);
    await scaleApp('bench-ping-ir', 1);
    await waitOnline('bench-ping-ir', 1, 20_000);
    await sleep(2000);
    const paused = await qCounts(q);
    assert(paused.waiting + paused.delayed + paused.active > 0, `jobs retidos na interrupcao (waiting=${paused.waiting} active=${paused.active})`);
    const res = await waitDrain(q, 300, FAST ? 90_000 : 240_000, '[interrupcao-continuacao]');
    assert(res.failed === 0, 'zero falhas apos interrupcao');
    assert(res.finished === 300, `todos processados (${res.finished}/300) do estado inicial waiting=${before.waiting} active=${before.active}`);
    await deleteApp('bench-ping-ir');
  } finally {
    try {
      await q.close();
    } catch {}
  }
}

async function scenarioSwitch() {
  log('=== cenário: troca de worker em pleno vôo (app A -> app B) ===');
  const q = makeQueue();
  try {
    await enqueue(q, 200);
    await startApp(pingApp('bench-ping-a', 2));
    await waitOnline('bench-ping-a', 2, 20_000);
    await waitFinishedAtLeast(q, 30, 30_000);
    await deleteApp('bench-ping-a');
    await startApp(pingApp('bench-ping-b', 3));
    await waitOnline('bench-ping-b', 3, 20_000);
    const res = await waitDrain(q, 200, FAST ? 60_000 : 240_000, '[troca de worker]');
    assert(res.failed === 0, 'zero falhas na troca de worker');
    assert(res.finished === 200, `todos processados (${res.finished}/200)`);
    await deleteApp('bench-ping-b');
  } finally {
    try {
      await q.close();
    } catch {}
  }
}

async function scenarioCrash() {
  log('=== cenário: crash do worker + autorestart do PM2 + retry do job ===');
  const q = makeQueue();
  try {
    await enqueue(q, 100);
    await startApp(pingApp('bench-ping-crash', 1, { BENCH_CRASH_AFTER: '40' }));
    await waitOnline('bench-ping-crash', 1, 20_000);
    const res = await waitDrain(q, 100, FAST ? 90_000 : 300_000, '[crash+autorestart]');
    assert(res.failed === 0, 'zero falhas apos crash do worker');
    assert(res.finished === 100, `todos processados (${res.finished}/100)`);
    const apps = await listApps();
    const entry = apps.find((a) => a.name === 'bench-ping-crash');
    const restarts = entry && entry.pm2_env ? entry.pm2_env.restart_time : 0;
    assert(restarts >= 1, `PM2 auto-reiniciou o worker (restart_time=${restarts})`);
    await deleteApp('bench-ping-crash');
  } finally {
    try {
      await q.close();
    } catch {}
  }
}

// ------------------------- main -------------------------
async function printMaintained() {
  const apps = await listApps();
  const keptnames = [...new Set(apps.filter((a) => a.name && ['bench-api', 'bench-withdrawal-worker', 'bench-contact-worker'].includes(a.name)).map((a) => a.name))];
  log('apps mantidos no PM2 (stack do lab sob PM2):', keptnames.join(' | ') || '(nenhum)');
}

async function main() {
  log(`run-pm2-bench iniciado: cenários=[${scenarios.join(', ')}] fast=${FAST}`);
  await connect();
  let ok = true;
  try {
    await deleteStartsWith('bench-');
    if (scenarios.includes('e2e')) await ensureWithdrawalWorkers();
    const registry = {
      e2e: scenarioE2E,
      throughput: scenarioThroughput,
      interrupt: scenarioInterrupt,
      switch: scenarioSwitch,
      crash: scenarioCrash,
      perf500: scenarioPerf500,
    };
    for (const s of scenarios) {
      const fn = registry[s];
      if (!fn) throw new Error(`cenário desconhecido: ${s}`);
      await fn();
    }
    log('todos os cenários concluídos com sucesso.');
    await printMaintained();
  } catch (err) {
    ok = false;
    console.error('FALHA:', (err && err.stack) || err);
  } finally {
    // O callback do pm2.disconnect() nem sempre dispara; encerra por conta.
    try {
      pm2.disconnect();
    } catch {}
    setTimeout(() => process.exit(ok ? 0 : 1), 400);
  }
}

main();