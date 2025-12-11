/* eslint-env node */
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'backbet-mailer',
      script: './dist/src/scripts/start-contact-worker.js',
      cwd: path.resolve(__dirname),
      instances: 1,
      autorestart: true,
      watch: false,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        MAILER_SMTP_URL: process.env.MAILER_SMTP_URL || undefined,
        CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL || 'support@example.com',
      },
    },
  ],
};
