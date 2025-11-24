#!/usr/bin/env node
require('dotenv').config();
const nodemailer = require('nodemailer');
const { setTimeout: delay } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');

const BASE_URL = process.env.HEALTH_MONITOR_BASE_URL || 'http://localhost:3000';
const INTERVAL_MS = parseInt(process.env.HEALTH_MONITOR_INTERVAL_MS || '60000', 10);
const TIMEOUT_MS = parseInt(process.env.HEALTH_MONITOR_TIMEOUT_MS || '5000', 10);
const MAX_LATENCY_MS = parseInt(process.env.HEALTH_MONITOR_MAX_LATENCY_MS || '2000', 10);
const RECIPIENTS = (process.env.HEALTH_MONITOR_ALERT_RECIPIENTS || '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);
const DRY_RUN = process.env.HEALTH_MONITOR_DRY_RUN === 'true';
const RUN_ONCE = process.env.HEALTH_MONITOR_RUN_ONCE === 'true';
const NOTIFY_RECOVERY = process.env.HEALTH_MONITOR_NOTIFY_RECOVERY !== 'false';
const EMAIL_ALERTS_ENABLED = process.env.OBS_ENABLE_EMAIL_ALERTS !== 'false';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true;
const SMTP_USERNAME = process.env.SMTP_USERNAME;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USERNAME;

let transporter;
let lastAlertSignature = null;
let hadAlert = false;

const endpoints = [
  {
    name: 'health',
    path: '/health',
    validate: (data) => {
      if (!data || data.status !== 'healthy') {
        return { ok: false, reason: `status=${data?.status ?? 'unknown'}` };
      }
      return { ok: true };
    },
  },
  {
    name: 'readiness',
    path: '/readiness',
    validate: (data) => {
      if (!data || data.ready !== true) {
        return { ok: false, reason: `ready=${data?.ready ?? 'unknown'}` };
      }
      return { ok: true };
    },
  },
];

function log(message) {
  console.log(`[health-monitor] ${message}`);
}

async function ensureTransporter() {
  if (!EMAIL_ALERTS_ENABLED || transporter || DRY_RUN) {
    return;
  }

  if (!SMTP_USERNAME || !SMTP_PASSWORD || !SMTP_FROM) {
    throw new Error('SMTP credentials are missing. Set SMTP_USERNAME, SMTP_PASSWORD and SMTP_FROM.');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USERNAME,
      pass: SMTP_PASSWORD,
    },
  });
}

async function sendAlert(subject, bodyLines) {
  const text = bodyLines.join('\n');

  if (!EMAIL_ALERTS_ENABLED) {
    log(`[alerts-disabled] ${subject}\n${text}`);
    return;
  }

  if (RECIPIENTS.length === 0) {
    log('No recipients configured (HEALTH_MONITOR_ALERT_RECIPIENTS). Skipping email.');
    return;
  }

  if (DRY_RUN) {
    log(`[dry-run] Would send e-mail "${subject}" to ${RECIPIENTS.join(', ')}:\n${text}`);
    return;
  }

  await ensureTransporter();

  await transporter.sendMail({
    from: SMTP_FROM,
    to: RECIPIENTS,
    subject,
    text,
  });

  log(`Alert e-mail sent to ${RECIPIENTS.join(', ')}`);
}

async function checkEndpoint(endpoint) {
  const url = new URL(endpoint.path, BASE_URL).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    const latencyMs = Number((performance.now() - startedAt).toFixed(2));
    let payload;
    try {
      payload = await res.clone().json();
    } catch (_err) {
      payload = await res.text();
    }

    if (!res.ok) {
      return {
        ok: false,
        endpoint: endpoint.name,
        status: res.status,
        latencyMs,
        reason: `HTTP ${res.status}`,
        payload,
      };
    }

    if (latencyMs > MAX_LATENCY_MS) {
      return {
        ok: false,
        endpoint: endpoint.name,
        status: res.status,
        latencyMs,
        reason: `latency ${latencyMs}ms > ${MAX_LATENCY_MS}ms`,
      };
    }

    if (endpoint.validate) {
      const validation = endpoint.validate(payload);
      if (!validation.ok) {
        return {
          ok: false,
          endpoint: endpoint.name,
          status: res.status,
          latencyMs,
          reason: validation.reason || 'Validation failed',
          payload,
        };
      }
    }

    return { ok: true, endpoint: endpoint.name, latencyMs };
  } catch (error) {
    const latencyMs = Number((performance.now() - startedAt).toFixed(2));
    return {
      ok: false,
      endpoint: endpoint.name,
      latencyMs,
      reason: error.name === 'AbortError' ? 'timeout' : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function issuesSignature(issues) {
  return JSON.stringify(issues.map((issue) => `${issue.endpoint}:${issue.reason}`));
}

async function runChecks() {
  const results = await Promise.all(endpoints.map((ep) => checkEndpoint(ep)));
  const issues = results.filter((result) => !result.ok);
  const summary = results.map((result) => `${result.endpoint}: ${result.ok ? 'ok' : result.reason} (${result.latencyMs}ms)`).join(' | ');
  log(summary);

  return issues;
}

async function handleIssues(issues) {
  if (issues.length === 0) {
    if (hadAlert && NOTIFY_RECOVERY) {
      await sendAlert('BackBet health recovered ✅', [
        `Serviço: ${BASE_URL}`,
        'Todos os endpoints voltaram a responder normalmente.',
        `Horário: ${new Date().toISOString()}`,
      ]);
    }
    lastAlertSignature = null;
    hadAlert = false;
    return;
  }

  const signature = issuesSignature(issues);
  if (signature === lastAlertSignature) {
    log('Issues persist, alert already sent.');
    return;
  }

  const lines = [
    `Problemas detectados no BackBet (${BASE_URL})`,
    `Horário: ${new Date().toISOString()}`,
    '',
  ];

  issues.forEach((issue) => {
    lines.push(`- ${issue.endpoint}: ${issue.reason} (latency=${issue.latencyMs}ms${issue.status ? `, status=${issue.status}` : ''})`);
    if (issue.payload && typeof issue.payload !== 'string') {
      lines.push(`  payload: ${JSON.stringify(issue.payload).slice(0, 500)}`);
    } else if (typeof issue.payload === 'string') {
      lines.push(`  payload: ${issue.payload.slice(0, 500)}`);
    }
  });

  await sendAlert('BackBet health alert ⚠️', lines);
  lastAlertSignature = signature;
  hadAlert = true;
}

async function main() {
  log('Starting health monitor...');
  log(`Base URL: ${BASE_URL}`);
  log(`Interval: ${INTERVAL_MS}ms | Timeout: ${TIMEOUT_MS}ms | Max latency: ${MAX_LATENCY_MS}ms`);
  log(`Recipients: ${RECIPIENTS.length > 0 ? RECIPIENTS.join(', ') : 'none'}`);
  log(`Email alerts enabled: ${EMAIL_ALERTS_ENABLED}`);
  if (DRY_RUN) {
    log('Running in DRY-RUN mode (no e-mails will be sent).');
  }

  const loop = async () => {
    const issues = await runChecks();
    await handleIssues(issues);
  };

  await loop();

  if (RUN_ONCE) {
    log('Run-once flag enabled, exiting.');
    process.exit(0);
  }

  while (true) {
    await delay(INTERVAL_MS);
    await loop();
  }
}

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down.');
  process.exit(0);
});

main().catch((error) => {
  console.error('[health-monitor] Fatal error:', error);
  process.exit(1);
});
