// src/index.ts

// Bootstrap file to register path aliases before loading the server
import { config as loadEnv } from 'dotenv';

const bootstrap = async (): Promise<void> => {
  loadEnv();

  const hasNewRelicLicense = Boolean(
    process.env.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_LICENSE_KEY.trim().length > 0,
  );

  if (hasNewRelicLicense) {
    await import('newrelic');
  } else {
    console.warn(
      'New Relic não foi inicializado: defina NEW_RELIC_LICENSE_KEY (e opcionalmente NEW_RELIC_APP_NAME) para ativar monitoramento APM.',
    );
  }

  await import('./infrastructure/observability/tracing.js');
  await import('./server.js');
};

void bootstrap();
