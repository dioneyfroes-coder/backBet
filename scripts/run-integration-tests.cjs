#!/usr/bin/env node
'use strict';

/**
 * Orquestra a suíte de integração REAL (MongoDB + Redis) de forma reproduzível.
 *
 * Fase 18 — Ambiente de testes:
 *  - Define RUN_REAL_INTEGRATION_TESTS=true e roda o Jest com --runInBand no
 *    spec de integração, sem que um .env pessoal da máquina redirecione os
 *    testes para um Mongo/Redis de verdade do desenvolvedor.
 *  - SEM argumentos: apenas roda a suíte (a infra deve já estar de pé via
 *    "npm run test:infra:up" ou equivalentes).
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
const defaultSpec = 'src/integration/__tests__/mongo-redis.integration.test.ts';

const withInfra = process.argv.includes('--with-infra');
const forward = process.argv
  .slice(2)
  .filter((arg) => arg !== '--with-infra' && arg !== '--with-infra=true');

const shift = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return value;
};

function composeArgs(command, extra) {
  return ['compose', '-f', composeFile, command, ...(extra || [])];
}

function runDocker(args, opts) {
  return spawnSync('docker', args, { stdio: 'inherit', ...opts });
}

function runJest() {
  const args = [jestBin, '--runInBand', defaultSpec, ...forward];

  const env = { ...process.env };
  env.RUN_REAL_INTEGRATION_TESTS = 'true';
  // A suíte de integração é reproduzível: ignora um .env pessoal do dev e
  // aponta para a infra local do docker-compose.test.yml, a menos que a
  // variável seja definida explicitamente no ambiente (export MONGODB_URI=...).
  env.MONGODB_URI = shift(process.env.MONGODB_URI, 'mongodb://localhost:27017/backbet-test');
  env.REDIS_URL = shift(process.env.REDIS_URL, 'redis://localhost:6379');

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