#!/usr/bin/env node
'use strict';

/**
 * Fase 2 — Carga progressiva (BackBet).
 *
 * Uso:
 *   node scripts/load-driver.cjs <scale>        (ex.: 1, 2, 5, 10)
 *   node scripts/load-driver.cjs 1 2 5 10       (sequencial)
 *   node scripts/load-driver.cjs --distributed 1 2 5
 *
 * Por padrão roda a suíte de CONTENÇÃO (load.concurrency — N ops na mesma
 * carteira). Com `--distributed` roda a suíte de carga distribuída
 * (load.distributed — N carteiras distintas, eixo horizontal) e grava os
 * resultados com os marcadores DLOAD*.
 *
 * Para cada escala:
 *   - inicia um amostrador de recursos em background (docker stats + opcounters
 *     MongoDB + INFO do Redis), sem expor segredos (lê credenciais do env interno
 *     dos containers de produção);
 *   - roda a suíte de integração real via `docker compose --profile tests run`,
 *     passando LOAD_SCALE=<escala> e o spec selecionado;
 *   - captura a saída e extrai: tempo, operações realizadas, rejeições, falhas;
 *   - grava CSVs + resumo por escala em scripts/load-results/scale-<N>-<mode>/ e o
 *     agregado (por scale+mode) em scripts/load-results/resumo.json.
 */

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'scripts', 'load-results');
const MONGO = 'backbet-mongodb-1';
const REDIS = 'backbet-redis-1';
const APP = 'backbet-backbet-1';

const SPEC_CONCURRENCY = 'src/integration/__tests__/load.concurrency.integration.test.ts';
const SPEC_DISTRIBUTED = 'src/integration/__tests__/load.distributed.integration.test.ts';

const argv = process.argv.slice(2);
const distributed = argv.includes('--distributed');
const spec = distributed ? SPEC_DISTRIBUTED : SPEC_CONCURRENCY;
const scales = argv.filter((a) => /^\d+$/.test(a)).map(Number);
if (scales.length === 0) scales.push(1);

function sh(args, opts = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout: 20000, ...opts });
}

function runContainerName() {
  const r = sh(['ps', '-q', '--filter', 'name=backbet-integration-tests-run']);
  return (r.stdout || '').trim().split('\n').filter(Boolean);
}

