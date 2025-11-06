import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';

export class GetUserBetsUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(userId: string): Promise<Bet[]> {
    return this.betService.getUserBets(userId);
  }
}
