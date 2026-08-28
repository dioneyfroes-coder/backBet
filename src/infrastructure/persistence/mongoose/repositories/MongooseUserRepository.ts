import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { AppError } from '@/shared/errors/AppError';
import { UserModel, IUserDocument } from '../schemas/UserSchema';

export class MongooseUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    try {
      const userData: Partial<IUserDocument> = {
        email: user.email.toString(),
        username: user.username,
        status: user.status,
        passwordHash: user.passwordHash,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        pixKey: user.pixKey ?? null,
        pixUpdatedAt: user.pixUpdatedAt ?? null,
        documents: user.documents ?? [],
        preferences: user.preferences ?? {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: null,
        },
      };

      await UserModel.findByIdAndUpdate(user.id, userData, { upsert: true });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000 &&
        'keyPattern' in error
      ) {
        const field = Object.keys((error as { keyPattern: Record<string, unknown> }).keyPattern)[0];
        throw new AppError(`Um usuário com este ${field} já existe`, 'CONFLICT', 409, { field });
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao salvar usuário', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const userData = await UserModel.findById(id).lean<IUserDocument | null>();
      if (!userData) {
        return null;
      }
      return this.mapToDomain(userData);
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar usuário', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const userData = await UserModel.findOne({ email }).lean<IUserDocument | null>();
      if (!userData) {
        return null;
      }
      return this.mapToDomain(userData);
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar usuário por email', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByPixKey(pixKey: string): Promise<User[]> {
    try {
      const docs = await UserModel.find({ pixKey: pixKey.trim() })
        .lean<IUserDocument[]>();
      return docs.map((doc) => this.mapToDomain(doc));
    } catch (error: unknown) {
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao buscar usuários por chave Pix', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  async findByRecoveryToken(token: string): Promise<User | null> {
    const doc = await UserModel.findOne({ 'passwordRecovery.token': token });
    return doc ? this.mapToDomain(doc) : null;
  }

  async update(user: User): Promise<void> {
    try {
      const userData: Partial<IUserDocument> = {
        username: user.username,
        status: user.status,
        updatedAt: user.updatedAt,
        pixKey: user.pixKey ?? null,
        pixUpdatedAt: user.pixUpdatedAt ?? null,
        documents: user.documents ?? [],
        preferences: user.preferences ?? {
          emailNotifications: true,
          smsNotifications: false,
          marketingEmails: false,
          requireWithdrawPassword: null,
        },
      };

      const result = await UserModel.findByIdAndUpdate(user.id, userData, { new: true });
      if (!result) {
        throw new AppError('Usuário não encontrado', 'NOT_FOUND', 404);
      }
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      const originalError = error instanceof Error ? error.message : 'unknown';
      throw new AppError('Erro ao atualizar usuário', 'INTERNAL_SERVER_ERROR', 500, {
        originalError,
      });
    }
  }

  private mapToDomain(data: IUserDocument): User {
    return new User(
      data._id?.toString() ?? '',
      new Email(data.email),
      data.username,
      data.passwordHash,
      data.status,
      data.createdAt,
      data.updatedAt,
      data.pixKey ?? null,
      data.documents ?? [],
      data.preferences ?? {
        emailNotifications: true,
        smsNotifications: false,
        marketingEmails: false,
        requireWithdrawPassword: null,
      },
      undefined,
      data.pixUpdatedAt ?? null,
    );
  }
}
