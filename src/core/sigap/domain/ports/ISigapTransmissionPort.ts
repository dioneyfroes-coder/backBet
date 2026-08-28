import {
  SigapFileType,
  SigapPayloadRecord,
  SigapTransmissionResult,
} from '../types/sigap.types';

/**
 * Dados transmitidos ao SIGAP em uma remessa. Contém o tipo do arquivo, a data
 * de referência e o payload (lista de registros) no formato esperado pela SPA.
 */
export interface SigapTransmissionInput {
  operatorId: string;
  fileType: SigapFileType;
  referenceDate: string;
  payload: SigapPayloadRecord[];
}

/**
 * Port de transmissão de arquivos ao SIGAP.
 *
 * Segue o mesmo molde de plugins (KYC/Pix): o domínio depende apenas desta
 * port, e a escolha do adaptador concreto (mock hoje; integração real com
 * mTLS, e-CNPJ e assinatura via SPA/Serpro depois) fica na camada de
 * infraestrutura, selecionada por appConfig.sigap.provider.
 */
export interface ISigapTransmissionPort {
  transmit(input: SigapTransmissionInput): Promise<SigapTransmissionResult>;
}
