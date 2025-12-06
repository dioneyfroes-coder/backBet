// src/index.ts

// Bootstrap file to register path aliases before loading the server
import { config as loadEnv } from 'dotenv';

const bootstrap = async (): Promise<void> => {
  loadEnv();

  await import('./infrastructure/observability/tracing.js');
  await import('./server.js');
};

void bootstrap();
