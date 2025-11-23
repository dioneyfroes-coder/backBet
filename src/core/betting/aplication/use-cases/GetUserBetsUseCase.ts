import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';

export class GetUserBetsUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(userId: string): Promise<Bet[]> {
    return executeWithBetErrorMapping(() => this.betService.getUserBets(userId));
  }
}
