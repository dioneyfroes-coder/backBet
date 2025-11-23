import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { ICancelBetDTO } from '../../types/bet.types';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';

export class CancelBetUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(input: ICancelBetDTO): Promise<Bet> {
    return executeWithBetErrorMapping(() => this.betService.cancelBet(input));
  }
}
