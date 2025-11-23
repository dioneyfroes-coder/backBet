// src/index.ts

// Bootstrap file to register path aliases before loading the server
import 'newrelic';
import './infrastructure/observability/tracing.js';
import './server.js';