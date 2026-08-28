import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';

export type SigapTransmissionJobOptions = {
  intervalMs: number;
  /**
   * Coletor de apostas para o dia. Permite injetar dados em testes e adaptar a
   * fonte (in-memory vs Mongoose) sem acoplar o job a uma implementação
   * específica do repositório.
   */
  collectBets?: (referenceDate: string) => Promise<Bet[]>;
};

/**
 * Job diário de transmissão ao SIGAP (Fase 16). Monta o agregado OPERADOR_DIARIO
 * a partir das apostas registradas e transmite a remessa ao provedor SIGAP.
 *
 * O escopo atual transmite apenas o arquivo agregado diário (mais simples e
 * determinístico). Os arquivos por apostador (APOSTADOR, CARTEIRA, APOSTAS)
 * exigem enumeração global de usuários e são acionados via endpoint admin.
 */
export class SigapTransmissionJob {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly collectBets: (referenceDate: string) => Promise<Bet[]>;

  constructor(
    private readonly sigapService: SigapService,
    private readonly options: SigapTransmissionJobOptions,
  ) {
    this.collectBets = options.collectBets ?? (() => Promise.resolve([]));
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.runSafely();
    this.timer = setInterval(() => this.runSafely(), this.options.intervalMs);
    this.timer.unref?.();
    writeStructuredLog({ component: 'sigap-transmission-job', status: 'started' });
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    writeStructuredLog({ component: 'sigap-transmission-job', status: 'stopped' });
  }

  /** Transmite o agregado diário de uma data referência (padrão: hoje). */
  async transmitDailyAggregate(referenceDate = new Date().toISOString().slice(0, 10)): Promise<void> {
    const bets = await this.collectBets(referenceDate);
    const aggregate = await this.sigapService.buildDailyAggregate(referenceDate, bets);
    const submission = await this.sigapService.transmitFile({
      fileType: 'OPERADOR_DIARIO',
      referenceDate,
      payload: [
        {
          dataReferencia: aggregate.referenceDate,
          totalApostadores: aggregate.totalBettors,
          totalApostas: aggregate.totalBets,
          totalValorApostadoCentavos: aggregate.totalBetAmountCents,
          totalPremiosPagosCentavos: aggregate.totalWinsPaidCents,
          totalDepositosCentavos: aggregate.totalDepositsCents,
          totalSaquesCentavos: aggregate.totalWithdrawalsCents,
        },
      ],
    });
    writeStructuredLog({
      component: 'sigap-transmission-job',
      action: 'daily',
      referenceDate,
      status: submission.status,
      ackId: submission.ackId,
    });
  }

  private async runSafely(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.transmitDailyAggregate();
    } catch (error) {
      writeStructuredLog(
        {
          component: 'sigap-transmission-job',
          action: 'daily',
          error: error instanceof Error ? error.message : 'unknown',
        },
        'error',
      );
    } finally {
      this.running = false;
    }
  }
}
