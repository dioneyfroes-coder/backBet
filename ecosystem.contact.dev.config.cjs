module.exports = {
  apps: [
    {
      name: 'backbet-contact-worker-dev',
      // Run TypeScript directly using `tsx` (must be installed)
      script: 'src/scripts/start-contact-worker.ts',
      interpreter: 'tsx',
      env: {
        NODE_ENV: 'development',
        BACKBET_RUNTIME_ENV: 'development',
        CONTACT_TO_EMAIL: process.env.CONTACT_TO_EMAIL || 'support@example.com',
        // MAILER_SMTP_URL can be set to a dev SMTP server or left undefined to use jsonTransport
        MAILER_SMTP_URL: process.env.MAILER_SMTP_URL || undefined,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      time: true,
    },
  ],
};
