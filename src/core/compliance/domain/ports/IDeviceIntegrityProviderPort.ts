export interface DeviceIntegrityInput {
  userId: string;
  deviceId?: string;
  userAgent?: string;
  attestation?: string;
}

export interface DeviceIntegrityAssessment {
  valid: boolean;
  reason?: string;
  provider: string;
}

/**
 * Port de verificação de integridade de dispositivo.
 *
 * Adapter atual é 'noop'. No futuro deverá detectar dispositivo adulterado
 * (root/jailbreak), emuladores e troca de deviceId.
 */
export interface IDeviceIntegrityProviderPort {
  assessDevice(input: DeviceIntegrityInput): Promise<DeviceIntegrityAssessment>;
}