function startSampler(dirName) {
  const dir = path.join(outRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const cpuRam = path.join(dir, 'cpu-ram.csv');
  const mongoCsv = path.join(dir, 'mongo.csv');
  const redisCsv = path.join(dir, 'redis.csv');
  fs.writeFileSync(cpuRam, 'time,container,cpu_pct,mem_used,mem_pct\n');
  fs.writeFileSync(mongoCsv, 'time,insert,query,update,delete,conn,queue_total\n');
  fs.writeFileSync(redisCsv, 'time,connected_clients,ops_per_sec,used_memory_human\n');

  let lastMongo = { insert: 0, query: 0, update: 0, delete: 0 };
  const timer = setInterval(() => {
    const ts = new Date().toISOString();
    try {
      const names = [...new Set([MONGO, REDIS, APP, ...runContainerName()])];
      const st = sh(['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}', ...names]);
      if (st.status === 0 && st.stdout) {
        for (const raw of st.stdout.trim().split('\n')) {
          const line = raw.trim();
          if (!line) continue;
          const [name, cpu, mem, memPct] = line.split('|');
          fs.appendFileSync(cpuRam, `${ts},${name},${cpu},${mem},${memPct}\n`);
        }
      }
    } catch (e) {
      fs.appendFileSync(cpuRam, `${ts},sampler_error,${e.message}\n`);
    }

    try {
      const mongoCmd = 'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "JSON.stringify({op:db.serverStatus().opcounters,conn:db.serverStatus().connections.current,q:db.serverStatus().globalLock.currentQueue})"';
      const mo = sh(['exec', MONGO, 'sh', '-c', mongoCmd]);
      if (mo.status === 0 && mo.stdout) {
        const j = JSON.parse(mo.stdout.trim().split('\n').pop() || 'null');
        if (j) {
          const num = (x) =>
            x && typeof x === 'object' && 'low' in x
              ? Number(x.low) + Number(x.high || 0) * 2 ** 32
              : Number(x || 0);
          fs.appendFileSync(mongoCsv, `${ts},${num(j.op.insert)},${num(j.op.query)},${num(j.op.update)},${num(j.op.delete)},${j.conn},${(j.q && j.q.total) || 0}\n`);
          lastMongo = j.op;
        }
      }
    } catch { /* mongosh pode estar ocupado — ignora amostra */ }

    try {
      const ro = sh(
        ['exec', REDIS, 'sh', '-c',
          'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO stats; redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO memory | grep used_memory_human'],
      );
      if (ro.status === 0 && ro.stdout) {
        const text = ro.stdout;
        const g = (k) => (text.match(new RegExp(`^${k}:(.+)$`, 'm')) || [])[1] || '';
        fs.appendFileSync(redisCsv, `${ts},${g('connected_clients')},${g('instantaneous_ops_per_sec')},${g('used_memory_human')}\n`);
      }
    } catch { /* ignora amostra */ }
  }, 3000);
  return { timer, dir, stop() { clearInterval(timer); } };
}

function runSuite(scale) {
  return new Promise((resolve) => {
    const args = [
      'compose',
      '--profile',
      'tests',
      'run',
      '--rm',
      '-e',
      `LOAD_SCALE=${scale}`,
      'integration-tests',
      'node',
      'scripts/run-integration-tests.cjs',
      '--',
      spec,
    ];
    const child = spawn('docker', args, { cwd: root });
    let output = '';
    const started = Date.now();
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', (e) => resolve({ status: -1, elapsedMs: Date.now() - started, output: output + '\n' + e.message }));
    child.on('close', (code) => resolve({ status: code, elapsedMs: Date.now() - started, output }));
  });
}

function parseOut(text, scale) {
  const res = {};
  const loadOrDload = (key, digitsOnly) => {
    const d = new RegExp(`DLOAD ${key}:\\s*([^\\n]+)`).exec(text);
    if (d) return { source: 'DLOAD', match: d[1] };
    const l = new RegExp(`LOAD ${key}:\\s*(${digitsOnly ? '\\d+' : '[^\\n]+'})`).exec(text);
    if (l) return { source: 'LOAD', match: l[1] };
    return undefined;
  };

  const rejected = loadOrDload('rejected', true);
  if (rejected) res['LOAD rejected'] = rejected.match;

  const deposits = loadOrDload('deposits');
  if (deposits) res[`${deposits.source} deposits`] = deposits.match;
  const withdrawals = loadOrDload('withdrawals');
  if (withdrawals) res[`${withdrawals.source} withdrawals`] = withdrawals.match;
  const bets = loadOrDload('bets');
  if (bets) res[`${bets.source} bets`] = bets.match;
  const total = new RegExp('DLOAD total ops: ([^\\n]+)').exec(text);
  if (total) res['DLOAD total ops'] = total[1];

  res['Tests:'] = (text.match(/Tests:\s*([^\n]+)/) || [])[1];
  res['Test Suites:'] = (text.match(/Test Suites:\s*([^\n]+)/) || [])[1];
  res['jest Time:'] = (text.match(/Time:\s*([^\n]+)/) || [])[1];
  return res;
}

function avg(list) {
  return list.length
    ? (list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)
    : '0';
}

function summarize(dir, res) {
  const cpuFile = path.join(dir, 'cpu-ram.csv');
  const mongoFile = path.join(dir, 'mongo.csv');
  const redisFile = path.join(dir, 'redis.csv');
  const summaries = {};

  if (fs.existsSync(cpuFile)) {
    const lines = fs.readFileSync(cpuFile, 'utf8').trim().split('\n').slice(1);
    const byContainer = {};
    for (const line of lines) {
      const [t, name, cpu, mem, memPct] = line.split(',');
      if (!byContainer[name]) byContainer[name] = { cpu: [], cpuPeak: 0 };
      const c = parseFloat(cpu.replace('%', '')) || 0;
      byContainer[name].cpu.push(c);
      if (c > byContainer[name].cpuPeak) byContainer[name].cpuPeak = c;
    }
    summaries.cpu = {};
    for (const [name, v] of Object.entries(byContainer)) {
      summaries.cpu[name] = { avg: avg(v.cpu), peak: v.cpuPeak };
    }
  }
  if (fs.existsSync(redisFile)) {
    const lines = fs.readFileSync(redisFile, 'utf8').trim().split('\n').slice(1);
    const ops = [];
    const mems = [];
    for (const line of lines) {
      const [, , opsNow, mem] = line.split(',');
      if (opsNow) ops.push(Number(opsNow));
      if (mem) mems.push(mem);
    }
    summaries.redis = { opsPerSecAvg: avg(ops), opsPerSecPeak: ops.length ? Math.max(...ops) : 0, mem: mems[mems.length - 1] || '' };
  }
  if (fs.existsSync(mongoFile)) {
    const lines = fs.readFileSync(mongoFile, 'utf8').trim().split('\n').slice(1);
    const rows = lines.map((l) => l.split(',').map(Number));
    const deltas = (idx) => {
      const d = [];
      for (let i = 1; i < rows.length; i += 1) d.push(rows[i][idx] - rows[i - 1][idx]);
      return d;
    };
    const sum = (arr) => arr.filter((x) => x > 0).reduce((a, b) => a + b, 0);
    summaries.mongo = {
      insertOps: sum(deltas(1)),
      queryOps: sum(deltas(2)),
      updateOps: sum(deltas(3)),
      deleteOps: sum(deltas(4)),
      connAvg: avg(rows.map((r) => r[5])),
      queuePeak: rows.length ? Math.max(...rows.map((r) => r[6] || 0)) : 0,
    };
  }
  return summaries;
}

async function main() {
  const resumoPath = path.join(outRoot, 'resumo.json');
  let all = [];
  try {
    if (fs.existsSync(resumoPath)) all = JSON.parse(fs.readFileSync(resumoPath, 'utf8'));
  } catch {
    all = [];
  }
  const mode = distributed ? 'distributed' : 'contention';
  const label = distributed ? 'DISTRIBUÍDA' : 'CONTENÇÃO';
  for (const scale of scales) {
    const dirName = `scale-${scale}-${mode}`;
    console.log(`\n===== CARGA PROGRESSIVA ${label} — LOAD_SCALE=${scale} =====`);
    const sampler = startSampler(dirName);
    const r = await runSuite(scale);
    sampler.stop();

    const text = r.output;
    fs.writeFileSync(path.join(sampler.dir, 'suite-output.txt'), text);
    const res = parseOut(text, scale);
    res.wallSec = (r.elapsedMs / 1000).toFixed(1);
    res.exit = r.status;

    const sum = summarize(sampler.dir, res);
    const agg = { scale, mode, spec, ...res, ...sum };
    const idx = all.findIndex((e) => e.scale === scale && e.mode === mode);
    if (idx >= 0) all[idx] = agg;
    else all.push(agg);

    fs.writeFileSync(
      path.join(outRoot, dirName, 'resumo.json'),
      JSON.stringify(agg, null, 2),
    );
    fs.writeFileSync(resumoPath, JSON.stringify(all, null, 2));

    console.log(`LOAD_SCALE=${scale} (${distributed ? 'DLOAD' : 'LOAD'}) => exit=${r.status} wall=${res.wallSec}s`);
    console.log('  resultado suite:', {
      tests: res['Tests:'],
      suites: res['Test Suites:'],
      rejected: res['LOAD rejected'],
      ops: {
        deposits: res['DLOAD deposits'] ?? res['LOAD deposits'],
        withdrawals: res['DLOAD withdrawals'] ?? res['LOAD withdrawals'],
        bets: res['DLOAD bets'] ?? res['LOAD bets'],
      },
    });
    console.log('  CPU média/pico:', sum.cpu);
    console.log('  Mongo opcounters:', sum.mongo);
    console.log('  Redis ops/s médio/pico:', sum.redis);
  }
  console.log('\nResumo final em scripts/load-results/resumo.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});