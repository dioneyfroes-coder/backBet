import { createHash } from 'crypto';
import {
  PixChargeRequest,
  PixChargeResponse,
  PixPaymentConfirmation,
  PixPayoutRequest,
  PixPayoutResponse,
  PixProviderPort,
} from '@/core/finance/domain/ports/PixProviderPort';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const deterministicId = (prefix: string, payload: unknown): string => {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
  return `${prefix}_${hash}`;
};

export type MockPixProviderOptions = {
  latencyMs?: number;
  providerName?: string;
};

export class MockPixProvider implements PixProviderPort {
  private readonly latencyMs: number;
  private readonly providerName: string;

  constructor(options: MockPixProviderOptions = {}) {
    this.latencyMs = options.latencyMs ?? 50;
    this.providerName = options.providerName ?? 'backbet-mock-pix';
  }

  async createCharge(input: PixChargeRequest): Promise<PixChargeResponse> {
    await this.simulateLatency();
    const chargeId = deterministicId('pix_charge', input);
    const reference = deterministicId('pix_reference', { chargeId, userId: input.userId });
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    return {
      chargeId,
      reference,
      status: 'PENDING',
      qrCode: `0002010102122686mock.pix/${chargeId}5204000053039865802BR5913BackBet Mock6009SaoPaulo62130515reference${reference}6304ABCD`,
      expiresAt,
      provider: this.providerName,
    };
  }

  async confirmPayment(chargeId: string): Promise<PixPaymentConfirmation> {
    await this.simulateLatency();
    const reference = deterministicId('pix_reference', { chargeId });
    return {
      chargeId,
      reference,
      status: 'PAID',
      confirmedAt: new Date(),
      provider: this.providerName,
    };
  }

  async initiatePayout(input: PixPayoutRequest): Promise<PixPayoutResponse> {
    await this.simulateLatency();
    const payoutId = deterministicId('pix_payout', input);
    const reference = deterministicId('pix_reference', { payoutId, userId: input.userId });
    return {
      payoutId,
      reference,
      status: 'COMPLETED',
      processedAt: new Date(),
      provider: this.providerName,
    };
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await sleep(this.latencyMs);
    }
  }
}
