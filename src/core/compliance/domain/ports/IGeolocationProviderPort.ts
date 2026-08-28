export interface GeolocationAssessmentInput {
  userId: string;
  ipAddress?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
}

export interface GeolocationAssessment {
  allowed: boolean;
  reason?: string;
  provider: string;
}

/**
 * Port de provedor de geolocalização.
 *
 * Hoje o adapter é 'noop' (nada bloqueado). No futuro deverá determinar a
 * localização física real (não apenas IP) e detectar VPN/proxy/adulteração,
 * conforme exigência regulatória brasileira de Fase 14.
 */
export interface IGeolocationProviderPort {
  assessLocation(input: GeolocationAssessmentInput): Promise<GeolocationAssessment>;
}