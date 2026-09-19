#!/usr/bin/env node
'use strict';

/**
 * Fase 13 — Benchmark de percentis (BackBet).
 *
 * Uso:
 *   node scripts/percentile-driver.cjs
 *
 * Roda o spec de benchmark (50..500 concorrentes, contenção + distribuído)
 * dentro do container `integration-tests` (perfil `tests`), captura as linhas
 * `PERC <json>` emitidas pela suíte e grava o relatório em
 * scripts/load-results/fase13/<runId>/ (report.json + report.md).
 *
 * A suíte roda contra o MongoDB real da infra publicada (database de teste
 * MONGODB_TEST_DB), só com RUN_REAL_INTEGRATION_TESTS=true — que o runner
 * define automaticamente.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'scripts', 'load-results', 'fase13');
const SPEC = 'src/integration/__tests__/load.percentiles.integration.test.ts';

function runSuite() {
  return new Promise((resolve) => {
    const envArgs = [];
    for (const key of ['PERC_LEVELS', 'PERC_MAX_WAVE_MS', 'PERC_SCENARIOS']) {
      if (process.env[key]) envArgs.push('-e', `${key}=${process.env[key]}`);
    }
    const args = [
      'compose',
      '--profile',
      'tests',
      'run',
      '--rm',
      ...envArgs,
      'integration-tests',
      'node',
      'scripts/run-integration-tests.cjs',
      '--',
      SPEC,
    ];
    const child = spawn('docker', args, { cwd: root });
    let output = '';
    let stderr = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { stderr += d; output += d; });
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
    '  level | p50      p95      p99      mean     max   | concluídas/rejeitadas | wall_ms  | ops/s',
    '  ------+-------------------------------------------+-----------------------+----------+-------',
  ];
  for (const r of rows) {
    const L = r.latencyMs;
    const tag = r.capped ? 'CAP' : 'ok ';
    lines.push(
      `  ${String(r.level).padStart(5)} | ${String(L.p50).padStart(7)} ${String(L.p95).padStart(7)} ${String(L.p99).padStart(7)} ${String(L.mean).padStart(7)} ${String(L.max).padStart(7)} | ${tag} ${String(r.fulfilled).padStart(5)}/${String(r.rejected).padStart(5)} | ${String(r.wallMs).padStart(8)} | ${String(r.opsPerSec).padStart(7)}`,
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
  let md = `# Fase 13 — Benchmark de percentis (BackBet)\n\n`;
  md += `- **runId**: ${meta.runId}\n`;
  md += `- **executado em**: ${meta.ranAt}\n`;
  md += `- **niveis**: ${meta.levels.join(', ')}\n`;
  md += `- **carga**: N depósitos de R$ ${meta.depositAmount} — contenção (mesma carteira) / distribuído (carteiras distintas)\n\n`;
  md += `## p50/p95/p99 — latência por operação (ms)\n\n`;
  md += `| level | cenário | p50 | p95 | p99 | mean | max | concluídas | rejeitadas | capped | wall_ms | ops/s |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const [level, pair] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const row = (scenario) => {
      const r = pair[scenario];
      if (!r) return `| ${level} | ${scenario} | — | — | — | — | — | — | — | — | — | — |`;
      const L = r.latencyMs;
      return `| ${level} | ${r.scenario} | ${L.p50} | ${L.p95} | ${L.p99} | ${L.mean} | ${L.max} | ${r.fulfilled} | ${r.rejected} | ${r.capped ? 'sim' : 'não'} | ${r.wallMs} | ${r.opsPerSec} |`;
    };
    md += `${row('contention')}\n`;
    md += `${row('distributed')}\n`;
  }
  md += `\n> Nota: conflitos = AppError CONFLICT (409) emitido pelo CAS de versão da\n`;
  md += `> carteira; retries = reexecuções da operação por conflito. Retries do\n`;
  md += `> driver do MongoDB (TransientTransactionError/UnknownTransactionCommitResult)\n`;
  md += `> acontecem dentro de \`session.withTransaction\` e não são observáveis aqui.\n`;
  md += `> Rejeitadas em cenário de contenção com \`capped\` são WriteConflict (112)\n`;
  md += `> que esgotaram o retry interno do driver — ou excederam o orçamento da onda\n`;
  md += `> (WAVE_CAP) se marcadas como adiadas.\n`;
  return md;
}

async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const dir = path.join(outRoot, runId);
  fs.mkdirSync(dir, { recursive: true });

  console.log('===== FASE 13 — BENCHMARK DE PERCENTIS (50..500 concorrentes) =====');
  const r = await runSuite();

  fs.writeFileSync(path.join(dir, 'suite-output.txt'), r.output);
  const reports = parsePercLines(r.output);
  const meta = {
    runId,
    ranAt: new Date().toISOString(),
    levels: [...new Set(reports.map((r) => r.level))].sort((a, b) => a - b),
    depositAmount: 1.25,
    exitCode: r.status,
  };

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, reports }, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), buildMarkdown(reports, meta));

  console.log(`\n--- CONTENÇÃO (mesma carteira) ---`);
  console.log(pctSummary(reports, 'contention'));
  console.log(`\n--- DISTRIBUÍDO (carteiras distintas) ---`);
  console.log(pctSummary(reports, 'distributed'));

  console.log(`\nexit=${r.status} amostras=${reports.length}`);
  console.log(`Relatório: ${path.relative(root, dir)}/report.md`);
  if (r.status !== 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});