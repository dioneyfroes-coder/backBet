#!/usr/bin/env node
/* eslint-env node */
'use strict';
// =============================================================================
// Guard de segredos (Fase 26 — Secrets)
//
// Varre SOMENTE os arquivos rastreados pelo Git (git ls-files) procurando
// padrões de credenciais reais e nomes de arquivos sensíveis. Se encontrar
// algo, sai com código 1 — para CI/`npm run check` falhar antes da subida.
//
// Não compara conteúdo de .env (nem existe rastreado): a política é
// "nenhum segredo no Git", então o arquivo de exemplo e a documentação são
// ignorados de propósito.
// =============================================================================

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const FILE_PATTERN = /(^|\/)(\.env(\.[a-z0-9_-]+)?|.*\.(pem|key|p12|pfx|credentials|secrets|keystore|jks))$/i;

const IGNORE_FILES = [
  '.env.example',
  'docs/**',
  '*.mdx',
  '*.md',
  'package-lock.json',
  '**/__tests__/**',
  '*.test.ts',
  '*.spec.ts',
];

const PATTERNS = [
  { name: 'chave de acesso AWS', re: /(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  { name: 'chave privada', re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/ },
  { name: 'JWT real', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'chave Stripe', re: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'credenciais em URL SMTP', re: /smtps?:\/\/[^\s/?#:]+:[^\s@/?#]+@/ },
  { name: 'credenciais em URL MongoDB', re: /mongodb(\+srv)?:\/\/[^\s/?]+:[^\s@/?#]{6,}@/ },
  { name: 'token do GitHub', re: /(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/ },
];

function toRegExp(glob) {
  const escaped = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*');
  return new RegExp(`^${escaped}$`);
}

const ignoreRegexes = IGNORE_FILES.map(toRegExp);

function isIgnored(file) {
  return ignoreRegexes.some((re) => re.test(file));
}

let files;
try {
  files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
} catch (error) {
  console.error('✗ Não foi possível listar arquivos do Git:', error.message);
  console.error('  Rode o guard dentro de um clone do repositório.');
  process.exit(2);
}

const problems = [];

for (const file of files) {
  if (isIgnored(file)) {
    continue;
  }
  if (FILE_PATTERN.test(file)) {
    problems.push(`  - ${file}  [arquivo sensível rastreado]`);
    continue;
  }
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Interpolação de template (${{...}} / $${...}) é placeholder seguro de
    // compose/dotenv, nunca um segredo literal.
    if (line.includes('${')) {
      continue;
    }
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        problems.push(`  - ${file}:${i + 1}  [${name}]`);
        break;
      }
    }
  }
}

if (problems.length > 0) {
  const count = problems.length;
  console.error(`✗ ${count} ocorrência(s) de segredo suspeito em arquivos rastreados pelo Git:`);
  console.error(problems.join('\n'));
  console.error('');
  console.error('  Ações:');
  console.error('  1. git rm --cached <arquivo> (se é um .env/credencial já commitado);');
  console.error('  2. adicione o arquivo ao .gitignore;');
  console.error('  3. rode novamente `npm run check:secrets`.');
  process.exit(1);
}

console.log(`✔ Nenhum segredo encontrado nos ${files.length} arquivos rastreados pelo Git.`);