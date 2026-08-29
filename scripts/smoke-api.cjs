#!/usr/bin/env node
'use strict';

/**
 * Smoke test de ENDPOINTS REAIS (Fase 19).
 *
 * Sobe o servidor COMPILADO (node dist/index.js) em processo separado com
 * persistência in-memory (sem Mongo/Redis locais), aguarda o /health e então
 * exercita um fluxo real de negócio via HTTP:
 *   health/docs -> register -> login -> me -> deposit -> withdraw (mínimo) ->
 *   place bet real (evento semeado no repo in-memory) -> cancel (refund) ->
 *   refresh token.
 *
 * Uso:
 *   npm run build   # primeiro (o script usa dist/)
 *   npm run smoke
 *   node scripts/smoke-api.cjs
 *
 * Cross-platform (Windows/PowerShell, macOS, Linux). Depende apenas do Node e
 * do app compilado — não precisa de Docker/Mongo/Redis (REAL endpoints HTTP).
 */

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const PORT = process.env.SMOKE_PORT || '3999';
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'Smoke123!';
const EMAIL = `smoke-${Date.now()}@example.com`;
const USERNAME = `smoke_${Date.now() % 10000}`;

const checks = [];
const record = (label, pass, detail) => {
  checks.push({ label, pass });
  const line = `${pass ? '✓' : '✖'} ${label}${detail ? '  ' + detail : ''}`;
  console[pass ? 'log' : 'error'](line);
};

async function req(method, p, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // resposta não-JSON (ex.: 404 de rota desconhecida)
  }
  return { status: res.status, body: json };
}

function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        if (await fn()) return resolve();
      } catch {
        // ainda subindo
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout aguardando: ${label}`));
      setTimeout(tick, 500);
    };
    void tick();
  });
}

async function main() {
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'development',
      BACKBET_RUNTIME_ENV: 'development',
      JWT_SECRET: 'smoke-secret',
      JWT_ISSUER: 'backbet',
      ALLOW_DEV_BEARER_BYPASS: 'false',
      USE_MONGOOSE_PERSISTENCE: 'false',
      CACHE_ENABLED: 'false',
      LOG_FILE_ENABLED: 'false',
      OBS_USE_PM2_WEBUI: 'false',
      OBS_ENABLE_PROMETHEUS: 'false',
      AUDIT_ACCESS_LOG_ENABLED: 'false',
    },
  });
  child.stderr.pipe(process.stderr);

  try {
    await waitFor(async () => (await fetch(`${BASE}/health`)).ok, 40000, '/health');

    // 1. Observabilidade e docs
    let r = await req('GET', '/health');
    record('GET /health', r.status === 200, `status=${r.status}`);
    r = await req('GET', '/health/cache');
    record('GET /health/cache', r.status === 200, `status=${r.status}`);
    r = await req('GET', '/api/docs.json');
    record(
      'GET /api/docs.json',
      r.status === 200 && !!r.body?.info,
      `status=${r.status} title=${r.body?.info?.title || '-'}`,
    );
    const FOOTBALL_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    r = await req('GET', `/api/v1/events/${FOOTBALL_UUID}`);
    record('GET /api/events/:id', r.status === 200 && !!r.body?.data, `status=${r.status}`);

    // 2. Register
    r = await req('POST', '/api/v1/auth/register', {
      body: { email: EMAIL, password: PASSWORD, username: USERNAME, firstName: 'Smoke', lastName: 'Test' },
    });
    record('POST /api/auth/register', r.status === 201 && !!r.body?.data?.user, `status=${r.status}`);
    const userId = r.body?.data?.user?.id;

    // 3. Login
    r = await req('POST', '/api/v1/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    record(
      'POST /api/auth/login',
      r.status === 200 && !!r.body?.data?.accessToken,
      `status=${r.status}`,
    );
    const accessToken = r.body?.data?.accessToken;
    const refreshToken = r.body?.data?.refreshToken;

    // 4. GET me (JWT real)
    r = await req('GET', '/api/v1/auth/me', { token: accessToken });
    record('GET /api/auth/me', r.status === 200 && r.body?.data?.id === userId, `status=${r.status}`);

    // 5. Deposit
    r = await req('POST', '/api/v1/wallets/deposit', {
      token: accessToken,
      body: { amount: 150.5, currency: 'BRL', description: 'smoke deposit' },
    });
    const balanceAfterDeposit = r.body?.data?.wallet?.balance;
    record(
      'POST /api/wallets/deposit',
      [200, 201].includes(r.status) && balanceAfterDeposit === 150.5,
      `status=${r.status} balance=${balanceAfterDeposit}`,
    );

    // 6. GET wallet
    r = await req('GET', '/api/v1/wallets/me', { token: accessToken });
    record(
      'GET /api/wallets/me',
      r.status === 200 && r.body?.data?.balance === 150.5,
      `status=${r.status} balance=${r.body?.data?.balance}`,
    );

    // 7. Withdraw abaixo do mínimo (validação real do fluxo)
    r = await req('POST', '/api/v1/wallets/withdraw', {
      token: accessToken,
      body: { amount: 50, currency: 'BRL', pixKey: 'user@pix' },
    });
    record(
      'POST /api/wallets/withdraw (abaixo do mínimo)',
      r.status === 400 && r.body?.error?.code === 'VALIDATION_ERROR',
      `status=${r.status} code=${r.body?.error?.code}`,
    );

    // 8. Place bet real (evento semeado no repositório in-memory)
    r = await req('POST', '/api/v1/bets', {
      token: accessToken,
      body: {
        eventId: FOOTBALL_UUID,
        marketId: 'mkt-1x2',
        oddId: 'home',
        amount: 10,
        type: 'SINGLE',
        currency: 'BRL',
      },
    });
    const betId = r.body?.data?.id;
    record('POST /api/bets (aposta real)', r.status === 201 && !!betId, `status=${r.status} bet=${betId}`);
    if (betId) {
      r = await req('GET', '/api/v1/bets/me', { token: accessToken });
      const listed = Array.isArray(r.body?.data?.bets) && r.body.data.bets.some((b) => b.id === betId);
      record('GET /api/bets/me', r.status === 200 && listed, `status=${r.status} listed=${listed}`);

      r = await req('GET', '/api/v1/wallets/me', { token: accessToken });
      record(
        'saldo após aposta (estaca abatida)',
        r.status === 200 && r.body?.data?.balance === 140.5,
        `balance=${r.body?.data?.balance} (esperado 140.5)`,
      );

      r = await req('POST', `/api/v1/bets/${betId}/cancel`, { token: accessToken });
      record('POST /api/bets/:id/cancel (refund)', r.status === 200, `status=${r.status}`);

      r = await req('GET', '/api/v1/wallets/me', { token: accessToken });
      record(
        'saldo após cancelamento (estaca devolvida)',
        r.status === 200 && r.body?.data?.balance === 150.5,
        `balance=${r.body?.data?.balance} (esperado 150.5)`,
      );
    }

    // 9. Refresh token
    r = await req('POST', '/api/v1/auth/refresh', { body: { refreshToken } });
    record('POST /api/auth/refresh', r.status === 200 && !!r.body?.data?.accessToken, `status=${r.status}`);
  } catch (err) {
    record('fluxo de smoke', false, String(err));
  } finally {
    child.kill();
  }

  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\nSMOKE: ${checks.length - failed}/${checks.length} checagens OK`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();