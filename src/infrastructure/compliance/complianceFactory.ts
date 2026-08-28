import { IKycProviderPort } from '@/core/compliance/domain/ports/IKycProviderPort';
import { IGeolocationProviderPort } from '@/core/compliance/domain/ports/IGeolocationProviderPort';
import { IDeviceIntegrityProviderPort } from '@/core/compliance/domain/ports/IDeviceIntegrityProviderPort';
import { appConfig } from '@/shared/config/appConfig';
import { MockKycProvider } from './MockKycProvider';
import { NoopGeolocationProvider } from './NoopGeolocationProvider';
import { NoopDeviceIntegrityProvider } from './NoopDeviceIntegrityProvider';

export interface ComplianceProviders {
  kyc?: IKycProviderPort;
  geolocation?: IGeolocationProviderPort;
  deviceIntegrity?: IDeviceIntegrityProviderPort;
}

/**
 * Factory de provedores de compliance (padrão plugin, mesmo molde de
 * createPixProvider). A decisão de qual adapter usar vem de appConfig
 * (backed por env COMPLIANCE_*), permitindo trocar o mock por provedores
 * reais sem alterar o domínio.
 */
export function createComplianceProviders(): ComplianceProviders {
  const providers: ComplianceProviders = {};

  if (appConfig.compliance.kyc.enabled) {
    const provider = appConfig.compliance.kyc.provider;
    if (provider === 'mock') {
      providers.kyc = new MockKycProvider();
    } else {
      throw new Error(`KYC provider '${provider}' is not supported in this environment.`);
    }
  }

  if (appConfig.compliance.geolocation.enabled) {
    const provider = appConfig.compliance.geolocation.provider;
    if (provider === 'noop') {
      providers.geolocation = new NoopGeolocationProvider();
    } else {
      throw new Error(`Geolocation provider '${provider}' is not supported in this environment.`);
    }
  }

  if (appConfig.compliance.deviceIntegrity.enabled) {
    const provider = appConfig.compliance.deviceIntegrity.provider;
    if (provider === 'noop') {
      providers.deviceIntegrity = new NoopDeviceIntegrityProvider();
    } else {
      throw new Error(
        `Device integrity provider '${provider}' is not supported in this environment.`,
      );
    }
  }

  return providers;
}