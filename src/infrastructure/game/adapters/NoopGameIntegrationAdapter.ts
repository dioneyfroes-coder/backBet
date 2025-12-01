import { GameRound } from '@/core/game/domain/entities/GameRound';
import { GameIntegrationPort } from '@/core/game/domain/ports/GameIntegrationPort';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export class NoopGameIntegrationAdapter implements GameIntegrationPort {
  async notifyRound(round: GameRound): Promise<void> {
    writeStructuredLog(
      {
        event: 'game_round_completed',
        gameType: round.gameType,
        result: round.result,
        payout: round.payoutAmount,
        userId: round.userId,
      },
      'info',
    );
  }

  async broadcastFeed(rounds: GameRound[]): Promise<void> {
    writeStructuredLog(
      {
        event: 'game_round_feed_update',
        total: rounds.length,
        latestRoundId: rounds[0]?.id,
      },
      'info',
    );
  }
}
