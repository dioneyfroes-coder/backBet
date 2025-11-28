#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const startWithPm2 = (process.env.START_WITH_PM2 || '').toLowerCase() === 'true';

if (startWithPm2) {
  // Start PM2 in foreground so the container stays alive and pm2 logs go to stdout
  const pm2Cmd = 'pm2';
  const args = ['start', 'ecosystem.config.cjs', '--env', process.env.NODE_ENV || 'production', '--no-daemon'];

  console.log(`Starting with PM2: ${pm2Cmd} ${args.join(' ')}`);
  const child = spawn(pm2Cmd, args, { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`PM2 process terminated with signal ${signal}`);
      process.kill(process.pid, signal);
    } else {
      console.log(`PM2 exited with code ${code}`);
      process.exit(code);
    }
  });
} else {
  // Start app directly by requiring the compiled entrypoint
  const distEntry = path.join(__dirname, '..', 'dist', 'index.js');
  try {
    require(distEntry);
  } catch (err) {
    console.error(`Failed to require ${distEntry}. Did you run the build?`, err);
    console.error('You can run `npm run build` locally or ensure Render runs the build step before start.');
    process.exit(1);
  }
}
