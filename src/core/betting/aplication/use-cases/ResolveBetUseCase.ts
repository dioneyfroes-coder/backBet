import { Bet } from '../../domain/entities/Bet';
import { BetService } from '../../domain/services/BetService';
import { IResolveBetDTO } from '../../types/bet.types';

export class ResolveBetUseCase {
  constructor(private readonly betService: BetService) {}

  async execute(input: IResolveBetDTO): Promise<Bet> {
    // Exemplo: validações de segurança antes de resolver
    return this.betService.resolveBet(input);
  }
}
