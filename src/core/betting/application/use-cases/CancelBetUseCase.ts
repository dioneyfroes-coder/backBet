import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { ICancelBetDTO } from '../../types/bet.types';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { restoreBet } from './restoreBet';

export class CancelBetUseCase {
  constructor(
    private readonly betService: BetService,
    private readonly idempotency?: IdempotencyService,
  ) {}

  async execute(
    input: ICancelBetDTO,
    idempotencyKey?: string,
  ): Promise<{ bet: Bet; replayed: boolean }> {
    const operation = () => executeWithBetErrorMapping(() => this.betService.cancelBet(input));
    if (!this.idempotency || !idempotencyKey) {
      return { bet: await operation(), replayed: false };
    }
    const { value, replayed } = await this.idempotency.executeWithMeta(
      `${input.betId}:bet-cancel:${idempotencyKey}`,
      JSON.stringify(input),
      operation,
      restoreBet,
    );
    return { bet: value, replayed };
  }
}
