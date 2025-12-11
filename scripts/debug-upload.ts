(async function(){
  try{
    const { createApiServer } = await import('../src/infrastructure/api/ApiServer');
    const { createUserRoutes } = await import('../src/infrastructure/api/routes/userRoutes');
    const { UserRepository } = await import('../src/core/user/domain/repositories/UserRepository');
    const { User } = await import('../src/core/user/domain/entities/User');
    const { Email } = await import('../src/core/user/domain/value-objects/Email');
    const server = createApiServer(0);
    const app = server.getExpressApp();
    const userRepo = new UserRepository();
    const testUser = new User('dev-user-123', new Email('dev@example.com'), 'dev.user', '', 'ACTIVE', new Date(), new Date(), null);
    await userRepo.save(testUser);
    const userRoutes = await createUserRoutes({ userRepository: userRepo });
    app.use('/api/users', userRoutes);
    // perform request using supertest directly on the Express app
    const request = (await import('supertest')).default;
    const path = 'src/infrastructure/api/__fixtures__/test-image.png';
    const res = await request(app)
      .post('/api/users/me/documents')
      .set('Authorization', 'Bearer dev-user-123')
      .attach('document', path);
    console.log('status', res.status);
    console.log('body', res.body || res.text);
  } catch(err) {
    console.error('DEBUG ERROR', err);
    process.exit(1);
  }
})();
