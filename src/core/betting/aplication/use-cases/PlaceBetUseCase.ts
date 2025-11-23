import { BetService } from '../../domain/services/BetService';
import { ICreateBetDTO } from '../../types/bet.types';
import { Bet } from '../../domain/entities/Bet';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';

export class PlaceBetUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(input: ICreateBetDTO): Promise<Bet> {
    return executeWithBetErrorMapping(() => this.betService.placeBet(input));
  }
}
