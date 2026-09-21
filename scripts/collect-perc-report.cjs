#!/usr/bin/env node
'use strict';

/**
 * Coleta o relatório de um container `integration-tests` já em execução:
 * aguarda o container terminar (docker wait), lê a saída (docker logs),
 * extrai as linhas `PERC <json>` e grava o relatório em
 * scripts/load-results/fase13/<runId>/ (report.json + report.md).
 *
 * Uso (este script bloqueia até o container sair):
 *   node scripts/collect-perc-report.cjs <container-id>
 *
 * Normalmente executado em background:
 *   nohup node scripts/collect-perc-report.cjs <id> > /tmp/opencode/collect.log 2>&1 &
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'scripts', 'load-results', 'fase14');

function parsePercLines(text) {
  const reports = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('PERC ')) continue;
    try {
      reports.push(JSON.parse(line.slice('PERC '.length)));
    } catch {
      // linha malformada — ignora
    }
  }
  return reports;
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
  md += `- **carga**: N depósitos de R$ ${meta.depositAmount} — contenção (mesma carteira) / distribuído (carteiras distintas)\n`;
  if (meta.exitCode !== 0) {
    md += `- **exit**: ${meta.exitCode} (atenção: run incompleto)\n`;
  }
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
  md += `\n> Nota: conflitos = AppError CONFLICT (409) emitido pelo CAS de versão da\n`;
  md += `> carteira; retries = reexecuções da operação por conflito. Retries do\n`;
  md += `> driver do MongoDB (TransientTransactionError/UnknownTransactionCommitResult)\n`;
  md += `> acontecem dentro de \`session.withTransaction\` e não são observáveis aqui.\n`;
  return md;
}

function main() {
  const now = process.argv[2] === '--now';
  const containerId = process.argv[now ? 3 : 2];
  if (!containerId) {
    console.error('uso: node scripts/collect-perc-report.cjs [--now] <container-id>');
    process.exit(2);
  }

  let waitCode = '0';
  if (!now) {
    console.error(`[collect] aguardando container ${containerId} terminar...`);
    const wait = spawnSync('docker', ['wait', containerId], { encoding: 'utf8' });
    waitCode = (wait.stdout || '').trim();
    console.error(`[collect] container saiu (exit=${waitCode})`);
  } else {
    console.error(`[collect] coletando estado atual de ${containerId} (sem esperar)...`);
  }

  const logs = spawnSync('docker', ['logs', containerId], { encoding: 'utf8' });
  const text = (logs.stdout || '') + (logs.stderr || '');
  const reports = parsePercLines(text);

  if (reports.length === 0) {
    console.error('[collect] nenhuma linha PERC encontrada — nada a gravar.');
    process.exitCode = 1;
    return;
  }

  const runId = reports[0].runId;
  const dir = path.join(outRoot, runId);
  fs.mkdirSync(dir, { recursive: true });

  const meta = {
    runId,
    ranAt: new Date().toISOString(),
    levels: [...new Set(reports.map((r) => r.level))].sort((a, b) => a - b),
    depositAmount: 1.25,
    exitCode: Number(waitCode) || 1,
    collectedFrom: containerId,
    complete: now ? false : true,
  };

  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ meta, reports }, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), buildMarkdown(reports, meta));
  fs.writeFileSync(path.join(dir, 'suite-output.txt'), text);
  console.error(`[collect] relatório gravado em scripts/load-results/fase13/${runId}/`);
  console.error(`[collect] amostras: ${reports.length}`);
}

main();