import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { executeWithBetErrorMapping } from '../errors/BetErrorMapper';

export class GetEventBetsUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(eventId: string): Promise<Bet[]> {
    return executeWithBetErrorMapping(() => this.betService.getEventBets(eventId));
  }
}
