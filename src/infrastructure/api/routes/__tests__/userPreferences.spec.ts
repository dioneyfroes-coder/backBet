import request from 'supertest';

describe('User preferences integration', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret',
      JWT_ISSUER: 'backbet',
      NODE_ENV: 'development',
      BACKBET_RUNTIME_ENV: 'development',
      ALLOW_DEV_BEARER_BYPASS: 'true',
    } as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns and updates preferences using dev-bypass bearer token', async () => {
    await jest.isolateModulesAsync(async () => {
      try {
        const { createApiServer } = await import('../../ApiServer');
        const server = createApiServer(0);
        const app = server.getExpressApp();

        const { createUserRoutes } = await import('../userRoutes');
        const { UserRepository } = await import(
          '../../../../core/user/domain/repositories/UserRepository'
        );
        const { User } = await import('../../../../core/user/domain/entities/User');
        const { Email } = await import('../../../../core/user/domain/value-objects/Email');

        const userRepo = new UserRepository();
        const testUser = new User(
          'dev-user-999',
          new Email('prefs@example.com'),
          'prefs.user',
          '',
          'ACTIVE',
          new Date(),
          new Date(),
          null,
        );
        await userRepo.save(testUser);

        const userRoutes = await createUserRoutes({ userRepository: userRepo });
        app.use('/api/users', userRoutes);

        const getRes = await request(app)
          .get('/api/users/me/preferences')
          .set('Authorization', 'Bearer dev-user-999');
        console.log('TEST GET body:', JSON.stringify(getRes.body));
        if (getRes.status !== 200) {
          console.error('GET failed:', getRes.status, getRes.body);
          throw new Error('GET request failed: ' + getRes.status);
        }
        expect(getRes.status).toBe(200);
        expect(getRes.body.data.preferences).toHaveProperty('emailNotifications', true);

        const putRes = await request(app)
          .put('/api/users/me/preferences')
          .set('Authorization', 'Bearer dev-user-999')
          .set('Content-Type', 'application/json; charset=utf-8')
          .send({ emailNotifications: false, smsNotifications: true });

        console.log('TEST PUT body:', JSON.stringify(putRes.body));
        if (putRes.status !== 200) {
          console.error('PUT failed:', putRes.status, putRes.body);
          throw new Error('PUT request failed: ' + putRes.status);
        }
        expect(putRes.status).toBe(200);
        expect(putRes.body.data.preferences.emailNotifications).toBe(false);
        expect(putRes.body.data.preferences.smsNotifications).toBe(true);
      } catch (err) {
        console.error('TEST ERROR:', err && ((err as any).stack || err));
        throw err;
      }
    });
  });
});
