import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { IResolveBetDTO } from '../../types/bet.types';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';

export class ResolveBetUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(input: IResolveBetDTO): Promise<Bet> {
    return executeWithBetErrorMapping(() => this.betService.resolveBet(input));
  }
}
