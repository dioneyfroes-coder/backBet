import { randomUUID } from 'crypto';
import {
  ISigapTransmissionPort,
  SigapTransmissionInput,
} from '@/core/sigap/domain/ports/ISigapTransmissionPort';
import { SigapTransmissionResult } from '@/core/sigap/domain/types/sigap.types';

export interface MockSigapTransmissionProviderOptions {
  providerName?: string;
  failNext?: boolean;
}

/**
 * Provedor SIGAP mock determinístico para o MVP: simula o acknowledgment da
 * SPA sem tráfego externo, retornando um ackId. A integração real (mTLS/TLS
 * 1.2, assinatura e-CNPJ, Bearer token, JSON + gzip/base64) entra como um novo
 * adapter que implementa ISigapTransmissionPort, selecionado por
 * appConfig.sigap.provider.
 */
export class MockSigapTransmissionProvider implements ISigapTransmissionPort {
  private readonly providerName: string;
  private failNext: boolean;

  constructor(options: MockSigapTransmissionProviderOptions = {}) {
    this.providerName = options.providerName ?? 'mock-sigap';
    this.failNext = options.failNext ?? false;
  }

  async transmit(input: SigapTransmissionInput): Promise<SigapTransmissionResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SIGAP mock: falha simulada de transmissão');
    }
    return {
      ackId: `sigap-${this.providerName}-${input.fileType}-${input.referenceDate}-${randomUUID().slice(0, 8)}`,
      receivedAt: new Date(),
    };
  }
}
