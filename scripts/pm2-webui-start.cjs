#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const usePm2WebUi = process.env.OBS_USE_PM2_WEBUI !== 'false';
if (!usePm2WebUi) {
  console.log('[pm2-webui] OBS_USE_PM2_WEBUI=false → skipping PM2 WebUI start.');
  process.exit(0);
}

const port = process.env.PM2_WEB_PORT || '9615';
const username = process.env.PM2_WEB_USERNAME || 'backbet';
const password = process.env.PM2_WEB_PASSWORD || 'change-me-now';

const args = [
  'start',
  'pm2',
  '--name',
  'pm2-webui',
  '--',
  'web',
  '--port',
  port,
];

if (username) {
  args.push('--username', username);
}

if (password) {
  args.push('--password', password);
}

console.log(
  `\n[pm2-webui] Starting PM2 WebUI on port ${port} (user: ${username}).\n` +
    'Use npm run pm2:webui:stop to terminate it when finished.\n',
);

const result = spawnSync('pm2', args, {
  stdio: 'inherit',
});

if (result.error) {
  console.error('[pm2-webui] Failed to launch pm2 web:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
