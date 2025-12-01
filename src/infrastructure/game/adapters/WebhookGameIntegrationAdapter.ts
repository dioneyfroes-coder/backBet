import { GameRound } from '@/core/game/domain/entities/GameRound';
import { GameIntegrationPort } from '@/core/game/domain/ports/GameIntegrationPort';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export class WebhookGameIntegrationAdapter implements GameIntegrationPort {
  constructor(private readonly webhookUrl: string) {}

  async notifyRound(round: GameRound): Promise<void> {
    await this.safePost({ type: 'round.completed', payload: round.toJSON() });
  }

  async broadcastFeed(rounds: GameRound[]): Promise<void> {
    await this.safePost({ type: 'round.feed', payload: rounds.map((round) => round.toJSON()) });
  }

  private async safePost(body: Record<string, unknown>): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        const url = new URL(this.webhookUrl);
        const client = url.protocol === 'https:' ? https : http;

        const req = client.request(
          {
            method: 'POST',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            res.on('data', () => {});
            res.on('end', () => resolve());
          },
        );

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
      });
    } catch (error) {
      console.warn('WebhookGameIntegrationAdapter error', error);
    }
  }
}
