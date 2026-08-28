import { SigapImpedimentResult } from '../types/sigap.types';

/**
 * Port de consulta de cidadão impedido no SIGAP.
 *
 * A regulação prevê o cruzamento dos apostadores com cadastros de impedimento
 * (ex.: Bolsa Família, autoexclusão). O adapter 'mock' hoje retorna
 * NOT_IMPEDED de forma determinística; a integração real consumiria o endpoint
 * de consulta da SPA.
 */
export interface ISigapImpedimentPort {
  checkImpediment(documentNumber: string): Promise<SigapImpedimentResult>;
}
