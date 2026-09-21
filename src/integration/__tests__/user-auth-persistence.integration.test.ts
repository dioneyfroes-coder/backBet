import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { connectMongoDB, disconnectMongoDB, getMongoDBConfig } from '@/infrastructure/persistence/mongoose/config';
import { UserModel } from '@/infrastructure/persistence/mongoose/schemas/UserSchema';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseUserRepository';
import { UserService } from '@/core/user/domain/services/UserService';
import { PasswordRecoveryService } from '@/core/user/domain/services/PasswordRecoveryService';
import { ChangePassword } from '@/core/user/application/use-cases/ChangePassword';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

describeReal('MongoDB real — persistência de autenticação (P0-1)', () => {
  const repo = new MongooseUserRepository();
  const email = `auth-persistence-${randomUUID()}@example.com`;

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
  }, 20000);

  afterAll(async () => {
    await UserModel.deleteOne({ email });
    await disconnectMongoDB();
  });

  it('Teste A — mudança de senha persiste e sobrevive a novo request/processo', async () => {
    const userService = new UserService(repo);
    const oldPassword = 'V3lha-senha-segura';
    const newPassword = 'N0va-senha-segura';

    await userService.registerUser({
      email,
      username: `auth-${randomUUID()}`,
      password: oldPassword,
    });

    const registered = await repo.findByEmail(email);
    expect(registered).not.toBeNull();
    expect(await bcrypt.compare(oldPassword, registered!.passwordHash)).toBe(true);

    await new ChangePassword(new MongooseUserRepository()).execute({
      userId: registered!.id,
      currentPassword: oldPassword,
      newPassword,
    });

    const afterChange = await repo.findById(registered!.id);
    expect(await bcrypt.compare(newPassword, afterChange!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(oldPassword, afterChange!.passwordHash)).toBe(false);

    const freshRepo = new MongooseUserRepository();
    const reloaded = await freshRepo.findById(registered!.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.passwordHash).toBe(afterChange!.passwordHash);
    expect(await bcrypt.compare(newPassword, reloaded!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(oldPassword, reloaded!.passwordHash)).toBe(false);
  }, 30000);

  it('Teste B — password recovery persiste e conclui reset em novo request/processo', async () => {
    const recoveryEmail = `recovery-${randomUUID()}@example.com`;
    const originalPassword = 'P3ndente!ork';
    const resetPassword = 'R3definida!ok';
    const recoService = new PasswordRecoveryService(repo);

    await new UserService(repo).registerUser({
      email: recoveryEmail,
      username: `recovery-${randomUUID()}`,
      password: originalPassword,
    });

    const token = await recoService.requestRecovery(recoveryEmail);
    expect(token).not.toBe('');

    const freshService = new PasswordRecoveryService(new MongooseUserRepository());
    const byToken = await new MongooseUserRepository().findByRecoveryToken(token);
    expect(byToken).not.toBeNull();
    expect(byToken!.passwordRecovery?.token).toBe(token);

    const userId = await freshService.resetPassword(token, resetPassword);
    expect(userId).toBe(byToken!.id);

    const reloaded = await new MongooseUserRepository().findById(userId);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.passwordRecovery).toBeUndefined();
    expect(await bcrypt.compare(resetPassword, reloaded!.passwordHash)).toBe(true);
    expect(await bcrypt.compare(originalPassword, reloaded!.passwordHash)).toBe(false);

    await UserModel.deleteOne({ email: recoveryEmail });
  }, 30000);
});