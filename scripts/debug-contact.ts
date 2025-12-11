(async () => {
  try {
    const { createApiServer } = await import('../src/infrastructure/api/ApiServer');
    const { createApiRouter } = await import('../src/infrastructure/api/routes/index');
    const request = (await import('supertest')).default;

    const server = createApiServer(0);
    const app = server.getExpressApp();

    const apiRouter = await createApiRouter();
    app.use('/api', apiRouter);

    console.log('Calling valid contact payload');
    const res1 = await request(app)
      .post('/api/contact')
      .send({ name: 'User', email: 'user@example.com', message: 'Hello support' })
      .set('Content-Type', 'application/json');
    console.log('STATUS', res1.status);
    console.log('BODY', res1.body || res1.text);

    console.log('Calling invalid contact payload (missing message)');
    const res2 = await request(app)
      .post('/api/contact')
      .send({ name: 'User', email: 'user@example.com' })
      .set('Content-Type', 'application/json');
    console.log('STATUS', res2.status);
    console.log('BODY', res2.body || res2.text);
  } catch (err) {
    console.error('DEBUG ERROR', err);
    process.exit(1);
  }
})();
