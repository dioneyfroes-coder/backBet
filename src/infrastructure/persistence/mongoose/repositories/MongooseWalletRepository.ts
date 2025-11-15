import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { Wallet } from '@/core/finance/domain/entities/Wallet';
import { ITransactionDTO } from '@/core/finance/domain/entities/Transaction';
import { AppError } from '@/shared/errors/AppError';
import { WalletModel, IWalletDocument } from '../schemas/WalletSchema';

export class MongooseWalletRepository implements IWalletRepository {
  async save(wallet: Wallet): Promise<Wallet> {
    try {
      const walletData: Partial<IWalletDocument> = {
        userId: wallet.userId,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        currency: wallet.currency,
        transactions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await WalletModel.findOneAndUpdate(
        { userId: wallet.userId },
        walletData,
        { upsert: true, new: true }
      );
      return wallet;
    } catch (error: any) {
      if (error.code === 11000) {
        throw new AppError(
          'Uma carteira para este usuário já existe',
          'CONFLICT',
          409
        );
      }
      throw new AppError(
        'Erro ao salvar carteira',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    try {
      const walletData = await WalletModel.findOne({ userId }).lean() as any;
      if (!walletData) {
        return null;
      }
      return this.mapToDomain(walletData);
    } catch (error: any) {
      throw new AppError(
        'Erro ao buscar carteira',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async update(wallet: Wallet): Promise<Wallet> {
    try {
      const walletData: Partial<IWalletDocument> = {
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        updatedAt: new Date(),
      };

      const result = await WalletModel.findOneAndUpdate(
        { userId: wallet.userId },
        walletData,
        { new: true }
      );

      if (!result) {
        throw new AppError('Carteira não encontrada', 'NOT_FOUND', 404);
      }
      return wallet;
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Erro ao atualizar carteira',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async delete(userId: string): Promise<void> {
    try {
      await WalletModel.findOneAndDelete({ userId });
    } catch (error: any) {
      throw new AppError(
        'Erro ao deletar carteira',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  async getHistory(userId: string, limit?: number, offset?: number): Promise<{ transactions: ITransactionDTO[]; total: number }> {
    try {
      const wallet = await WalletModel.findOne({ userId }).lean() as any;
      if (!wallet) {
        throw new AppError('Carteira não encontrada', 'NOT_FOUND', 404);
      }

      const transactions = wallet.transactions || [];
      const start = offset || 0;
      const end = limit ? start + limit : transactions.length;

      return {
        transactions: transactions.slice(start, end).map((tx: any) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          createdAt: tx.createdAt,
        })),
        total: transactions.length,
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Erro ao buscar histórico de transações',
        'INTERNAL_SERVER_ERROR',
        500,
        { originalError: error.message }
      );
    }
  }

  private mapToDomain(data: any): Wallet {
    const wallet = new Wallet(data.userId, data.currency);
    
    // Restaurar estado da carteira a partir do documento
    (wallet as any)._balance = data.balance;
    (wallet as any)._lockedBalance = data.lockedBalance;
    
    return wallet;
  }
}
