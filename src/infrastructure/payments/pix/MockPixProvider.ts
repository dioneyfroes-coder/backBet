import { createHash } from 'crypto';
import {
  PixChargeRequest,
  PixChargeResponse,
  PixChargeSnapshot,
  PixPaymentConfirmation,
  PixPayoutRequest,
  PixPayoutResponse,
  PixProviderPort,
} from '@/core/finance/domain/ports/PixProviderPort';
import { appConfig } from '@/shared/config/appConfig';
import { verifyWebhookSignature as verifyHmacSignature } from '@/shared/services/webhookSignature';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const deterministicId = (prefix: string, payload: unknown): string => {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
  return `${prefix}_${hash}`;
};

/* ------------------------------------------------------------------ *
 *  EMV® QRCPS-MPM (BR Code) mínimamente válido com CRC16.
 *  Estrutura: TLV ids [00] Payload, [26] Merchant Account (GUI + chave),
 *  [52] MCC, [53] Currículo (986), [54] Montante, [58] País (BR),
 *  [59] Nome do comerciante, [60] Cidade, [62] Txid, [63] CRC16.
 * ------------------------------------------------------------------ */
const tlv = (id: string, value: string): string => {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
};

const crc16Ccitt = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

export type BuildEmvQrInput = {
  pixKey: string;
  description?: string;
  amount: number;
  txid: string;
  merchantName?: string;
  merchantCity?: string;
};

export function buildPixEmvQr(input: BuildEmvQrInput): string {
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', input.pixKey);
  const amount = input.amount.toFixed(2);
  const txidSuffix = input.txid.slice(0, 16) || '***';
  const merchantName = (input.merchantName ?? 'BackBet').slice(0, 25);
  const merchantCity = (input.merchantCity ?? 'Sao Paulo').slice(0, 15);

  const core =
    tlv('00', '01') + // Payload Format Indicator
    tlv('26', merchantAccount) +
    tlv('52', '0000') + // MCC
    tlv('53', '986') + // BRL
    tlv('54', amount) +
    tlv('58', 'BR') +
    tlv('59', merchantName) +
    tlv('60', merchantCity) +
    tlv('62', tlv('05', txidSuffix)); // Additional Data: txid

  // CRC16 sempre no final: [63] + 04 + CRC (o CRC é calculado sobre o payload
  // sem o próprio campo 63).
  return `${core}${tlv('63', crc16Ccitt(core))}`;
}

export type MockPixProviderOptions = {
  latencyMs?: number;
  providerName?: string;
  webhookSecret?: string;
  chargeTtlMs?: number;
  clock?: () => Date;
};

type StoredCharge = PixChargeSnapshot;

export class MockPixProvider implements PixProviderPort {
  private readonly latencyMs: number;
  private readonly providerName: string;
  private readonly webhookSecret: string;
  private readonly chargeTtlMs: number;
  private readonly clock: () => Date;
  private readonly registry = new Map<string, StoredCharge>();

  constructor(options: MockPixProviderOptions = {}) {
    this.latencyMs = options.latencyMs ?? 50;
    this.providerName = options.providerName ?? 'backbet-mock-pix';
    this.webhookSecret = options.webhookSecret ?? appConfig.payments.pix.webhookSecret;
    this.chargeTtlMs = options.chargeTtlMs ?? appConfig.payments.pix.chargeTtlMs;
    this.clock = options.clock ?? (() => new Date());
  }

  private get now(): Date {
    return this.clock();
  }

  private computeStatus(charge: StoredCharge): PixChargeSnapshot['status'] {
    if (charge.status === 'PAID' || charge.status === 'REFUNDED' || charge.status === 'CANCELED') {
      return charge.status;
    }
    // PENDING: se o prazo passou, a charge expira.
    if (this.now.getTime() > charge.expiresAt.getTime()) {
      return 'EXPIRED';
    }
    return 'PENDING';
  }

  private snapshotOf(charge: StoredCharge): PixChargeSnapshot {
    return {
      ...charge,
      status: this.computeStatus(charge),
    };
  }

  async createCharge(input: PixChargeRequest): Promise<PixChargeResponse> {
    await this.simulateLatency();
    const chargeId = deterministicId('pix_charge', input);
    const reference = deterministicId('pix_reference', { chargeId, userId: input.userId });
    const createdAt = this.now;
    const expiresAt = new Date(createdAt.getTime() + this.chargeTtlMs);
    const charge: StoredCharge = {
      chargeId,
      reference,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      status: 'PENDING',
      expiresAt,
      createdAt,
      provider: this.providerName,
    };
    this.registry.set(chargeId, charge);
    return {
      chargeId,
      reference,
      status: charge.status,
      qrCode: buildPixEmvQr({
        pixKey: appConfig.payments.pix.defaultPixKey,
        description: input.description,
        amount: input.amount,
        txid: chargeId,
      }),
      expiresAt,
      provider: this.providerName,
    };
  }

  async confirmPayment(chargeId: string): Promise<PixPaymentConfirmation> {
    await this.simulateLatency();
    const stored = this.registry.get(chargeId);
    if (stored) {
      this.registry.set(chargeId, {
        ...stored,
        status: 'PAID',
        confirmedAt: this.now,
      });
    }
    const reference = stored?.reference ?? deterministicId('pix_reference', { chargeId });
    const status: PixChargeSnapshot['status'] = stored ? 'PAID' : 'PENDING';
    return {
      chargeId,
      reference,
      status,
      confirmedAt: this.now,
      provider: this.providerName,
    };
  }

  async getCharge(chargeId: string): Promise<PixChargeSnapshot | null> {
    await this.simulateLatency();
    const stored = this.registry.get(chargeId);
    return stored ? this.snapshotOf(stored) : null;
  }

  async refundCharge(chargeId: string): Promise<PixChargeSnapshot | null> {
    await this.simulateLatency();
    const stored = this.registry.get(chargeId);
    if (!stored) {
      return null;
    }
    const refunded: StoredCharge = {
      ...stored,
      status: 'REFUNDED',
      confirmedAt: this.now,
    };
    this.registry.set(chargeId, refunded);
    return this.snapshotOf(refunded);
  }

  async verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
    return verifyHmacSignature(rawBody, signature, this.webhookSecret);
  }

  async initiatePayout(input: PixPayoutRequest): Promise<PixPayoutResponse> {
    await this.simulateLatency();
    const payoutId = deterministicId('pix_payout', input);
    const reference = deterministicId('pix_reference', { payoutId, userId: input.userId });
    return {
      payoutId,
      reference,
      status: 'COMPLETED',
      processedAt: this.now,
      provider: this.providerName,
    };
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await sleep(this.latencyMs);
    }
  }
}