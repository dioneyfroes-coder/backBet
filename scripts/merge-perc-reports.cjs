#!/usr/bin/env node
'use strict';

/**
 * Fase 13 — Funde múltiplos runs do benchmark de percentis em um relatório
 * final único (scripts/load-results/fase13/final/).
 *
 * Cada run roda uma fatia da curva (ex.: A = níveis 50..300, B = contenção
 * 500, C = distribuído 500). Este script combina os `report.json` por
 * scenario+level (preservando o primeiro de cada par e anotando a origem).
 *
 * Uso:
 *   node scripts/merge-perc-reports.cjs <runDir1> <runDir2> ...
 *   node scripts/merge-perc-reports.cjs 1a5c7260... 2026-09-19T14-57-41-810Z 2026-09-19T16-06-17-571Z
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'scripts', 'load-results', 'fase13');
const FINAL_DIR = 'final';

function load(dir) {
  const jsonPath = path.join(outRoot, dir, 'report.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`[merge] report.json não encontrado em ${dir}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function main() {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('uso: node scripts/merge-perc-reports.cjs <runDir> [<runDir> ...]');
    process.exit(2);
  }

  const merged = new Map();
  const sources = {};
  const ranAt = new Date().toISOString();
  const levels = new Set();
  const allReports = [];

  for (const dir of dirs) {
    const data = load(dir);
    for (const r of data.reports) {
      const key = `${r.scenario}:${r.level}`;
      allReports.push(r);
      if (!merged.has(key)) {
        merged.set(key, r);
        sources[key] = dir;
      }
      levels.add(r.level);
    }
  }

  const reports = [...merged.values()].sort(
    (a, b) => a.level - b.level || (a.scenario === 'contention' ? -1 : 1),
  );

  const meta = {
    runId: FINAL_DIR,
    ranAt,
    mergedFrom: dirs,
    levels: [...levels].sort((a, b) => a - b),
    depositAmount: 1.25,
    sources,
  };

  // Reuso o gerador de markdown do collector (mesma estrutura de tabela).
  global.__mergeMarkdown = (rps, m) => {
    const byLevel = new Map();
    for (const r of rps) {
      if (!byLevel.has(r.level)) byLevel.set(r.level, {});
      byLevel.get(r.level)[r.scenario] = r;
    }
    let md = `# Fase 13 — Benchmark de percentis (BackBet) — relatório final\n\n`;
    md += `- **runId**: ${m.runId}\n`;
    md += `- **executado em**: ${m.ranAt}\n`;
    md += `- **merged de**: ${m.mergedFrom.join(', ')}\n`;
    md += `- **niveis**: ${m.levels.join(', ')}\n`;
    md += `- **carga**: N depósitos de R$ ${m.depositAmount} — contenção (mesma carteira) / distribuído (carteiras distintas)\n`;
    md += `\n## p50/p95/p99 — latência por operação (ms)\n\n`;
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
    md += `\n> Onda marcada \`capped\` estourou o orçamento (PERC_MAX_WAVE_MS);\n`;
    md += `> rejeitadas aí são WriteConflict (112) que esgotaram o retry interno do\n`;
    md += `> driver — o modelo DERRUBOU operações sob contenção máxima.\n`;
    return md;
  };

  const outDir = path.join(outRoot, FINAL_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ meta, reports, allReports }, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), global.__mergeMarkdown(reports, meta));

  console.error(`[merge] ${reports.length} amostras (${allReports.length} totais) fundidas em scripts/load-results/fase13/final/`);
}

main();