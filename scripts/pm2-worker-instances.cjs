/* eslint-env node */
'use strict';
// Nº de instâncias de worker iniciadas pelo PM2. Lê PM2_WORKER_INSTANCES do
// ambiente (via dotenv, que carrega o .env raiz sem sobrescrever vars já
// definidas). Default: 4 — a máquina de laboratório tem 4 CPUs lógicas.
require('dotenv').config();

module.exports = function workerInstances() {
  const raw = process.env.PM2_WORKER_INSTANCES || '4';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 4;
};