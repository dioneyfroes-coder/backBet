/* eslint-env node */
'use strict';
const path = require('node:path');
const { benchEnv } = require('./scripts/pm2-bench-env.cjs');
const workerInstances = require('./scripts/pm2-worker-instances.cjs');

module.exports = {
  apps: [
    {
      name: 'bench-api',
      script: './dist/index.js',
      cwd: path.resolve(__dirname),
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      merge_logs: true,
      env: benchEnv(),
    },
    {
      name: 'bench-withdrawal-worker',
      script: './dist/scripts/start-withdrawal-worker.js',
      cwd: path.resolve(__dirname),
      instances: workerInstances(),
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      merge_logs: true,
      env: benchEnv(),
    },
    {
      name: 'bench-contact-worker',
      script: './dist/scripts/start-contact-worker.js',
      cwd: path.resolve(__dirname),
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      merge_logs: true,
      env: benchEnv(),
    },
  ],
};