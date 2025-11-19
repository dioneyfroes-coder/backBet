#!/usr/bin/env node

/**
 * clean-docs.js
 * CLI para limpar todos os arquivos Markdown/MDX no diretório /docs.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  cleanContent,
} = require("./clean-lib");

// diretórios base
const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const BACKUP_DIR = path.join(
  ROOT,
  `docs_backup_${new Date().toISOString().replace(/[:.]/g, "-")}`
);

// flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const QUIET = args.includes("--quiet");
const RUN_PRETTIER = args.includes("--prettier");

// logs
const log = (...m) => !QUIET && console.log(...m);
const vlog = (...m) => VERBOSE && !QUIET && console.log(...m);

/**
 * Retorna lista completa de arquivos .md/.mdx dentro de /docs.
 */
function collectFiles(dir) {
  const stack = [dir];
  const out = [];

  while (stack.length) {
    const cur = stack.pop();
    let entries;

    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (err) {
      log(`Não foi possível ler ${cur}: ${err.message}`);
      continue;
    }

    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && (full.endsWith(".md") || full.endsWith(".mdx"))) {
        out.push(full);
      }
    }
  }

  return out;
}

/**
 * Cria backup completo da pasta docs (cópia 1:1 dos arquivos).
 */
function createBackup(files) {
  if (DRY_RUN) {
    log("[dry-run] Backup não criado.");
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  for (const file of files) {
    const rel = path.relative(DOCS_DIR, file);
    const dest = path.join(BACKUP_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  log("✔ Backup criado em:", BACKUP_DIR);
}

/**
 * Escrita segura (temp → rename).
 */
function atomicWrite(file, content) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, content, "utf8");
  fs.renameSync(temp, file);
}

/**
 * Executa Prettier, se disponível.
 */
function runPrettier() {
  try {
    execSync("npx prettier --write docs", {
      stdio: QUIET ? "ignore" : "inherit",
    });
    log("✔ Prettier executado.");
  } catch {
    log("⚠ Prettier não encontrado. Instale com: npm i -D prettier");
  }
}

// --- execução principal ---
(function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error("❌ Pasta /docs não encontrada.");
    process.exit(1);
  }

  log("Iniciando limpeza...");
  const allFiles = collectFiles(DOCS_DIR);

  log(`Total de arquivos .md/.mdx encontrados: ${allFiles.length}`);

  // criar backup
  createBackup(allFiles);

  const report = {
    modified: [],
    unchanged: [],
    errors: [],
  };

  // processar arquivos
  for (const file of allFiles) {
    try {
      const original = fs.readFileSync(file, "utf8");
      const cleaned = cleanContent(original);

      if (cleaned !== original) {
        report.modified.push(file);
        vlog(`MODIFIED: ${file}`);
        if (!DRY_RUN) atomicWrite(file, cleaned);
      } else {
        report.unchanged.push(file);
        vlog(`UNCHANGED: ${file}`);
      }
    } catch (err) {
      report.errors.push({ file, message: err.message });
      console.error(`⚠ Erro ao processar ${file}: ${err.message}`);
    }
  }

  // executar prettier se solicitado
  if (RUN_PRETTIER && !DRY_RUN) runPrettier();

  log("\n=== RELATÓRIO FINAL ===");
  log("Modificados:", report.modified.length);
  log("Intactos:", report.unchanged.length);
  log("Falhas:", report.errors.length);
  if (VERBOSE && report.errors.length) console.log(report.errors);

  if (DRY_RUN) log("\n(dry-run) Nenhuma alteração foi escrita.");
  log("Concluído.");
})();
