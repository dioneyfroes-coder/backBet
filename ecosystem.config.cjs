/* eslint-env node */
const { cpus } = require('node:os');
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'backbet',
      script: './dist/index.js',
      cwd: path.resolve(__dirname),
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        CACHE_ENABLED: process.env.CACHE_ENABLED ?? 'false',
      },
    },
  ],
};
