import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import type { IgnoreIncomingRequestFunction } from '@opentelemetry/instrumentation-http';
import { appConfig } from '@/shared/config/appConfig';

const tracingConfig = appConfig.tracing;
const shouldEnableTracing = tracingConfig.enabled;

const resolveDiagLevel = (level: string): DiagLogLevel => {
  switch (level) {
    case 'none':
      return DiagLogLevel.NONE;
    case 'error':
      return DiagLogLevel.ERROR;
    case 'warn':
      return DiagLogLevel.WARN;
    case 'info':
      return DiagLogLevel.INFO;
    case 'debug':
      return DiagLogLevel.DEBUG;
    case 'verbose':
      return DiagLogLevel.VERBOSE;
    default:
      return DiagLogLevel.ERROR;
  }
};

if (shouldEnableTracing) {
  diag.setLogger(new DiagConsoleLogger(), resolveDiagLevel(tracingConfig.diagLogLevel));

  const traceExporter = new OTLPTraceExporter({
    url: tracingConfig.exporterUrl,
    headers: tracingConfig.exporterHeaders,
  });

  const ignoredPaths = new Set(['/health', '/health/cache', '/metrics', '/readiness']);

  const shouldIgnoreRequest = (path?: string): boolean => {
    if (!path) {
      return false;
    }
    if (ignoredPaths.has(path)) {
      return true;
    }
    // Normaliza para evitar query strings influenciando o match
    const [cleanPath] = path.split('?');
    return ignoredPaths.has(cleanPath || path);
  };

  const ignoreIncomingRequest: IgnoreIncomingRequestFunction = (request) => {
    return shouldIgnoreRequest(request?.url);
  };

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: tracingConfig.serviceName,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: appConfig.env,
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: ignoreIncomingRequest,
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-mongoose': {
          enabled: true,
        },
      }),
    ],
  });

  const startTracing = async () => {
    try {
      await sdk.start();
      console.log('📡 OpenTelemetry tracing iniciado');
    } catch (error) {
      console.error('Falha ao iniciar tracing OpenTelemetry', error);
    }
  };
  void startTracing();

  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch (error) {
      console.error('Erro ao finalizar OpenTelemetry SDK', error);
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
