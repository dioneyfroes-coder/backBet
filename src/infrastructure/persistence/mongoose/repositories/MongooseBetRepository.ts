import { IBetRepository, BetRepositoryOptions } from '@/core/betting/domain/repositories/IBetRepository';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { BetStatus } from '@/core/betting/types/bet.types';
import { BetAmount } from '@/core/betting/domain/value-objects/BetAmount';
import { Odds } from '@core/odds/domain/value-objects/Odds';
import { AppError } from '@/shared/errors/AppError';
import { BetModel, IBetDocument } from '../schemas/BetSchema';
import { BetRecord } from '@/types/persistence';

type BetRecordRaw = Omit<BetRecord, '_id'> & {
  _id: BetRecord['_id'] | { toString(): string };
};

export class MongooseBetRepository implements IBetRepository {
  async create(bet: Bet, options: BetRepositoryOptions = {}): Promise<void> {
    try {
      const betData: Partial<IBetDocument> = {
        version: bet.version,
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
      };

      const newBet = new BetModel(betData);
      await newBet.save({ session: options.session as never });
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao criar aposta', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async update(bet: Bet, options: BetRepositoryOptions = {}): Promise<void> {
    try {
      const betData: Partial<IBetDocument> = {
        version: bet.version,
        status: bet.status,
        resolvedAt: bet.resolvedAt,
        cancellationReason: bet.cancellationReason,
        updatedAt: new Date(),
      };

      const query = BetModel.findOneAndUpdate(
        {
          _id: bet.id,
          $or: [
            { version: bet.version - 1 },
            ...(bet.version === 1 ? [{ version: { $exists: false } }] : []),
          ],
        },
        betData,
        { new: true },
      );
      if (options.session) {
        query.session(options.session as never);
      }
      const result = await query;
      if (!result) {
        const existing = await BetModel.exists({ _id: bet.id });
        if (!existing) {
          throw new AppError('Aposta não encontrada', 'NOT_FOUND', 404);
        }
        throw new AppError('CONFLICT', 'Conflito de concorrência ao atualizar aposta', 409, {
          betId: bet.id,
          expectedVersion: bet.version - 1,
        });
      }
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao atualizar aposta', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findById(id: string, options: BetRepositoryOptions = {}): Promise<Bet | null> {
    try {
      const query = BetModel.findById(id);
      if (options.session) query.session(options.session as never);
      const betData = await query.lean<BetRecordRaw | null>();
      if (!betData) {
        return null;
      }
      return this.mapToDomain(this.normalizeBetRecord(betData));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar aposta', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByUserId(userId: string): Promise<Bet[]> {
    try {
      const betsData = await BetModel.find({ userId }).lean<BetRecordRaw[]>();
      return betsData.map((betData) => this.mapToDomain(this.normalizeBetRecord(betData)));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar apostas do usuário', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByEventId(eventId: string): Promise<Bet[]> {
    try {
      const betsData = await BetModel.find({ eventId }).lean<BetRecordRaw[]>();
      return betsData.map((betData) => this.mapToDomain(this.normalizeBetRecord(betData)));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar apostas do evento', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByStatus(status: BetStatus): Promise<Bet[]> {
    try {
      const betsData = await BetModel.find({ status }).lean<BetRecordRaw[]>();
      return betsData.map((betData) => this.mapToDomain(this.normalizeBetRecord(betData)));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar apostas por status', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findAll(filter?: {
    userId?: string;
    eventId?: string;
    status?: BetStatus;
  }): Promise<Bet[]> {
    try {
      const query: Record<string, unknown> = {};
      if (filter?.userId) query.userId = filter.userId;
      if (filter?.eventId) query.eventId = filter.eventId;
      if (filter?.status) query.status = filter.status;

      const betsData = await BetModel.find(query).lean<BetRecordRaw[]>();
      return betsData.map((betData) => this.mapToDomain(this.normalizeBetRecord(betData)));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao listar apostas', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const bet = await BetModel.findById(id).lean();
      return !!bet;
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao verificar aposta', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await BetModel.findByIdAndDelete(id);
      return !!result;
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao deletar aposta', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  private mapToDomain(data: BetRecord): Bet {
    return new Bet(
      data._id,
      data.userId,
      data.eventId,
      data.marketId,
      new BetAmount(data.amount, data.currency),
      new Odds(data.odds),
      data.status,
      data.type,
      data.createdAt,
      data.resolvedAt ?? data.createdAt,
      data.cancellationReason ?? '',
      data.version ?? 1,
    );
  }

  private normalizeBetRecord(data: BetRecordRaw): BetRecord {
    return {
      ...data,
      _id: typeof data._id === 'string' ? data._id : data._id.toString(),
    };
  }
}
