import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { IResolveBetDTO } from '../../types/bet.types';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { restoreBet } from './restoreBet';

export class ResolveBetUseCase {
  constructor(
    private readonly betService: BetService,
    private readonly idempotency?: IdempotencyService,
  ) {}

  async execute(input: IResolveBetDTO, idempotencyKey?: string): Promise<Bet> {
    const operation = () => executeWithBetErrorMapping(() => this.betService.resolveBet(input));
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${input.betId}:bet-settle:${idempotencyKey}`,
      JSON.stringify(input),
      operation,
      restoreBet,
    );
  }
}
