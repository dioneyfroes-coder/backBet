#!/usr/bin/env node

/**
 * Clean Docs – versão robusta
 * - primeiro coleta lista completa de .md/.mdx em docs/
 * - depois processa cada arquivo isoladamente (try/catch)
 * - escrita atômica (arquivo.temp -> rename)
 * - dry-run, verbose, quiet, prettier suportados
 *
 * Uso:
 *   node scripts/clean-docs.js [--dry-run] [--verbose] [--quiet] [--prettier]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const BACKUP_DIR = path.join(ROOT, `docs_backup_${new Date().toISOString().replace(/[:.]/g, "-")}`);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const QUIET = args.includes("--quiet");
const RUN_PRETTIER = args.includes("--prettier");

const log = (...m) => !QUIET && console.log(...m);
const vlog = (...m) => VERBOSE && !QUIET && console.log(...m);

// --- regexes (seguras para parser JS) ---
const regexes = [
  // links para .md/.mdx
  /\[([^\]]+)\]\((?:\.\/|\/)?[^\)]+\.(?:md|mdx)\)/gi,

  // anchors/refs dentro de parênteses que terminam com #something
  /\([^\)]*#[^\)]*\)/gi,

  // import/export MDX no topo do arquivo
  /^import\b[\s\S]*?;$/gim,
  /^export\b[\s\S]*?;$/gim,

  // componentes JSX soltos (cuidado: isso remove <tag ...>)
  /<([A-Za-z0-9_-]+)(\s[^>]*)?>\s*<\/\1>|<[^>]+\/?>/g,

  // comentários MDX do tipo {/* ... */}
  /\{\/\*[\s\S]*?\*\/\}/g,

  // emojis no início de headings (bastante amplo)
  /^#+\s*[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2700}-\u{27BF}]+\s*/gmu,

  // links relativos de pasta (../algo, ./algo)
  /\[([^\]]+)\]\((?:\.\.\/|\.\/)[^\)]*\)/gi,
];

// --- helpers ---
function normalizeCodeBlocks(content) {
  return content
    .replace(/```(js|ts)\b/g, "```javascript")
    .replace(/```[a-zA-Z0-9]+\s+[^\n]*\n/g, (m) => {
      // keep the code fence token only, remove inline params: "```jsx title='x'\n" -> "```jsx\n"
      const fence = m.split("\n")[0].split(" ")[0];
      return fence + "\n";
    });
}

function cleanContent(content) {
  let result = content;

  for (const r of regexes) {
    result = result.replace(r, "");
  }

  result = normalizeCodeBlocks(result);
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/^#+\s*$/gm, "");
  return result.trim() + "\n";
}

// percorre docs e retorna lista completa de arquivos .md/.mdx (sem modificar nada)
function collectFiles(dir) {
  const stack = [dir];
  const files = [];

  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (err) {
      log(`⚠ Falha ao ler ${cur}: ${err.message}`);
      continue;
    }

    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && (full.endsWith(".md") || full.endsWith(".mdx"))) {
        files.push(full);
      }
    }
  }

  return files;
}

function ensureBackup() {
  if (DRY_RUN) {
    log("[dry-run] Backup não criado.");
    return;
  }
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    // copiar arquivos da pasta docs para backup (simples)
    const files = collectFiles(DOCS_DIR);
    for (const f of files) {
      const rel = path.relative(DOCS_DIR, f);
      const dest = path.join(BACKUP_DIR, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(f, dest);
    }
    log("✔ Backup criado em:", BACKUP_DIR);
  } catch (err) {
    console.error("❌ Falha ao criar backup:", err.message);
    process.exit(1);
  }
}

function atomicWrite(filePath, content) {
  const temp = filePath + ".tmp";
  fs.writeFileSync(temp, content, "utf8");
  fs.renameSync(temp, filePath);
}

function runPrettier() {
  try {
    execSync("npx prettier --write docs", { stdio: QUIET ? "ignore" : "inherit" });
    log("✔ Prettier finalizado.");
  } catch (err) {
    log("⚠ Prettier não encontrado ou falha ao executar. Instale com: npm i -D prettier");
  }
}

// --- execução principal ---
(function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error("Pasta /docs não encontrada na raiz do projeto.");
    process.exit(1);
  }

  log("Iniciando limpeza (modo " + (DRY_RUN ? "dry-run" : "live") + ")...");
  ensureBackup();

  const allFiles = collectFiles(DOCS_DIR);
  log(`Arquivos encontrados: ${allFiles.length}`);

  const report = { modified: [], unchanged: [], errors: [] };

  for (const file of allFiles) {
    try {
      const original = fs.readFileSync(file, "utf8");
      const cleaned = cleanContent(original);

      if (cleaned !== original) {
        report.modified.push(file);
        vlog(`MODIFIED: ${file}`);
        if (VERBOSE) {
          vlog("---- antes (snippet) ----");
          vlog(original.slice(0, 300).replace(/\n/g, "\\n"));
          vlog("---- depois (snippet) ----");
          vlog(cleaned.slice(0, 300).replace(/\n/g, "\\n"));
        }
        if (!DRY_RUN) atomicWrite(file, cleaned);
      } else {
        report.unchanged.push(file);
        vlog(`UNCHANGED: ${file}`);
      }
    } catch (err) {
      report.errors.push({ file, message: err.message });
      console.error(`Erro processando ${file}: ${err.message}`);
    }
  }

  if (RUN_PRETTIER && !DRY_RUN) runPrettier();

  log("\n=== RELATÓRIO FINAL ===");
  log("Arquivos processados:", allFiles.length);
  log("Modificados:", report.modified.length);
  log("Intactos:", report.unchanged.length);
  log("Erros:", report.errors.length);
  if (VERBOSE && report.errors.length) {
    for (const e of report.errors) console.error(" -", e.file, e.message);
  }

  if (DRY_RUN) log("\n(dry-run) Nenhuma alteração foi salva.");
  log("Concluído.");
})();
