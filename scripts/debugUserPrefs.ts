import request from 'supertest';

async function run() {
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_ISSUER = 'backbet';
  process.env.NODE_ENV = 'development';
  process.env.BACKBET_RUNTIME_ENV = 'development';
  process.env.ALLOW_DEV_BEARER_BYPASS = 'true';

  const { createApiServer } = await import('../src/infrastructure/api/ApiServer');
  const server = createApiServer(0);
  const app = server.getExpressApp();

  const { createUserRoutes } = await import('../src/infrastructure/api/routes/userRoutes');
  const { UserRepository } = await import('../src/core/user/domain/repositories/UserRepository');
  const { User } = await import('../src/core/user/domain/entities/User');
  const { Email } = await import('../src/core/user/domain/value-objects/Email');

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

  const getRes = await request(app).get('/api/users/me/preferences').set('Authorization', 'Bearer dev-user-999');
  console.log('GET status:', getRes.status);
  console.log('GET body:', JSON.stringify(getRes.body, null, 2));

  const putRes = await request(app)
    .put('/api/users/me/preferences')
    .set('Authorization', 'Bearer dev-user-999')
    .send({ emailNotifications: false, smsNotifications: true });

  console.log('PUT status:', putRes.status);
  console.log('PUT body:', JSON.stringify(putRes.body, null, 2));
}

run().catch((err) => {
  console.error('error in debug run', err);
  process.exit(1);
});
