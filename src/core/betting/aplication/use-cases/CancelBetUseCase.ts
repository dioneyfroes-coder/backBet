import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { ICancelBetDTO } from '../../types/bet.types';

export class CancelBetUseCase {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly betService: BetService) {}

  async execute(input: ICancelBetDTO): Promise<Bet> {
    // Exemplo: registrar logs, validar permissão, etc.
    return this.betService.cancelBet(input);
  }
};
