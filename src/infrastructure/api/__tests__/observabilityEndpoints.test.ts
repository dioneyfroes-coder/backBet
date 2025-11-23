import request from 'supertest';
import { Express } from 'express';
import { createApiServer } from '@/infrastructure/api/ApiServer';
import { cacheConfig } from '@/shared/config/cacheConfig';
import { redisClient } from '@/infrastructure/cache/RedisClient';
import { metricsRegistry } from '@/infrastructure/observability/metrics';
import * as requestContext from '@/shared/observability/requestContext';
import {
  MongoMockHandle,
  mockMongoConnected,
  mockMongoDisconnected,
} from '../test-helpers/mongoMockHelper';

describe('Observability endpoints', () => {
  let app: Express;
  let originalCacheEnabled: boolean;
  let originalMongoFlag: string | undefined;
  let mongoMock: MongoMockHandle | undefined;

  beforeEach(() => {
    const server = createApiServer(0);
    server.registerHealthCheck();
    server.registerMetricsEndpoint();
    app = server.getExpressApp();
    originalCacheEnabled = cacheConfig.enabled;
    originalMongoFlag = process.env.USE_MONGOOSE_PERSISTENCE;
  });

  afterEach(() => {
    cacheConfig.enabled = originalCacheEnabled;
    if (typeof originalMongoFlag === 'undefined') {
      delete process.env.USE_MONGOOSE_PERSISTENCE;
    } else {
      process.env.USE_MONGOOSE_PERSISTENCE = originalMongoFlag;
    }
    mongoMock?.restore();
    mongoMock = undefined;
    jest.restoreAllMocks();
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

  it('GET /readiness should skip checks when dependencies are disabled', async () => {
    cacheConfig.enabled = false;
    delete process.env.USE_MONGOOSE_PERSISTENCE;

    const res = await request(app).get('/readiness');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.redis.status).toBe('skipped');
    expect(res.body.checks.mongo.status).toBe('skipped');
  });

  it('GET /readiness should report redis latency when cache is enabled', async () => {
    cacheConfig.enabled = true;
    jest.spyOn(redisClient, 'ping').mockResolvedValue('PONG');

    const res = await request(app).get('/readiness');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.redis.status).toBe('up');
    expect(typeof res.body.checks.redis.latencyMs).toBe('number');
  });

  it('GET /readiness should return 503 when redis ping fails', async () => {
    cacheConfig.enabled = true;
    jest.spyOn(redisClient, 'ping').mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/readiness');

    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.checks.redis.status).toBe('down');
    expect(res.body.checks.redis.error).toBe('boom');
  });

  it('GET /readiness should report mongo latency when connected', async () => {
    cacheConfig.enabled = false;
    process.env.USE_MONGOOSE_PERSISTENCE = 'true';
    mongoMock = mockMongoConnected();

    const res = await request(app).get('/readiness');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.mongo.status).toBe('up');
    expect(typeof res.body.checks.mongo.latencyMs).toBe('number');
    expect(res.body.checks.mongo.state).toBe('connected');
  });

  it('GET /readiness should fail when mongo is disconnected', async () => {
    cacheConfig.enabled = false;
    process.env.USE_MONGOOSE_PERSISTENCE = 'true';
    mongoMock = mockMongoDisconnected();

    const res = await request(app).get('/readiness');

    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.checks.mongo.status).toBe('down');
    expect(res.body.checks.mongo.state).toBe('disconnected');
  });

  it('GET /metrics surfaces exporter errors', async () => {
    jest.spyOn(metricsRegistry, 'metrics').mockRejectedValueOnce(new Error('exporter down'));

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(500);
    expect(res.text).toBe('Erro ao gerar métricas');
  });

  it('registerErrorHandler serializes failures with request ids', async () => {
    const server = createApiServer(0);
    const localApp = server.getExpressApp();
    localApp.get('/explode', () => {
      const err: any = new Error('explode');
      err.code = 'BOOM';
      err.statusCode = 418;
      throw err;
    });
    server.registerErrorHandler();
    jest.spyOn(requestContext, 'getRequestContext').mockReturnValue({ requestId: 'ctx-1' });

    const res = await request(localApp).get('/explode');

    expect(res.status).toBe(418);
    expect(res.body.error).toMatchObject({ code: 'BOOM', message: 'explode' });
    expect(res.body.meta.requestId).toBe('ctx-1');
  });

  it('get404Handler returns structured not found payloads', async () => {
    const server = createApiServer(0);
    server.get404Handler();

    const res = await request(server.getExpressApp()).get('/totally-missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});
