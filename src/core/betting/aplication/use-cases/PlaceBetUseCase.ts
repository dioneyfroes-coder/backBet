import { BetService } from '../../domain/services/BetService';
import { ICreateBetDTO } from '../../types/bet.types';
import { Bet } from '../../domain/entities/Bet';

export class PlaceBetUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(input: ICreateBetDTO): Promise<Bet> {
    return this.betService.placeBet(input);
  }
}
