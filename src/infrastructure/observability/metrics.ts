import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ prefix: 'backbet_', register: registry });

const httpRequestCounter = new Counter({
  name: 'backbet_http_requests_total',
  help: 'Contador de requisições HTTP recebidas',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const httpRequestLatency = new Histogram({
  name: 'backbet_http_request_duration_ms',
  help: 'Duração das requisições HTTP em milissegundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [50, 100, 250, 500, 1000, 2000, 5000],
  registers: [registry],
});

const httpRequestLatencySeconds = new Histogram({
  name: 'backbet_http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos (para dashboards Prometheus)',
  labelNames: ['method', 'route', 'status_class'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

const httpErrorCounter = new Counter({
  name: 'backbet_http_errors_total',
  help: 'Número de respostas HTTP com status >= 500',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const httpActiveRequests = new Gauge({
  name: 'backbet_http_in_flight',
  help: 'Quantidade de requisições HTTP em processamento',
  labelNames: ['method', 'route'],
  registers: [registry],
});

const dependencyHealthGauge = new Gauge({
  name: 'backbet_dependency_health',
  help: 'Estado reportado pelo readiness para cada dependência externa',
  labelNames: ['dependency'],
  registers: [registry],
});

const contactEnqueuedCounter = new Counter({
  name: 'backbet_contact_enqueued_total',
  help: 'Total de mensagens de contato enfileiradas',
  registers: [registry],
});

const contactSpamCounter = new Counter({
  name: 'backbet_contact_spam_total',
  help: 'Total de mensagens de contato classificadas como spam/blocked',
  registers: [registry],
});

const contactValidationCounter = new Counter({
  name: 'backbet_contact_validation_errors_total',
  help: 'Total de mensagens de contato rejeitadas por validação',
  registers: [registry],
});

export {
  registry as metricsRegistry,
  httpRequestCounter,
  httpRequestLatency,
  httpRequestLatencySeconds,
  httpErrorCounter,
  httpActiveRequests,
  dependencyHealthGauge,
  contactEnqueuedCounter,
  contactSpamCounter,
  contactValidationCounter,
};
