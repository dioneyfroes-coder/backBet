import { MongooseUserRepository } from '../MongooseUserRepository';
import { UserModel } from '../../schemas/UserSchema';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';

const USER_DOC = {
  _id: 'user-1',
  email: 'test@example.com',
  username: 'tester',
  passwordHash: 'hash',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  pixKey: null,
  documents: [],
  preferences: {
    emailNotifications: true,
    smsNotifications: false,
    marketingEmails: false,
    requireWithdrawPassword: null,
  },
  pixUpdatedAt: null,
};

const makeUser = (): User =>
  new User('user-1', new Email('test@example.com'), 'tester', 'hash', 'ACTIVE', new Date(), new Date());

const chain = (resolvedValue: unknown) => ({
  lean: jest.fn().mockResolvedValue(resolvedValue),
});

const rejectedChain = (error: Error) => ({
  lean: jest.fn().mockRejectedValue(error),
});

describe('MongooseUserRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('findById mapeia document para domínio', async () => {
    jest.spyOn(UserModel, 'findById').mockReturnValue(chain(USER_DOC) as never);

    const repo = new MongooseUserRepository();
    const user = await repo.findById('user-1');

    expect(user).not.toBeNull();
    expect(user?.id).toBe('user-1');
    expect(user?.email.toString()).toBe('test@example.com');
  });

  it('findByEmail retorna null quando não existe', async () => {
    jest.spyOn(UserModel, 'findOne').mockReturnValue(chain(null) as never);

    const repo = new MongooseUserRepository();
    await expect(repo.findByEmail('missing@example.com')).resolves.toBeNull();
  });

  describe('falha do banco vira AppError (code/message/status corretos)', () => {
    const dbError = new Error('db down');

    it('save', async () => {
      jest.spyOn(UserModel, 'findByIdAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseUserRepository();
      await expect(repo.save(makeUser())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao salvar usuário',
        statusCode: 500,
      });
    });

    it('save lança CONFLICT em chave duplicada (Mongo error 11000)', async () => {
      const duplicate = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
        keyPattern: { email: 1 },
      });
      jest.spyOn(UserModel, 'findByIdAndUpdate').mockRejectedValue(duplicate);

      const repo = new MongooseUserRepository();
      await expect(repo.save(makeUser())).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Um usuário com este email já existe',
        statusCode: 409,
      });
    });

    it('findById', async () => {
      jest.spyOn(UserModel, 'findById').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseUserRepository();
      await expect(repo.findById('user-1')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar usuário',
        statusCode: 500,
      });
    });

    it('findByEmail', async () => {
      jest.spyOn(UserModel, 'findOne').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseUserRepository();
      await expect(repo.findByEmail('test@example.com')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar usuário por email',
        statusCode: 500,
      });
    });

    it('findByPixKey', async () => {
      jest.spyOn(UserModel, 'find').mockReturnValue(rejectedChain(dbError) as never);

      const repo = new MongooseUserRepository();
      await expect(repo.findByPixKey('chave')).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao buscar usuários por chave Pix',
        statusCode: 500,
      });
    });

    it('update lança NOT_FOUND quando o usuário não existe', async () => {
      jest.spyOn(UserModel, 'findByIdAndUpdate').mockResolvedValue(null as never);

      const repo = new MongooseUserRepository();
      await expect(repo.update(makeUser())).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Usuário não encontrado',
        statusCode: 404,
      });
    });

    it('update', async () => {
      jest.spyOn(UserModel, 'findByIdAndUpdate').mockRejectedValue(dbError);

      const repo = new MongooseUserRepository();
      await expect(repo.update(makeUser())).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro ao atualizar usuário',
        statusCode: 500,
      });
    });
  });
});