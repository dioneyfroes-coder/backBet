#!/usr/bin/env node
'use strict';

/**
 * Orquestra a suíte de integração REAL (MongoDB + Redis) de forma reproduzível.
 *
 * Fase 18 — Ambiente de testes:
 *  - Define RUN_REAL_INTEGRATION_TESTS=true e roda o Jest com --runInBand no
 *    spec de integração.
 *  - As conexões vêm do ambiente (MONGODB_URI/REDIS_URL do .env ou do
 *    container de teste). A suíte usa o database MONGODB_TEST_DB (default
 *    backbet-test) e, se MONGODB_TEST_URI estiver definida, ela é usada
 *    literalmente (credenciais dedicadas do usuário backbet-test).
 *  - NÃO existem fallbacks para localhost/IP fixo aqui: se faltar URI, o erro
 *    aparece imediatamente (nunca se tenta conectar em localhost dentro de
 *    container ou na infra publicada).
 *  - SEM argumentos: apenas roda a suíte no host (a infra deve já estar de pé e
 *    acessível pelas URIs do ambiente).
 *  - Com --with-infra: constrói a imagem backbet:test, roda a suíte DENTRO da
 *    rede do docker-compose.test.yml (sem depender de localhost/IP do host) e
 *    derruba a infra (down -v) mesmo em caso de falha.
 *
 * Uso:
 *   npm run test:integration
 *   npm run test:integration:full
 *   docker compose -f docker-compose.test.yml run --rm integration-tests
 *   node scripts/run-integration-tests.cjs -- src/integration/...
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
  'src/integration/__tests__/user-auth-persistence.integration.test.ts',
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
// Configuração de conexão — fonte única: o ambiente.
//
// As URIs NÃO são hardcoded aqui (sem localhost, sem IP de servidor, sem portas
// fixas). O runner usa o que estiver no ambiente:
//   - MONGODB_URI      = conexão da aplicação (do .env ou do container)
//   - REDIS_URL        = conexão do Redis (do .env ou do container)
//   - MONGODB_TEST_URI = URI literal usada pela suíte; se ausente, deriva de
//                        MONGODB_URI trocando só o database para
//                        MONGODB_TEST_DB (default backbet-test).
//   - REDIS_TEST_URL   = override explícito do Redis para a suíte.
//
// O dotenv NUNCA sobrescreve variáveis já presentes no ambiente, então um valor
// exportado no shell tem precedência sobre o .env.
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
  require('dotenv').config({ path: path.join(root, '.env') });

  const testDb = shift(process.env.MONGODB_TEST_DB, 'backbet-test');
  const baseUri = shift(process.env.MONGODB_URI, undefined);

  return {
    MONGODB_URI: resolveMongoTestUri(baseUri, testDb, process.env.MONGODB_TEST_URI),
    REDIS_URL: shift(process.env.REDIS_TEST_URL, shift(process.env.REDIS_URL, undefined)),
  };
}

const DEFAULTS = loadTestConnectionEnv();

// No modo --with-infra as conexões são injetadas pelo próprio compose
// (MONGODB_URI=...mongodb:27017..., REDIS_URL=redis://redis:6379) dentro da rede
// Docker, então não exigimos .env/URIs no host.
if (!withInfra && (!DEFAULTS.MONGODB_URI || !DEFAULTS.REDIS_URL)) {
  console.error(
    '[integration] MONGODB_URI e REDIS_URL são obrigatórias para a suíte de ' +
    'integração. Defina-as no .env (host/porta/auth da infra real) ou exporte ' +
    'antes de rodar. O runner não assume localhost nem IP fixo.',
  );
  process.exit(2);
}

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
  env.MONGODB_URI = DEFAULTS.MONGODB_URI;
  env.REDIS_URL = DEFAULTS.REDIS_URL;
  // O database usado pela suíte vem da URI derivada (backbet-test), não de uma
  // variável de infraestrutura que aponte para o db da aplicação.
  delete env.MONGODB_DB_NAME;

  console.log(
    `[integration] node ${args.join(' ')}`,
    `\n[integration] MONGODB_URI configurada: ${Boolean(env.MONGODB_URI)}`,
    `\n[integration] REDIS_URL configurada: ${Boolean(env.REDIS_URL)}`,
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

const dockerUnavailable =
  'Docker não está disponível no PATH. Instale o Docker Engine + Docker Compose v2 ' +
  '(veja docs/TESTING-ENV.mdx) ou forneça MONGODB_URI/REDIS_URL para rodar a suíte ' +
  'no host contra outra infra.';

const build = runDocker(composeArgs('build', ['integration-tests']), { cwd: root });
if (build.error) {
  console.error(`[integration] ${dockerUnavailable}`);
  process.exit(build.status ?? 1);
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// Os specs/flags escolhidos no host são repassados como COMMAND para o container
// (a imagem já tem o runner como CMD). As conexões vêm do compose, não do host.
const containerCommand = ['node', 'scripts/run-integration-tests.cjs', ...specArgs, ...extraArgs];
const run = composeArgs('run', ['--rm', 'integration-tests', ...containerCommand]);

let exitCode;
try {
  const result = runDocker(run, { cwd: root });
  if (result.error) {
    console.error(`[integration] ${dockerUnavailable}`);
  }
  exitCode = result.status ?? 1;
} finally {
  runDocker(composeArgs('down', ['-v']), { cwd: root });
}

process.exit(exitCode);