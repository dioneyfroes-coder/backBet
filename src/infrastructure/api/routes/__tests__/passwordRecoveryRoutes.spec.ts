import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../index';
import { UserRepository } from '../../../../core/user/domain/repositories/UserRepository';
import { User } from '../../../../core/user/domain/entities/User';
import { Email } from '../../../../core/user/domain/value-objects/Email';

describe('PasswordRecovery API', () => {
  let app: express.Express;
  let userRepository: any;

  beforeEach(async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.BACKBET_RUNTIME_ENV = 'test';
    process.env.USE_MONGOOSE_PERSISTENCE = 'false';
    delete process.env.REDIS_URL;

    userRepository = new UserRepository();
    app = express();
    app.use(express.json());
    app.use(await createApiRouter({ user: { userRepository } }));
    // Cria usuário
    const user = new User(
      '1',
      new Email('api@example.com'),
      'apiuser',
      'hash',
      'ACTIVE',
      new Date(),
      new Date(),
      null,
      [],
      {
        emailNotifications: true,
        smsNotifications: false,
        marketingEmails: false,
        requireWithdrawPassword: null,
      },
      undefined,
    );
    await userRepository.save(user);
  });

  it('aceita request de recuperação de senha', async () => {
    const res = await request(app)
      .post('/auth/request-password-recovery')
      .send({ email: 'api@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/link de recuperação/i);
  });

  it('não revela se email não existe', async () => {
    const res = await request(app)
      .post('/auth/request-password-recovery')
      .send({ email: 'naoexiste@x.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/link de recuperação/i);
  });

  it('reseta senha com token válido', async () => {
    // Solicita token
    await request(app).post('/auth/request-password-recovery').send({ email: 'api@example.com' });
    const user = await userRepository.findById('1');
    const token = user.passwordRecovery.token;
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token, newPassword: 'novaSenha123' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sucesso/i);
  });

  it('não reseta senha com token inválido', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'tokeninvalido', newPassword: 'novaSenha' });
    expect(res.status).toBe(404);
  });
});
