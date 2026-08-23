import { IWalletRepository, WalletRepositoryOptions } from '@/core/finance/domain/repositories/IWalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { Transaction, ITransactionDTO } from '@/core/finance/domain/entities/Transaction';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { AppError } from '@/shared/errors/AppError';
import { WalletModel, IWalletDocument } from '../schemas/WalletSchema';
import { WalletRecord, WalletTransactionRecord } from '@/types/persistence';

type WalletRecordRaw = Omit<WalletRecord, '_id'> & {
  _id: WalletRecord['_id'] | { toString(): string };
};

type WalletInternals = {
  _balance: Money;
  _lockedBalance: Money;
  _transactions: Transaction[];
  _version: number;
};

const sanitizeUserId = (userId: string): string => {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Invalid userId', 400);
  }
  return userId.trim();
};

const serializeTransactions = (transactions: Transaction[]): ITransactionDTO[] =>
  transactions.map((tx) => tx.toDTO());

const parseTransactions = (transactions: WalletTransactionRecord[] = []): Transaction[] =>
  transactions.map(
    (tx) =>
      new Transaction(
        tx.id,
        tx.userId,
        tx.type,
        tx.amount,
        tx.currency,
        tx.description ?? undefined,
        tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt),
        tx.metadata ?? undefined,
      ),
  );

const normalizePagination = (value: number | undefined, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return fallback;
};

export class MongooseWalletRepository implements IWalletRepository {
  async save(wallet: Wallet, options: WalletRepositoryOptions = {}): Promise<Wallet> {
    try {
      const walletData: Partial<IWalletDocument> = {
        userId: wallet.userId,
        version: wallet.version,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        currency: wallet.currency,
        transactions: serializeTransactions(wallet.getTransactions()),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const query = WalletModel.findOneAndUpdate({ userId: wallet.userId }, walletData, {
        upsert: true,
        new: true,
      });
      if (options.session) query.session(options.session as never);
      await query;
      return wallet;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new AppError('Uma carteira para este usuário já existe', 'CONFLICT', 409);
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao salvar carteira', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByUserId(userId: string, options: WalletRepositoryOptions = {}): Promise<Wallet | null> {
    try {
      const safeUserId = sanitizeUserId(userId);
      const query = WalletModel.findOne({
        userId: safeUserId,
      });
      if (options.session) query.session(options.session as never);
      const walletData = await query.lean<WalletRecordRaw | null>();
      if (!walletData) {
        return null;
      }
      return this.mapToDomain(this.normalizeWalletRecord(walletData));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar carteira', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async update(wallet: Wallet, options: WalletRepositoryOptions = {}): Promise<Wallet> {
    try {
      const walletData: Partial<IWalletDocument> = {
        version: wallet.version,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        transactions: serializeTransactions(wallet.getTransactions()),
        updatedAt: new Date(),
      };

      const query = WalletModel.findOneAndUpdate(
        {
          userId: sanitizeUserId(wallet.userId),
          $or: [
            { version: wallet.version - 1 },
            ...(wallet.version === 1 ? [{ version: { $exists: false } }] : []),
          ],
        },
        walletData,
        { new: true },
      );
      if (options.session) {
        query.session(options.session as never);
      }
      const result = await query;

      if (!result) {
        const existing = await WalletModel.exists({ userId: sanitizeUserId(wallet.userId) });
        if (!existing) {
          throw new AppError('Carteira não encontrada', 'NOT_FOUND', 404);
        }
        throw new AppError('CONFLICT', 'Conflito de concorrência ao atualizar carteira', 409, {
          userId: wallet.userId,
          expectedVersion: wallet.version - 1,
        });
      }
      return wallet;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao atualizar carteira', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async withTransaction<T>(work: (session: unknown) => Promise<T>): Promise<T> {
    const session = await WalletModel.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  async delete(userId: string): Promise<void> {
    try {
      await WalletModel.findOneAndDelete({ userId: sanitizeUserId(userId) });
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao deletar carteira', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async getHistory(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ transactions: ITransactionDTO[]; total: number }> {
    try {
      const safeUserId = sanitizeUserId(userId);
      const wallet = await WalletModel.findOne({
        userId: safeUserId,
      }).lean<WalletRecordRaw | null>();
      if (!wallet) {
        throw new AppError('Carteira não encontrada', 'NOT_FOUND', 404);
      }

      const transactions = wallet.transactions ?? [];
      const safeOffset = normalizePagination(offset, 0);
      const safeLimit = normalizePagination(limit, transactions.length);
      const end = safeLimit ? safeOffset + safeLimit : transactions.length;

      return {
        transactions: transactions.slice(safeOffset, end).map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          description: tx.description ?? undefined,
          createdAt: tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt),
          userId: tx.userId,
          currency: tx.currency,
          metadata: tx.metadata ?? undefined,
        })),
        total: transactions.length,
      };
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar histórico de transações', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  private mapToDomain(data: WalletRecord): Wallet {
    const wallet = new Wallet(data.userId, data.currency as Wallet['currency']);
    const mutableWallet = wallet as unknown as WalletInternals;
    mutableWallet._balance = new Money(data.balance, data.currency as Wallet['currency']);
    mutableWallet._lockedBalance = new Money(
      data.lockedBalance,
      data.currency as Wallet['currency'],
    );
    mutableWallet._transactions = parseTransactions(data.transactions);
    mutableWallet._version = data.version ?? 1;
    return wallet;
  }

  private normalizeWalletRecord(data: WalletRecordRaw): WalletRecord {
    return {
      ...data,
      _id: typeof data._id === 'string' ? data._id : data._id.toString(),
      transactions: data.transactions ?? [],
    };
  }
}
