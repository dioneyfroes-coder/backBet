import { ISessionRepository } from '@/core/auth/domain/repositories/ISessionRepository';
import { Session } from '@/core/auth/domain/entities/Session';
import { ISessionDocument, SessionModel } from '../schemas/SessionSchema';

export class MongooseSessionRepository implements ISessionRepository {
  private toDomain(doc: ISessionDocument): Session {
    return new Session(
      doc.sessionId,
      doc.userId,
      doc.jwtId,
      doc.status,
      doc.createdAt,
      doc.lastUsedAt,
      doc.expiresAt,
      doc.revokedAt,
      doc.revokedReason,
    );
  }

  async findById(sessionId: string): Promise<Session | null> {
    const doc = await SessionModel.findOne({ sessionId }).lean<ISessionDocument>();
    return doc ? this.toDomain(doc) : null;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const docs = await SessionModel.find({ userId }).lean<ISessionDocument[]>();
    return docs.map((doc) => this.toDomain(doc));
  }

  async create(session: Session): Promise<void> {
    await SessionModel.create({
      sessionId: session.sessionId,
      userId: session.userId,
      jwtId: session.jwtId,
      status: session.status,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      revokedReason: session.revokedReason,
    });
  }

  async update(session: Session): Promise<void> {
    await SessionModel.updateOne(
      { sessionId: session.sessionId },
      {
        jwtId: session.jwtId,
        status: session.status,
        lastUsedAt: session.lastUsedAt,
        revokedAt: session.revokedAt,
        revokedReason: session.revokedReason,
        expiresAt: session.expiresAt,
      },
    );
  }

  async deleteByUserId(userId: string): Promise<void> {
    await SessionModel.deleteMany({ userId });
  }
}