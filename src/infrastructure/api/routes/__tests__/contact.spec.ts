import request from 'supertest';

// Increase timeout for server bootstrap in CI/slow machines
jest.setTimeout(15000);

describe('Contact endpoint', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      BACKBET_RUNTIME_ENV: 'test',
    } as NodeJS.ProcessEnv;
    // Ensure external integrations are disabled during tests
    delete process.env.RECAPTCHA_SECRET;
    process.env.USE_REDIS_QUEUE = 'false';
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 202 and ticketId on valid payload', async () => {
    const { createApiServer } = await import('../../ApiServer');
    const server = createApiServer(0);
    const app = server.getExpressApp();

    const { createContactRoutes } = await import('../contactRoutes');
    const contactRouter = await createContactRoutes();
    app.use('/api/contact', contactRouter);

    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'User', email: 'user@example.com', message: 'Hello support' })
      .set('Content-Type', 'application/json');

    // debug output
    console.log('RESP VALID', res.status, res.body);

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('ticketId');
  });

  it('returns 400 when message missing', async () => {
    const { createApiServer } = await import('../../ApiServer');
    const server = createApiServer(0);
    const app = server.getExpressApp();

    const { createContactRoutes } = await import('../contactRoutes');
    const contactRouter = await createContactRoutes();
    app.use('/api/contact', contactRouter);

    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'User', email: 'user@example.com' })
      .set('Content-Type', 'application/json');

    // debug output
    console.log('RESP INVALID', res.status, res.body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
  });
});
