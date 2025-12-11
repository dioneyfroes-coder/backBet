import request from 'supertest';
import path from 'path';

describe('User uploads integration', () => {
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

  it('accepts image upload and returns metadata', async () => {
    await jest.isolateModulesAsync(async () => {
      const { createApiServer } = await import('../../ApiServer');
      const server = createApiServer(0);
      const app = server.getExpressApp();

      // Mount routes (minimal mount of userRoutes to /api/users)
      const { createUserRoutes } = await import('../userRoutes');
      // prepare an in-memory user repository and seed a user for dev-bypass id
      const { UserRepository } = await import('@core/user/domain/repositories/UserRepository');
      const { User } = await import('@core/user/domain/entities/User');
      const { Email } = await import('@core/user/domain/value-objects/Email');
      const userRepo = new UserRepository();
      const testUser = new User(
        'dev-user-123',
        new Email('dev@example.com'),
        'dev.user',
        '',
        'ACTIVE',
        new Date(),
        new Date(),
        null,
      );
      await userRepo.save(testUser);

      const userRoutes = await createUserRoutes({ userRepository: userRepo });
      app.use('/api/users', userRoutes);

      const whoami = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer dev-user-123');
      console.log('GET /me =>', whoami.status, whoami.body || whoami.text);

      const response = await request(app)
        .post('/api/users/me/documents')
        .set('Authorization', 'Bearer dev-user-123')
        .attach('document', path.join(__dirname, '../../__fixtures__/test-image.png'));

      // debug output to help CI
      console.log(
        'UPLOAD RES STATUS',
        response.status,
        'BODY:',
        response.body ? response.body : response.text,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('message', 'Documento enviado com sucesso');
      expect(response.body.data).toHaveProperty('document');
      expect(response.body.data.document).toHaveProperty('id');
      expect(response.body.data.document).toHaveProperty('url');
    });
  }, 20000);
});
