/* eslint-env node */
const path = require('node:path');
const workerInstances = require('./scripts/pm2-worker-instances.cjs');

module.exports = {
  apps: [
    {
      name: 'backbet-withdrawal-worker',
      // Production: use built dist JS. Do not fallback to TS in production.
      script: './dist/scripts/start-withdrawal-worker.js',
      cwd: path.resolve(__dirname),
      instances: workerInstances(),
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
