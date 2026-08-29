import request from 'supertest';

describe('Web console (interface mínima)', () => {
  jest.setTimeout(30000);
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret',
      JWT_ISSUER: 'backbet',
      NODE_ENV: 'test',
      BACKBET_RUNTIME_ENV: 'test',
      ALLOW_DEV_BEARER_BYPASS: 'true',
    } as NodeJS.ProcessEnv;
    delete process.env.REDIS_URL;
    process.env.USE_REDIS_QUEUE = 'false';
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('serves a static interface in /console', async () => {
    await jest.isolateModulesAsync(async () => {
      const { createApiServer } = await import('../../ApiServer');
      const server = createApiServer(0);
      const app = server.getExpressApp();

      const index = await request(app).get('/console/');
      expect(index.status).toBe(200);
      expect(index.headers['content-type']).toMatch(/text\/html/);
      expect(index.text).toContain('BackBet');

      const script = await request(app).get('/console/app.js');
      expect(script.status).toBe(200);
      expect(script.text).toContain('/api');

      const styles = await request(app).get('/console/styles.css');
      expect(styles.status).toBe(200);
    });
  });
});