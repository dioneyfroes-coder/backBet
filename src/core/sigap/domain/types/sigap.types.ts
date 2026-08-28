/**
 * Tipos de domínio do módulo SIGAP (Sistema de Gestão de Apostas).
 *
 * SIGAP é o sistema da Secretaria de Prêmios e Apostas (SPA) do Ministério da
 * Fazenda para transmissão regulatória de dados de operadores de apostas de
 * quota fixa no Brasil. Ver: https://sigap.fazenda.gov.br/
 *
 * Este módulo implementa a estrutura modular (ports/adapters) para produzir,
 * transmitir e registrar as remessas (arquivos) exigidas pela regulação. A
 * integração real exige credenciais e endpoints fornecidos pela SPA/Serpro;
 * hoje o adapter 'mock' registra as remessas sem tráfego externo.
 */

/**
 * Tipos de arquivo transmitidos ao SIGAP, conforme as normas técnicas da SPA:
 *  - APOSTADOR: dados cadastrais de cada apostador;
 *  - APOSTAS: apostas esportivas detalhadas por apostador/dia;
 *  - CARTEIRA: movimentações financeiras da carteira por apostador/dia;
 *  - OPERADOR_DIARIO: agregados diários da operação;
 *  - OPERADOR_MENSAL: obrigações legais mensais do operador.
 */
export type SigapFileType =
  | 'APOSTADOR'
  | 'APOSTAS'
  | 'CARTEIRA'
  | 'OPERADOR_DIARIO'
  | 'OPERADOR_MENSAL';

export type SigapSubmissionStatus =
  | 'PENDING'
  | 'TRANSMITTED'
  | 'ACKED'
  | 'REJECTED'
  | 'FAILED'
  | 'RETRY';

/** Tipo de consulta opcional do SIGAP: verificação de cidadão impedido. */
export type SigapImpedimentStatus = 'NOT_IMPEDED' | 'IMPEDED' | 'UNKNOWN';

export interface SigapPayloadRecord {
  [key: string]: unknown;
}

/** Resultado de uma transmissão retornado pelo provedor (adapter). */
export interface SigapTransmissionResult {
  ackId: string;
  receivedAt: Date;
}

/** Resultado de uma consulta de impedimento retornado pelo provedor. */
export interface SigapImpedimentResult {
  status: SigapImpedimentStatus;
  reference: string;
}
