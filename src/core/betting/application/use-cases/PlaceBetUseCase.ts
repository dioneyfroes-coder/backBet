import { BetService } from '../../domain/services/BetService';
import { ICreateBetDTO } from '../../types/bet.types';
import { Bet } from '../../domain/entities/Bet';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';
import { IdempotencyService } from '@/shared/services/IdempotencyService';

export class PlaceBetUseCase {
  constructor(
    private readonly betService: BetService,
    private readonly idempotency?: IdempotencyService,
  ) {}

  async execute(input: ICreateBetDTO, idempotencyKey?: string): Promise<Bet> {
    const operation = () => executeWithBetErrorMapping(() => this.betService.placeBet(input));
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${input.userId}:bet:${idempotencyKey}`,
      JSON.stringify(input),
      operation,
      (raw) =>
        new Bet(
          raw.id,
          raw.userId,
          raw.eventId,
          raw.marketId,
          raw.amount,
          raw.odds,
          raw.status,
          raw.type,
          new Date(raw.createdAt),
          raw.resolvedAt ? new Date(raw.resolvedAt) : undefined,
          raw.cancellationReason,
        ),
    );
  }
}
