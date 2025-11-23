import request from 'supertest';
import { Express } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';

describe('Observability endpoints', () => {
  let app: Express;

  beforeAll(() => {
    const server = createApiServer(0);
    server.registerHealthCheck();
    server.registerMetricsEndpoint();
    app = server.getExpressApp();
  });

  it('GET /health should expose service heartbeat with uptime', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /health/cache should expose cache switch and metrics payload', async () => {
    const res = await request(app).get('/health/cache');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cache');
    expect(res.body.cache).toHaveProperty('enabled');
    expect(res.body.cache).toHaveProperty('metrics');
  });

  it('GET /metrics should expose Prometheus formatted text', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('backbet_http_requests_total');
  });
});
