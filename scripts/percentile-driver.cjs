#!/usr/bin/env node
'use strict';

/**
 * Fase 14 — Baseline de performance (BackBet).
 *
 * Roda o spec de benchmark (PERC_LEVELS, default 50..500 concurrence) dentro da
 * rede do docker-compose.test.yml (serviço `integration-tests`), captura as
 * linhas `PERC <json>` emitidas pela suíte e grava o relatório em
 * scripts/load-results/fase14/<runId>/ (report.json + report.md).
 *
 * Além das métricas de latência/throughput/conflitos emitidas pela suíte, este
 * driver amostra `docker stats` (CPU% e RAM) dos containers mongodb/redis e do
 * próprio integration-tests enquanto a suíte corre, e agrega pico/média por
 * container no relatório. CPU/RAM do processo da suíte e latência de ping de
 * Mongo/Redis vêm da telemetria embutida no spec.
 *
 * Uso:
 *   node scripts/percentile-driver.cjs
 *   PERC_LEVELS=50 node scripts/percentile-driver.cjs
 *   PERC_KEEP_INFRA=1 node scripts/percentile-driver.cjs   # não derruba a infra
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const composeFile = path.join(root, 'docker-compose.test.yml');
const outRoot = path.join(root, 'scripts', 'load-results', 'fase14');
const SPEC = 'src/integration/__tests__/load.percentiles.integration.test.ts';

const RUN_CONTAINER = 'backbet-perc-run';
const STAT_CONTAINERS = [
  'backbet-test-mongodb-1',
  'backbet-test-redis-1',
  RUN_CONTAINER,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round2 = (n) => Math.round(n * 100) / 100;

function parseCpuPct(value) {
  const parsed = parseFloat(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseMemMb(value) {
  const match = String(value).match(/([0-9.]+)\s*([KMG])i?B/i);
  if (!match) return 0;
  const amount = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'G') return amount * 1024;
  if (unit === 'K') return amount / 1024;
  return amount;
}

function summarizeStats(store) {
  const out = {};
  for (const [name, samples] of Object.entries(store)) {
    if (samples.length === 0) continue;
    out[name] = {
      samples: samples.length,
      cpuPctPeak: round2(Math.max(...samples.map((s) => s.cpuPct))),
      cpuPctAvg: round2(samples.reduce((a, s) => a + s.cpuPct, 0) / samples.length),
      memMbPeak: round2(Math.max(...samples.map((s) => s.memMb))),
      memMbAvg: round2(samples.reduce((a, s) => a + s.memMb, 0) / samples.length),
    };
  }
  return out;
}

async function statsLoop(store, stop) {
  while (!stop.done) {
    const result = spawnSync(
      'docker',
      [
        'stats',
        '--no-stream',
        '--format',
        '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}',
        ...STAT_CONTAINERS,
      ],
      { encoding: 'utf8' },
    );
    const text = (result.stdout || '') + (result.stderr || '');
    for (const raw of text.split('\n')) {
      const [name, cpu, mem] = raw.trim().split('|');
      if (!name || !name.startsWith('backbet')) continue;
      if (!store[name]) store[name] = [];
      store[name].push({ cpuPct: parseCpuPct(cpu), memMb: parseMemMb(mem) });
    }
    await sleep(1200);
  }
}

function runSuite() {
  return new Promise((resolve) => {
    const envArgs = [];
    for (const key of ['PERC_LEVELS', 'PERC_MAX_WAVE_MS', 'PERC_SCENARIOS', 'PERC_SAMPLE_MS']) {
      if (process.env[key]) envArgs.push('-e', `${key}=${process.env[key]}`);
    }
    const args = [
      'compose',
      '-f',
      composeFile,
      'run',
      '--rm',
      '--name',
      RUN_CONTAINER,
      ...envArgs,
      'integration-tests',
      'node',
      'scripts/run-integration-tests.cjs',
      '--',
      SPEC,
    ];
    const child = spawn('docker', args, { cwd: root });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', (e) =>
      resolve({ status: -1, output: output + '\n' + e.message }),
    );
    child.on('close', (code) => resolve({ status: code, output }));
  });
}

function parsePercLines(text) {
  const reports = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('PERC ')) continue;
    try {
      reports.push(JSON.parse(line.slice('PERC '.length)));
    } catch {
      // linha PERC malformada — ignora (a saída do jest pode intercalar cores)
    }
  }
  return reports;
}

function pctSummary(reports, scenario) {
  const rows = reports.filter((r) => r.scenario === scenario).sort((a, b) => a.level - b.level);
  if (rows.length === 0) return '  (sem amostras)';
  const lines = [
    '  level | p50      p95      p99      mean     max   | concluídas/rejeitadas | wall_ms  | ops/s | cpu%   rss_peak  mongo_ping  redis_ping',
    '  ------+-------------------------------------------+-----------------------+----------+-------+----------------------------------------',
  ];
  for (const r of rows) {
    const L = r.latencyMs;
    const T = r.telemetry ?? {};
    const tag = r.capped ? 'CAP' : 'ok ';
    lines.push(
      `  ${String(r.level).padStart(5)} | ${String(L.p50).padStart(7)} ${String(L.p95).padStart(7)} ${String(L.p99).padStart(7)} ${String(L.mean).padStart(7)} ${String(L.max).padStart(7)} | ${tag} ${String(r.fulfilled).padStart(5)}/${String(r.rejected).padStart(5)} | ${String(r.wallMs).padStart(8)} | ${String(r.opsPerSec).padStart(5)} | ${String(T.cpuPct ?? '—').padStart(6)} ${String(T.rssPeakMb ?? '—').padStart(8)} ${String(T.mongoPingMs ?? '—').padStart(10)} ${String(T.redisPingMs ?? '—').padStart(10)}`,
    );
  }
  return lines.join('\n');
}

function buildMarkdown(reports, meta) {
  const byLevel = new Map();
  for (const r of reports) {
    if (!byLevel.has(r.level)) byLevel.set(r.level, {});
    byLevel.get(r.level)[r.scenario] = r;
  }
  let md = `# Fase 14 — Baseline de performance pós-correções (BackBet)\n\n`;
  md += `- **runId**: ${meta.runId}\n`;
  md += `- **executado em**: ${meta.ranAt}\n`;
  md += `- **níveis**: ${meta.levels.join(', ')}\n`;
  md += `- **carga**: N depósitos de R$ ${meta.depositAmount} — contenção (mesma carteira) / distribuído (carteiras distintas)\n`;
  if (meta.exitCode !== 0) md += `- **exit**: ${meta.exitCode} (atenção: run incompleto)\n`;
  md += `\n## p50/p95/p99 + recursos (por onda)\n\n`;
  md += `| level | cenário | p50 | p95 | p99 | mean | max | concluídas | rejeitadas | capped | wall_ms | ops/s | cpu% | rss_peak_MB | mongo_ping_ms | redis_ping_ms |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const [level, pair] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const row = (scenario) => {
      const r = pair[scenario];
      if (!r) return `| ${level} | ${scenario} | — | — | — | — | — | — | — | — | — | — | — | — | — | — |`;
      const L = r.latencyMs;
      const T = r.telemetry ?? {};
      return `| ${level} | ${r.scenario} | ${L.p50} | ${L.p95} | ${L.p99} | ${L.mean} | ${L.max} | ${r.fulfilled} | ${r.rejected} | ${r.capped ? 'sim' : 'não'} | ${r.wallMs} | ${r.opsPerSec} | ${T.cpuPct ?? '—'} | ${T.rssPeakMb ?? '—'} | ${T.mongoPingMs ?? '—'} | ${T.redisPingMs ?? '—'} |`;
    };
    md += `${row('contention')}\n`;
    md += `${row('distributed')}\n`;
  }
  const infra = meta.infra ?? {};
  if (Object.keys(infra).length > 0) {
    md += `\n## Recursos dos containers (docker stats)\n\n`;
    md += `| container | amostras | cpu% pico | cpu% média | RAM pico (MB) | RAM média (MB) |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    for (const [name, s] of Object.entries(infra)) {
      md += `| ${name} | ${s.samples} | ${s.cpuPctPeak} | ${s.cpuPctAvg} | ${s.memMbPeak} | ${s.memMbAvg} |\n`;
    }
  }
  md += `\n> Nota: conflitos = AppError CONFLICT (409) emitido pelo CAS de versão da\n`;
  md += `> carteira; retries = reexecuções da operação por conflito. Retries do\n`;
  md += `> driver do MongoDB (TransientTransactionError/UnknownTransactionCommitResult)\n`;
  md += `> acontecem dentro de \`session.withTransaction\` e não são observáveis aqui.\n`;
  md += `> Rejeitadas em cenário de contenção com \`capped\` são WriteConflict (112)\n`;
  md += `> que esgotaram o retry interno do driver — ou excederam o orçamento da onda\n`;
  md += `> (WAVE_CAP) se marcadas como adiadas. \`cpu%\`/\`rss_peak_MB\` são do processo\n`;
  md += `> da suíte; \`mongo_ping_ms\`/\`redis_ping_ms\` são medianas de RTT das sondas\n`;
  md += `> durante a onda; CPU/RAM dos containers estão na seção docker stats.\n`;
  return md;
}

async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  const startedAt = new Date();
  const statsStore = {};
  const stop = { done: false };
  const statsPromise = statsLoop(statsStore, stop);

  const levels = process.env.PERC_LEVELS ?? '50,100,150,200,300,500';
  console.log(`===== FASE 14 — BASELINE DE PERFORMANCE (níveis: ${levels}) =====`);
  const r = await runSuite();
  stop.done = true;
  await statsPromise;

  const reports = parsePercLines(r.output);
  const runId = reports[0]?.runId ?? startedAt.toISOString().replace(/[:.]/g, '-');
  const dir = path.join(outRoot, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'suite-output.txt'), r.output);

  const meta = {
    runId,
    ranAt: new Date().toISOString(),
    levels: [...new Set(reports.map((x) => x.level))].sort((a, b) => a - b),
    depositAmount: 1.25,
    exitCode: r.status,
    infra: summarizeStats(statsStore),
  };

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, reports }, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), buildMarkdown(reports, meta));

  console.log(`\n--- CONTENÇÃO (mesma carteira) ---`);
  console.log(pctSummary(reports, 'contention'));
  console.log(`\n--- DISTRIBUÍDO (carteiras distintas) ---`);
  console.log(pctSummary(reports, 'distributed'));
  console.log(`\n--- RECURSOS DOS CONTAINERS (docker stats) ---`);
  for (const [name, s] of Object.entries(meta.infra)) {
    console.log(
      `  ${name}: cpu pico ${s.cpuPctPeak}% (média ${s.cpuPctAvg}%) | RAM pico ${s.memMbPeak}MB (média ${s.memMbAvg}MB) | ${s.samples} amostras`,
    );
  }

  console.log(`\nexit=${r.status} amostras=${reports.length}`);
  console.log(`Relatório: ${path.relative(root, dir)}/report.md`);
  if (r.status !== 0) process.exitCode = 1;

  if (process.env.PERC_KEEP_INFRA !== '1') {
    spawnSync('docker', ['compose', '-f', composeFile, 'down', '-v'], {
      cwd: root,
      stdio: 'ignore',
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
