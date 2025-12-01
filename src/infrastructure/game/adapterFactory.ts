import { appConfig } from '@/shared/config/appConfig';
import { GameIntegrationPort } from '@/core/game/domain/ports/GameIntegrationPort';
import { NoopGameIntegrationAdapter } from './adapters/NoopGameIntegrationAdapter';

export const createGameIntegrationAdapter = async (): Promise<GameIntegrationPort> => {
  const integrationConfig = appConfig.games.integration;

  if (integrationConfig.webhookEnabled && integrationConfig.webhookUrl) {
    const { WebhookGameIntegrationAdapter } = await import('./adapters/WebhookGameIntegrationAdapter');
    return new WebhookGameIntegrationAdapter(integrationConfig.webhookUrl);
  }

  return new NoopGameIntegrationAdapter();
};
