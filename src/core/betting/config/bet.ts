// src/core/betting/config/bet.ts
import { BetRepository } from '../domain/repositories/BetRepository';
import type { IBetRepository } from '../domain/repositories/IBetRepository';
import { EventRepository } from '../domain/repositories/EventRepository';
import type { IEventRepository } from '../domain/repositories/IEventRepository';
import { WalletRepository } from '@/core/finance/domain/repositories/WalletRepository';
import { WalletService } from '../../finance/domain/services/WalletService';
import { BetService } from '../domain/services/BetService';

// Criação das instâncias concretas
const betRepository: IBetRepository = new BetRepository();
const eventRepository: IEventRepository = new EventRepository();
const walletRepository = new WalletRepository();
const walletService = new WalletService(walletRepository);

// Serviço principal
export const betService = new BetService(betRepository, eventRepository, walletService);

// Casos de uso (injeção de dependência)
import { PlaceBetUseCase } from '../application/use-cases/PlaceBetUseCase';
import { CancelBetUseCase } from '../application/use-cases/CancelBetUseCase';
import { ResolveBetUseCase } from '../application/use-cases/ResolveBetUseCase';
import { GetUserBetsUseCase } from '../application/use-cases/GetUserBetsUseCase';
import { GetEventBetsUseCase } from '../application/use-cases/GetEventUseCase';

export const placeBetUseCase = new PlaceBetUseCase(betService);
export const cancelBetUseCase = new CancelBetUseCase(betService);
export const resolveBetUseCase = new ResolveBetUseCase(betService);
export const getUserBetsUseCase = new GetUserBetsUseCase(betService);
export const getEventBetsUseCase = new GetEventBetsUseCase(betService);
