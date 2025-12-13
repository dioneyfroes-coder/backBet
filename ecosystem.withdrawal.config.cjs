module.exports = {
  apps: [
    {
      name: 'backbet-withdrawal-worker',
      // Production: use built dist JS. Do not fallback to TS in production.
      script: './dist/scripts/start-withdrawal-worker.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
