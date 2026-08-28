import { appConfig } from '@/shared/config/appConfig';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import {
  sigapSubmissionCounter,
  sigapSubmissionFailureCounter,
} from '@/infrastructure/observability/metrics';
import { SigapSubmission } from '../entities/SigapSubmission';
import { ISigapSubmissionRepository } from '../repositories/ISigapSubmissionRepository';
import { ISigapTransmissionPort } from '../ports/ISigapTransmissionPort';
import { ISigapImpedimentPort } from '../ports/ISigapImpedimentPort';
import {
  SigapFileType,
  SigapPayloadRecord,
  SigapImpedimentResult,
  SigapSubmissionStatus,
} from '../types/sigap.types';
import {
  SigapBettorRecord,
  SigapBetRecord,
  SigapWalletRecord,
  SigapDailyAggregateRecord,
  betRecordFromBet,
} from './payloads/SigapPayloadBuilder';

export interface SigapTransmitOptions {
  operatorId?: string;
  fileType: SigapFileType;
  referenceDate: string;
  payload: SigapPayloadRecord[];
}

export interface SigapServiceOptions {
  submissionRepository: ISigapSubmissionRepository;
  transmissionProvider: ISigapTransmissionPort;
  impedimentProvider?: ISigapImpedimentPort;
}

export interface SigapQueryOptions {
  limit?: number;
  offset?: number;
  fileType?: SigapFileType;
  status?: SigapSubmissionStatus;
  referenceDate?: string;
}

/**
 * SigapService orquestra a produção e transmissão de remessas ao SIGAP
 * (Fase 16). Reutiliza a infraestrutura de auditoria (Fase 15) apenas para
 * registrar a��ões administrativas em endpoints; aqui registra cada remessa no
 * repositório próprio de submissões.
 *
 * O provedor real de transmissão (mTLS, e-CNPJ, assinatura) é plugado via
 * appConfig.sigap.provider; hoje o adapter 'mock' simula o acknowledgment.
 */
export class SigapService {
  constructor(private readonly options: SigapServiceOptions) {}

  get submissionRepository(): ISigapSubmissionRepository {
    return this.options.submissionRepository;
  }

  get providerName(): string {
    return this.options.transmissionProvider.constructor.name;
  }

