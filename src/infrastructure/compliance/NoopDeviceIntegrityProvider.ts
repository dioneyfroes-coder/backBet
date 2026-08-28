import {
  IDeviceIntegrityProviderPort,
  DeviceIntegrityInput,
  DeviceIntegrityAssessment,
} from '@/core/compliance/domain/ports/IDeviceIntegrityProviderPort';

/**
 * Provedor de integridade de dispositivo no-op: tudo válido. Ponto de extensão
 * para detecção de root/jailbreak, emuladores e tamper.
 */
export class NoopDeviceIntegrityProvider implements IDeviceIntegrityProviderPort {
  constructor(private readonly providerName: string = 'noop-device-integrity') {}

  async assessDevice(_input: DeviceIntegrityInput): Promise<DeviceIntegrityAssessment> {
    return { valid: true, provider: this.providerName };
  }
}