module.exports = {
  apps: [
    {
      name: 'backbet-contact-worker',
      script: 'dist/src/scripts/start-contact-worker.js',
      // use environment suitable for worker
      env: {
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        MAILER_SMTP_URL: process.env.MAILER_SMTP_URL || undefined,
        CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL || 'support@example.com',
      },
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      watch: false,
      time: true,
    },
  ],
};
