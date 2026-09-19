import { MongooseSessionRepository } from '../MongooseSessionRepository';
import { SessionModel } from '../../schemas/SessionSchema';
import { Session } from '@/core/auth/domain/entities/Session';

const SESSION_DOC = {
  sessionId: 'session-1',
  userId: 'user-1',
  jwtId: 'jwt-1',
  status: 'ACTIVE',
  createdAt: new Date(),
  lastUsedAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: undefined,
  revokedReason: undefined,
};

describe('MongooseSessionRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('findById mapeia document para domínio', async () => {
    jest.spyOn(SessionModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(SESSION_DOC),
    } as never);

    const repo = new MongooseSessionRepository();
    const session = await repo.findById('session-1');

    expect(session).not.toBeNull();
    expect(session?.sessionId).toBe('session-1');
    expect(session?.userId).toBe('user-1');
    expect(session?.jwtId).toBe('jwt-1');
    expect(session?.status).toBe('ACTIVE');
  });

  it('findById retorna null quando não existe', async () => {
    jest.spyOn(SessionModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    } as never);

    const repo = new MongooseSessionRepository();
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('findByUserId retorna todas as sessões do usuário', async () => {
    jest.spyOn(SessionModel, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([SESSION_DOC]),
    } as never);

    const repo = new MongooseSessionRepository();
    const sessions = await repo.findByUserId('user-1');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe('user-1');
  });

  it('create persiste o document completo', async () => {
    const create = jest.spyOn(SessionModel, 'create').mockResolvedValue(SESSION_DOC as never);
    const session = new Session('session-2', 'user-2', 'jwt-2', 'ACTIVE');

    const repo = new MongooseSessionRepository();
    await repo.create(session);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-2' }));
  });

  it('update grava a rotação e a revogação', async () => {
    const updateOne = jest.spyOn(SessionModel, 'updateOne').mockResolvedValue({} as never);
    const session = new Session('session-1', 'user-1', 'jwt-old', 'ACTIVE');
    session.revoke('REUSE_DETECTED');

    const repo = new MongooseSessionRepository();
    await repo.update(session);

    expect(updateOne).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      expect.objectContaining({
        status: 'REVOKED',
        revokedReason: 'REUSE_DETECTED',
        jwtId: 'jwt-old',
      }),
    );
  });

  it('deleteByUserId remove todas as sessões do usuário', async () => {
    const deleteMany = jest.spyOn(SessionModel, 'deleteMany').mockResolvedValue({} as never);

    const repo = new MongooseSessionRepository();
    await repo.deleteByUserId('user-1');

    expect(deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
  });
});