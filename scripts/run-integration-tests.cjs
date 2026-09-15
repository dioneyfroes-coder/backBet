#!/usr/bin/env node
'use strict';

/**
 * Orquestra a suíte de integração REAL (MongoDB + Redis) de forma reproduzível.
 *
 * Fase 18 — Ambiente de testes:
 *  - Define RUN_REAL_INTEGRATION_TESTS=true e roda o Jest com --runInBand no
 *    spec de integração.
 *  - As conexões usam o .env como fonte única (MONGODB_URI/REDIS_URL). A suíte
 *    apenas troca o database para MONGODB_TEST_DB (default backbet-test),
 *    mantendo host/porta/autenticação da infra real. Veja loadTestConnectionEnv.
 *  - SEM argumentos: apenas roda a suíte (a infra deve já estar de pé).
 *  - Com --with-infra: sobe o docker-compose.test.yml (up -d --wait), roda a
 *    suíte e derruba a infra (down) mesmo em caso de falha.
 *
 * Uso:
 *   npm run test:integration
 *   npm run test:integration:full
 *   node scripts/run-integration-tests.cjs --runInBand -- src/integration/...
 *
 * Cross-platform (Windows/PowerShell, macOS, Linux). Docker Compose v2.20+ é
 * recomendado por causa do suporte a "up -d --wait".
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const composeFile = path.join(root, 'docker-compose.test.yml');
const jestBin = path.join('node_modules', 'jest', 'bin', 'jest.js');
const defaultSpecs = [
  'src/integration/__tests__/mongo-redis.integration.test.ts',
  'src/integration/__tests__/load.concurrency.integration.test.ts',
  'src/integration/__tests__/failure.integration.test.ts',
];

const withInfra = process.argv.includes('--with-infra');
const rawForward = process.argv
  .slice(2)
  .filter((arg) => arg !== '--with-infra' && arg !== '--with-infra=true');

// Aritmentos posicionais (ex. caminho de um spec) substituem a suíte padrão;
// flags (ex. --runInBand) são encaminhadas ao Jest intactas.
const positionalSpecs = rawForward.filter((arg) => !arg.startsWith('-'));
const extraArgs = rawForward.filter((arg) => arg.startsWith('-') && arg !== '--');
const specArgs = positionalSpecs.length > 0 ? positionalSpecs : defaultSpecs;

const shift = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return value;
};

// ---------------------------------------------------------------------------
// Configuração de conexão — fonte única: o .env.
//
// As URIs NÃO são hardcoded aqui. O runner carrega o .env e usa MONGODB_URI /
// REDIS_URL definidos no ambiente (host + porta + autenticação da infra real).
// A suíte só troca o database para MONGODB_TEST_DB (default backbet-test),
// mantendo a mesma autenticação/porta da URI de origem — decisão explícita da
// configuração de teste, não uma URI paralela escondida.
//
// Overrides explícitos (quando definidos pelo chamador):
//   MONGODB_TEST_URI = URI completa usada literalmente pela suíte
//   REDIS_TEST_URL   = URI completa do Redis usada literalmente pela suíte
// ---------------------------------------------------------------------------
function resolveMongoTestUri(baseUri, testDb, explicitOverride) {
  if (explicitOverride !== undefined && explicitOverride !== '') return explicitOverride;
  try {
    const uri = new URL(baseUri);
    uri.pathname = `/${testDb}`;
    return uri.toString();
  } catch {
    return baseUri;
  }
}

function loadTestConnectionEnv() {
  const shellMongoUri = process.env.MONGODB_URI;
  const shellRedisUrl = process.env.REDIS_URL;

  require('dotenv').config({ path: path.join(root, '.env') });

  const testDb = shift(process.env.MONGODB_TEST_DB, 'backbet-test');
  const baseUri = shift(
    shellMongoUri,
    shift(process.env.MONGODB_URI, 'mongodb://localhost:27017/backbet-dev'),
  );
  const baseRedis = shift(
    shellRedisUrl,
    shift(process.env.REDIS_URL, 'redis://localhost:6379'),
  );

  return {
    MONGODB_URI: resolveMongoTestUri(baseUri, testDb, process.env.MONGODB_TEST_URI),
    REDIS_URL: shift(process.env.REDIS_TEST_URL, baseRedis),
  };
}

const DEFAULTS = loadTestConnectionEnv();

function composeArgs(command, extra) {
  return ['compose', '-f', composeFile, command, ...(extra || [])];
}

function runDocker(args, opts) {
  return spawnSync('docker', args, { stdio: 'inherit', ...opts });
}

function runJest() {
  const args = [jestBin, '--runInBand', ...specArgs, ...extraArgs];

  const env = { ...process.env };
  env.RUN_REAL_INTEGRATION_TESTS = 'true';
  env.MONGODB_URI = shift(process.env.MONGODB_URI, DEFAULTS.MONGODB_URI);
  env.REDIS_URL = shift(process.env.REDIS_URL, DEFAULTS.REDIS_URL);
  // O database usado pela suíte vem da URI derivada (backbet-test), não de uma
  // variável de infraestrutura que aponte para o db da aplicação.
  delete env.MONGODB_DB_NAME;

  console.log(
    `[integration] node ${args.join(' ')}`,
    `\n[integration] MONGODB_URI=${env.MONGODB_URI} REDIS_URL=${env.REDIS_URL}`,
  );

  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    cwd: root,
    env,
  });

  return result.status ?? 1;
}

if (!withInfra) {
  process.exit(runJest());
}

const up = runDocker(composeArgs('up', ['-d', '--wait', '--wait-timeout', '180']), { cwd: root });
if (up.error) {
  console.error(
    '[integration] Docker não está disponível no PATH. Instale o Docker Engine + ' +
      'Docker Compose v2 (veja docs/TESTING-ENV.mdx) e rode `npm run test:infra:up`, ' +
      'ou forneça MONGODB_URI/REDIS_URL para rodar a suíte contra outra infra.',
  );
  process.exit(up.status ?? 1);
}
if (up.status !== 0) {
  process.exit(up.status ?? 1);
}

let exitCode;
try {
  exitCode = runJest();
} finally {
  runDocker(composeArgs('down'), { cwd: root });
}

process.exit(exitCode);