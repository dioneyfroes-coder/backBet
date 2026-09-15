module.exports = {
  apps: [
    {
      name: 'backbet-contact-worker',
      script: './dist/scripts/start-contact-worker.js',
      // use environment suitable for worker
      env: {
        NODE_ENV: 'production',
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
