import {
  IGeolocationProviderPort,
  GeolocationAssessmentInput,
  GeolocationAssessment,
} from '@/core/compliance/domain/ports/IGeolocationProviderPort';

/**
 * Provedor de geolocalização no-op: nada é bloqueado. Ponto de extensão para
 * detector real de localização física + VPN/proxy (Fase 14 regulatória).
 */
export class NoopGeolocationProvider implements IGeolocationProviderPort {
  constructor(private readonly providerName: string = 'noop-geolocation') {}

  async assessLocation(_input: GeolocationAssessmentInput): Promise<GeolocationAssessment> {
    return { allowed: true, provider: this.providerName };
  }
}