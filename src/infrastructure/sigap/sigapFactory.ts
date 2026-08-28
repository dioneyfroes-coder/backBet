import { ISigapTransmissionPort } from '@/core/sigap/domain/ports/ISigapTransmissionPort';
import { ISigapImpedimentPort } from '@/core/sigap/domain/ports/ISigapImpedimentPort';
import { appConfig } from '@/shared/config/appConfig';
import { MockSigapTransmissionProvider } from './MockSigapTransmissionProvider';
import { MockSigapImpedimentProvider } from './MockSigapImpedimentProvider';

export interface SigapProviders {
  transmission: ISigapTransmissionPort;
  impediment?: ISigapImpedimentPort;
}

/**
 * Factory de provedores SIGAP (padrão plugin, mesmo molde de createPixProvider
 * e createComplianceProviders). A decisão de qual adapter usar vem de
 * appConfig.sigap.provider; hoje apenas 'mock' é suportado, permitindo trocar
 * pela integração real (SPA/Serpro) sem alterar o domínio.
 */
export function createSigapProviders(): SigapProviders {
  if (!appConfig.sigap.enabled) {
    throw new Error('SIGAP is disabled in this environment.');
  }

  const provider = appConfig.sigap.provider;
  if (provider === 'mock') {
    const impediment = appConfig.sigap.impedimentEnabled
      ? new MockSigapImpedimentProvider({
          impededDocuments: appConfig.sigap.impededDocuments,
        })
      : undefined;
    return {
      transmission: new MockSigapTransmissionProvider(),
      impediment,
    };
  }

  throw new Error(`SIGAP provider '${provider}' is not supported in this environment.`);
}
