import { BetService } from '../../domain/services/BetService';
import { ICreateBetDTO } from '../../types/bet.types';
import { Bet } from '../../domain/entities/Bet';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';
import { IdempotencyService } from '@/shared/services/IdempotencyService';
import { restoreBet } from './restoreBet';
import { ResponsibleGamblingService } from '@/core/responsibleGambling/domain/services/ResponsibleGamblingService';

export class PlaceBetUseCase {
  constructor(
    private readonly betService: BetService,
    private readonly idempotency?: IdempotencyService,
    private readonly responsibleGambling?: ResponsibleGamblingService,
  ) {}

  async execute(input: ICreateBetDTO, idempotencyKey?: string): Promise<Bet> {
    const operation = async () => {
      if (this.responsibleGambling) {
        await executeWithBetErrorMapping(() =>
          this.responsibleGambling!.assertCanBet(input.userId, Math.round(input.amount * 100)),
        );
      }
      const bet = await executeWithBetErrorMapping(() => this.betService.placeBet(input));
      if (this.responsibleGambling) {
        await this.responsibleGambling
          .recordBet(input.userId, Math.round(input.amount * 100))
          .catch((err) => console.warn('recordBet failed', err));
      }
      return bet;
    };
    if (!this.idempotency || !idempotencyKey) {
      return operation();
    }
    return this.idempotency.execute(
      `${input.userId}:bet:${idempotencyKey}`,
      JSON.stringify(input),
      operation,
      restoreBet,
    );
  }
}