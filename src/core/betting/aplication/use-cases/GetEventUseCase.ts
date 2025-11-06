import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';

export class GetEventBetsUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(eventId: string): Promise<Bet[]> {
    return this.betService.getEventBets(eventId);
  }
}
