import { PixProviderPort } from '@/core/finance/domain/ports/PixProviderPort';
import { appConfig } from '@/shared/config/appConfig';
import { MockPixProvider } from './MockPixProvider';

export async function createPixProvider(): Promise<PixProviderPort> {
  const provider = appConfig.payments.pix.provider;

  if (provider === 'mock') {
    return new MockPixProvider({
      latencyMs: appConfig.payments.pix.mockLatencyMs,
      providerName: appConfig.payments.pix.providerName,
    });
  }

  throw new Error(`Pix provider '${provider}' is not supported in this environment.`);
}
