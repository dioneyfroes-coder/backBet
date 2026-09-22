/* eslint-env node */
'use strict';
// Helper compartilhado entre ecosystem.bench.config.cjs e
// scripts/run-pm2-bench.cjs.
//
// O PM2 roda os processos NO HOST (fora do Docker). As URIs do .env apontam
// para os hostnames "mongodb"/"redis" (só resolvem na rede interna do
// Compose); aqui elas são reescritas para o LAB_BIND_IP publicado
// (Mongo 27018 e Redis 6379 expostos nesse IP).
const path = require('node:path');
require('dotenv').config();

const LAB_HOST = process.env.LAB_BIND_IP || '192.168.22.250';
const LAB_MONGODB_PORT = process.env.LAB_MONGODB_PORT || '27018';
const LAB_REDIS_PORT = process.env.LAB_REDIS_PORT || '6379';
const PING_QUEUE = 'bench_ping';

function hostUris(env) {
  const e = { ...env };
  if (e.MONGODB_URI) {
    e.MONGODB_URI = e.MONGODB_URI.replace(/@mongodb:\d+/, `@${LAB_HOST}:${LAB_MONGODB_PORT}`);
    // O rs0 anuncia o membro como "mongodb:27017" (hostname interno do
    // container), irresolvível a partir do host. Com directConnection=true o
    // driver conecta direto no endereço da URI e pula a descoberta do rs
    // (transações seguem funcionando: single-member rs, endereço é o primary).
    if (!e.MONGODB_URI.includes('directConnection=')) {
      e.MONGODB_URI = `${e.MONGODB_URI}${e.MONGODB_URI.includes('?') ? '&' : '?'}directConnection=true`;
    }
  }
  if (e.REDIS_URL) {
    e.REDIS_URL = e.REDIS_URL.replace(/@redis:\d+/, `@${LAB_HOST}:${LAB_REDIS_PORT}`);
  }
  return e;
}

// Env usado por TODOS os apps do bench: .env do lab + URIs reescritas para o
// host + API separada na porta 3100 (para não conflitar com a 3000/3001).
function benchEnv() {
  const env = hostUris(process.env);
  env.NODE_ENV = 'production';
  env.BACKBET_RUNTIME_ENV = 'production';
  env.USE_REDIS_QUEUE = 'true';
  env.PORT = '3100';
  return env;
}

module.exports = { LAB_HOST, LAB_MONGODB_PORT, LAB_REDIS_PORT, PING_QUEUE, hostUris, benchEnv };