import { SessionService } from '../SessionService';
import { Session } from '../../entities/Session';
import { InMemorySessionRepository } from '../../repositories/InMemorySessionRepository';
import { AppError } from '@/shared/errors/AppError';

describe('SessionService', () => {
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  let repository: InMemorySessionRepository;
  let service: SessionService;

  beforeEach(() => {
    repository = new InMemorySessionRepository();
    service = new SessionService(repository, TTL_MS);
  });

  const openSession = async (userId = 'user-1'): Promise<Session> => service.openSession(userId);

  describe('openSession', () => {
    it('persists an ACTIVE session with jwtId and expiry', async () => {
      const session = await openSession();

      expect(session.status).toBe('ACTIVE');
      expect(session.jwtId).toBeTruthy();
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(await repository.findById(session.sessionId)).toEqual(session);
    });
  });

  describe('rotate', () => {
    it('rotates jwtId when the presented jti is the current one', async () => {
      const session = await openSession();
      const previousJwtId = session.jwtId;

      const rotated = await service.rotate(session.userId, session.sessionId, previousJwtId);

      expect(rotated.jwtId).not.toBe(previousJwtId);
      expect(rotated.status).toBe('ACTIVE');
      const persisted = await repository.findById(session.sessionId);
      expect(persisted?.jwtId).toBe(rotated.jwtId);
    });

    it('revokes the session family when a stale jti is presented (reuse detection)', async () => {
      const session = await openSession();

      await expect(
        service.rotate(session.userId, session.sessionId, 'stale-jti'),
      ).rejects.toMatchObject({ statusCode: 401 });

      const persisted = await repository.findById(session.sessionId);
      expect(persisted?.status).toBe('REVOKED');
      expect(persisted?.revokedReason).toBe('REUSE_DETECTED');
    });

    it('reusing the OLD token after a successful rotation revokes the family (item #5)', async () => {
      const session = await openSession();
      const oldJti = session.jwtId;

      const rotated = await service.rotate(session.userId, session.sessionId, oldJti);
      expect(rotated.status).toBe('ACTIVE');

      // Replay do token antigo pós-rotação: guard jwtId !== oldJti → REUSE.
      await expect(
        service.rotate(session.userId, session.sessionId, oldJti),
      ).rejects.toMatchObject({ statusCode: 401 });
      expect((await repository.findById(session.sessionId))?.revokedReason).toBe(
        'REUSE_DETECTED',
      );
    });

    it('CAS: rotação concorrente com o MESMO token — exatamente 1 vence, família é revogada', async () => {
      const session = await openSession();
      const jti = session.jwtId;

      const [winner, loser] = await Promise.allSettled([
        service.rotate(session.userId, session.sessionId, jti),
        service.rotate(session.userId, session.sessionId, jti),
      ]);

      const fulfilled = [winner, loser].filter((r) => r.status === 'fulfilled');
      const rejected = [winner, loser].filter(
        (r) => r.status === 'rejected' && (r.reason as AppError).statusCode === 401,
      );
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // O perdedor do CAS revoga a família: a sessão termina REVOKED e nem o
      // token do vencedor sobrevive — mesmas semânticas do reuse sequential.
      const persisted = await repository.findById(session.sessionId);
      expect(persisted?.status).toBe('REVOKED');
      expect(persisted?.revokedReason).toBe('REUSE_DETECTED');
    });

    it('rejects when session does not exist', async () => {
      await expect(service.rotate('user-1', 'missing-session', 'jti')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects when session belongs to another user', async () => {
      const session = await openSession('user-1');

      await expect(service.rotate('user-2', session.sessionId, session.jwtId)).rejects.toMatchObject(
        { statusCode: 401 },
      );
    });

    it('revokes and rejects expired sessions', async () => {
      const session = await openSession();
      const past = new Date(Date.now() - 1000);
      (session as unknown as { expiresAt: Date }).expiresAt = past;
      await repository.update(session);

      await expect(
        service.rotate(session.userId, session.sessionId, session.jwtId),
      ).rejects.toMatchObject({ statusCode: 401 });

      const persisted = await repository.findById(session.sessionId);
      expect(persisted?.revokedReason).toBe('EXPIRED');
    });

    it('rejects rotation of an already revoked session', async () => {
      const session = await openSession();
      session.revoke('LOGOUT');
      await repository.update(session);

      await expect(
        service.rotate(session.userId, session.sessionId, session.jwtId),
      ).rejects.toThrow(AppError);
    });
  });

  describe('assertActiveSession', () => {
    it('accepts an active session and updates lastUsedAt', async () => {
      const session = await openSession();
      const originalTouched = session.lastUsedAt.getTime();

      await new Promise((resolve) => setTimeout(resolve, 5));
      await expect(
        service.assertActiveSession(session.sessionId, session.userId),
      ).resolves.toBeUndefined();

      const persisted = await repository.findById(session.sessionId);
      expect(persisted?.lastUsedAt.getTime()).toBeGreaterThan(originalTouched);
    });

    it('rejects revoked sessions', async () => {
      const session = await openSession();
      session.revoke('LOGOUT');
      await repository.update(session);

      await expect(
        service.assertActiveSession(session.sessionId, session.userId),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('rejects nonexistent sessions', async () => {
      await expect(service.assertActiveSession('missing', 'user-1')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects sessions of another user', async () => {
      const session = await openSession('user-1');

      await expect(service.assertActiveSession(session.sessionId, 'user-2')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('rejects expired sessions', async () => {
      const session = await openSession();
      (session as unknown as { expiresAt: Date }).expiresAt = new Date(Date.now() - 1000);
      await repository.update(session);

      await expect(
        service.assertActiveSession(session.sessionId, session.userId),
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('revoke / revokeOwnSession / revokeAllForUser', () => {
    it('revoke is idempotent and silently ignores missing sessions', async () => {
      await expect(service.revoke('missing-session')).resolves.toBeUndefined();
      await expect(service.revokeOwnSession('missing-session', 'user-1')).resolves.toBe(false);
    });

    it('revokeOwnSession only revokes the user own session', async () => {
      const own = await openSession('user-1');
      const other = await openSession('user-2');

      const revoked = await service.revokeOwnSession(own.sessionId, 'user-1');

      expect(revoked).toBe(true);
      expect((await repository.findById(own.sessionId))?.status).toBe('REVOKED');
      expect((await repository.findById(other.sessionId))?.status).toBe('ACTIVE');
    });

    it('revokeAllForUser revokes every active session of the user', async () => {
      const a = await openSession('user-1');
      const b = await openSession('user-1');
      const other = await openSession('user-2');

      await service.revokeAllForUser('user-1');

      expect((await repository.findById(a.sessionId))?.status).toBe('REVOKED');
      expect((await repository.findById(b.sessionId))?.status).toBe('REVOKED');
      expect((await repository.findById(other.sessionId))?.status).toBe('ACTIVE');
    });
  });
});