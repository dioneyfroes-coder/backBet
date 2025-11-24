import { appConfig } from '@/shared/config/appConfig';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export interface ObservabilityFeatureToggles {
  usePm2WebUi: boolean;
  enablePrometheus: boolean;
  enableEmailAlerts: boolean;
}

type ToggleTelemetrySource = 'init' | 'override' | 'reset';

const shouldEmitTelemetry = appConfig.runtime.env !== 'test';

let currentToggles: ObservabilityFeatureToggles = { ...appConfig.observability };

const emitToggleTelemetry = (
  source: ToggleTelemetrySource,
  extra?: Record<string, unknown>,
): void => {
  if (!shouldEmitTelemetry) {
    return;
  }

  writeStructuredLog({
    event: 'observability_toggle_state',
    source,
    toggles: currentToggles,
    ...extra,
  });
};

emitToggleTelemetry('init');

export const getObservabilityToggles = (): ObservabilityFeatureToggles => ({
  ...currentToggles,
});

export const overrideObservabilityToggles = (
  overrides: Partial<ObservabilityFeatureToggles>,
  metadata?: Record<string, unknown>,
): void => {
  currentToggles = {
    ...currentToggles,
    ...overrides,
  };
  emitToggleTelemetry('override', { overrides, metadata });
};

export const resetObservabilityToggles = (): void => {
  currentToggles = { ...appConfig.observability };
  emitToggleTelemetry('reset');
};
