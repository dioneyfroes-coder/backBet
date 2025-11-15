import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { BetStatus, BetType } from '@/core/betting/types/bet.types';
import { BetAmount } from '@/core/betting/domain/value-objects/BetAmount';
import { Odds } from '@/core/betting/domain/value-objects/Odds';
import { AppError } from '@/shared/errors/AppError';
import { BetModel, IBetDocument } from '../schemas/BetSchema';

export class MongooseBetRepository implements IBetRepository {
  async create(bet: Bet): Promise<void> {
    try {
      const betData = {
        userId: bet.userId,
        eventId: bet.eventId,
        marketId: bet.marketId,
        oddId: bet.id,
        amount: bet.amount.value,
        odds: bet.odds.value,
        potentialReturn: bet.potentialReturn,
        status: bet.status,
        type: bet.type,
        currency: 'BRL',
        createdAt: bet.createdAt,
        resolvedAt: bet.resolvedAt,
        cancellationReason: bet.cancellationReason,
      } as any;

      const newBet = new BetModel(betData);
      await newBet.save();
    } catch (error: any) {
      throw new AppError(
        'Erro ao criar aposta',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async update(bet: Bet): Promise<void> {
    try {
      const betData = {
        status: bet.status,
        resolvedAt: bet.resolvedAt,
        cancellationReason: bet.cancellationReason,
        updatedAt: new Date(),
      } as any;

      const result = await BetModel.findByIdAndUpdate(bet.id, betData, { new: true });
      if (!result) {
        throw new AppError('Aposta não encontrada', 'NOT_FOUND', 404);
      }
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Erro ao atualizar aposta',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async findById(id: string): Promise<Bet | null> {
    try {
      const betData = await BetModel.findById(id).lean() as IBetDocument | null;
      if (!betData) {
        return null;
      }
      return this.mapToDomain(betData);
    } catch (error: any) {
      throw new AppError(
        'Erro ao buscar aposta',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async findByUserId(userId: string): Promise<Bet[]> {
    try {
      const betsData = await BetModel.find({ userId }).lean() as any[];
      return betsData.map(betData => this.mapToDomain(betData));
    } catch (error: any) {
      throw new AppError(
        'Erro ao buscar apostas do usuário',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async findByEventId(eventId: string): Promise<Bet[]> {
    try {
      const betsData = await BetModel.find({ eventId }).lean() as any[];
      return betsData.map(betData => this.mapToDomain(betData));
    } catch (error: any) {
      throw new AppError(
        'Erro ao buscar apostas do evento',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async findByStatus(status: BetStatus): Promise<Bet[]> {
    try {
      const betsData = await BetModel.find({ status }).lean() as any[];
      return betsData.map(betData => this.mapToDomain(betData));
    } catch (error: any) {
      throw new AppError(
        'Erro ao buscar apostas por status',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async findAll(filter?: { userId?: string; eventId?: string; status?: BetStatus }): Promise<Bet[]> {
    try {
      const query: any = {};
      if (filter?.userId) query.userId = filter.userId;
      if (filter?.eventId) query.eventId = filter.eventId;
      if (filter?.status) query.status = filter.status;

      const betsData = await BetModel.find(query).lean() as any[];
      return betsData.map(betData => this.mapToDomain(betData));
    } catch (error: any) {
      throw new AppError(
        'Erro ao listar apostas',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const bet = await BetModel.findById(id).lean();
      return !!bet;
    } catch (error: any) {
      throw new AppError(
        'Erro ao verificar aposta',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await BetModel.findByIdAndDelete(id);
      return !!result;
    } catch (error: any) {
      throw new AppError(
        'Erro ao deletar aposta',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  private mapToDomain(data: any): Bet {
    return new Bet(
      data._id!.toString(),
      data.userId,
      data.eventId,
      data.marketId,
      new BetAmount(data.amount, 'BRL'),
      new Odds(data.odds),
      data.status,
      data.type as BetType,
      data.createdAt,
      data.resolvedAt || new Date(0),
      data.cancellationReason || ''
    );
  }
}