  /**
   * Transmite um payload de determinada data referência ao SIGAP, criando ou
   * reutilizando (idempotente por (operatorId, fileType, referenceDate)) o
   * registro de submissão e incrementando tentativas em caso de reenvio.
   */
  async transmitFile(input: SigapTransmitOptions): Promise<SigapSubmission> {
    const operatorId = input.operatorId ?? appConfig.sigap.operatorId;
    const existing = await this.options.submissionRepository.findByKey(
      operatorId,
      input.fileType,
      input.referenceDate,
    );

    let submission: SigapSubmission;
    if (existing) {
      existing.attemptCount += 1;
      existing.markPending();
      submission = existing;
    } else {
      submission = SigapSubmission.create({
        operatorId,
        fileType: input.fileType,
        referenceDate: input.referenceDate,
        provider: this.providerName,
        payloadSummary: { records: input.payload.length, fileType: input.fileType },
        attemptCount: 1,
      });
    }

    try {
      const result = await this.options.transmissionProvider.transmit({
        operatorId,
        fileType: input.fileType,
        referenceDate: input.referenceDate,
        payload: input.payload,
      });
      submission.markTransmitted(result.ackId);
      await this.options.submissionRepository.save(submission);
      this.incrementSubmissionMetric('transmitted', input.fileType);
      writeStructuredLog({
        component: 'sigap',
        action: 'transmit',
        fileType: input.fileType,
        referenceDate: input.referenceDate,
        operatorId,
        status: submission.status,
        ackId: result.ackId,
        records: input.payload.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      submission.markFailed('SIGAP_TRANSMISSION_FAILED', message);
      await this.options.submissionRepository.save(submission);
      this.incrementSubmissionMetric('failed', input.fileType);
      writeStructuredLog(
        {
          component: 'sigap',
          action: 'transmit',
          fileType: input.fileType,
          referenceDate: input.referenceDate,
          operatorId,
          status: submission.status,
          error: message,
          attempts: submission.attemptCount,
        },
        'error',
      );
    }

    return submission;
  }

  /**
   * Explica um arquivo a partir de dados de domínio (apostadores/apostas/
   * carteiras) antes de transmitir. Recebe dados já agregados; quem coleta a
   * partir dos repositórios são os métodos helpers abaixo.
   */
  async transmitBettorData(
    referenceDate: string,
    data: {
      bettors: SigapBettorRecord[];
      wallets: SigapWalletRecord[];
      bets: SigapBetRecord[];
    },
  ): Promise<SigapSubmission[]> {
    const results: SigapSubmission[] = [];
    results.push(
      await this.transmitFile({
        fileType: 'APOSTADOR',
        referenceDate,
        payload: data.bettors.map((r) => ({ ...r })),
      }),
    );
    results.push(
      await this.transmitFile({
        fileType: 'CARTEIRA',
        referenceDate,
        payload: data.wallets.map((r) => ({ ...r })),
      }),
    );
    results.push(
      await this.transmitFile({
        fileType: 'APOSTAS',
        referenceDate,
        payload: data.bets.map((r) => ({ ...r })),
      }),
    );
    return results;
  }

  /**
   * Consulta o status de impedimento de um apostador pelo documento (CPF).
   * Se a consulta não estiver configurada, retorna UNKNOWN de forma segura.
   */
  async checkImpediment(documentNumber: string): Promise<SigapImpedimentResult> {
    if (!appConfig.sigap.enabled || !this.options.impedimentProvider) {
      return { status: 'UNKNOWN', reference: 'none' };
    }
    try {
      const result = await this.options.impedimentProvider.checkImpediment(documentNumber);
      if (result.status === 'IMPEDED') {
        writeStructuredLog(
          {
            component: 'sigap',
            action: 'impediment',
            status: result.status,
            documentNumber,
          },
          'warn',
        );
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      writeStructuredLog(
        { component: 'sigap', action: 'impediment', error: message },
        'error',
      );
      return { status: 'UNKNOWN', reference: 'none' };
    }
  }

  /** Lista submissões registradas com paginação/filtros. */
  async getSubmissions(
    options: SigapQueryOptions = {},
  ): Promise<{ items: ReturnType<SigapSubmission['toDTO']>[]; total: number }> {
    const query = await this.options.submissionRepository.query({
      limit: options.limit,
      offset: options.offset,
      fileType: options.fileType,
      status: options.status,
      referenceDate: options.referenceDate,
    });
    return { items: query.items.map((s) => s.toDTO()), total: query.total };
  }

  /** Busca uma submissão pelo id. */
  async getSubmissionById(id: string): Promise<ReturnType<SigapSubmission['toDTO']> | null> {
    const submission = await this.options.submissionRepository.findById(id);
    return submission ? submission.toDTO() : null;
  }

  /** Exporta todas as apostas de um dia como registros SIGAP. */
  async collectBetsForDate(bets: unknown[]): Promise<SigapBetRecord[]> {
    return (bets as import('@/core/betting/domain/entities/Bet').Bet[]).map(betRecordFromBet);
  }

  /**
   * Monta o agregado diário do operador a partir das apostas do dia. Requer
   * IBetRepository. Total de depósitos/saques é tratado como 0 quando não há
   * ledger disponível (agregação global de carteiras ainda não suporta soma).
   */
  async buildDailyAggregate(
    referenceDate: string,
    bets: import('@/core/betting/domain/entities/Bet').Bet[],
  ): Promise<SigapDailyAggregateRecord> {
    const userIds = new Set(bets.map((b) => b.userId));
    const totalBets = bets.length;
    const totalBetAmountCents = bets.reduce((acc, b) => acc + b.amountCents, 0);
    const won = bets.filter((b) => b.status === 'WON');
    const totalWinsPaidCents = won.reduce((acc, b) => acc + b.potentialReturnCents, 0);
    return {
      referenceDate,
      totalBettors: userIds.size,
      totalBets,
      totalBetAmountCents,
      totalWinsPaidCents,
      totalDepositsCents: 0,
      totalWithdrawalsCents: 0,
    };
  }

  private incrementSubmissionMetric(
    label: 'transmitted' | 'failed',
    fileType: SigapFileType,
  ): void {
    try {
      if (label === 'failed') {
        sigapSubmissionFailureCounter.inc({ fileType });
      } else {
        sigapSubmissionCounter.inc({ fileType });
      }
    } catch (err) {
      console.debug(`sigap metric inc failed (${label})`, err);
    }
  }
}
