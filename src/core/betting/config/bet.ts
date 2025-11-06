// src/core/betting/config/bet.ts
import { BetRepository } from '../domain/repositories/BetRepository';
import { EventRepository } from '../domain/repositories/EventRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { WalletService } from '../../finance/domain/services/WalletService';
import { BetService } from '../domain/services/BetService';

// Criação das instâncias concretas
const betRepository = new BetRepository();
const eventRepository = new EventRepository();
const walletRepository = new WalletRepository();
const walletService = new WalletService(walletRepository);

// Serviço principal
export const betService = new BetService(
  betRepository,
  eventRepository,
  walletService
);

// Casos de uso (injeção de dependência)
import { PlaceBetUseCase } from '../aplication/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '../aplication/use-cases/CancelBetUseCase';
import { ResolveBetUseCase } from '../aplication/use-cases/ResolveBetUseCase';
import { GetUserBetsUseCase } from '../aplication/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '../aplication/use-cases/GetEventUseCase';

export const placeBetUseCase = new PlaceBetUseCase(betService);
export const cancelBetUseCase = new CancelBetUseCase(betService);
export const resolveBetUseCase = new ResolveBetUseCase(betService);
export const getUserBetsUseCase = new GetUserBetsUseCase(betService);
export const getEventBetsUseCase = new GetEventBetsUseCase(betService);
