import { ILedgerRepository } from '@/core/finance/domain/repositories/ILedgerRepository';
import { LedgerStatus } from '@/core/finance/domain/entities/LedgerEntry';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { IRiskRepository } from '@/core/risk/domain/repositories/IRiskRepository';
import { IHouseTreasuryRepository } from '@/core/treasury/domain/repositories/IHouseTreasuryRepository';
import { SupportedCurrency } from '@/core/shared/domain/value-objects/Money';
import { AppError } from '@/shared/errors/AppError';
import {
  DailyFinancialSummary,
  MoneyAggregate,
} from '@/core/reports/domain/entities/DailyFinancialSummary';

export type GetDailyFinancialSummaryInput = {
  date?: string | Date;
  currency?: SupportedCurrency;
};

/**
 * Resumo financeiro diário do backoffice.
 *
 * Valores do dia vêm do ledger por tipo de operação (todos os usuários):
 * depósitos, saques, stakes (BET_DEBIT), prêmios (BET_WIN + GAME_WIN) e
 * reembolsos (BET_REFUND). O GGR é sinalizado (stakes - prêmios).
 *
 * Pendências são instantâneos: saques aguardando pagamento = holds de saque
 * ainda não concluídos nem revertidos; apostas pendentes = somatório das
 * apostas em status PENDING na moeda do relatório; exposição = soma da
 * exposição em aberto de todos os perfis de risco; tesouraria = saldo da casa.
 */
export class GetDailyFinancialSummary {
  constructor(
    private readonly deps: {
      ledgerRepository: ILedgerRepository;
      betRepository: IBetRepository;
      riskRepository: IRiskRepository;
      treasuryRepository: IHouseTreasuryRepository;
      treasuryWalletId: string;
      defaultCurrency: SupportedCurrency;
    },
  ) {}

  async execute(input: GetDailyFinancialSummaryInput = {}): Promise<DailyFinancialSummary> {
    const currency = input.currency ?? this.deps.defaultCurrency;
    const { start, end, label } = this.resolveDay(input.date ?? new Date());

    const completed = { statuses: ['COMPLETED'] as LedgerStatus[], currency };
    const dayOptions = { ...completed, from: start, to: end };

    const [deposits, withdrawals, bets, prizes, refunds, holds, paidOuts, reversed] =
      await Promise.all([
        this.deps.ledgerRepository.aggregateByTypes(['DEPOSIT'], dayOptions),
        this.deps.ledgerRepository.aggregateByTypes(['WITHDRAWAL_COMPLETED'], dayOptions),
        this.deps.ledgerRepository.aggregateByTypes(['BET_DEBIT'], dayOptions),
        this.deps.ledgerRepository.aggregateByTypes(['BET_WIN', 'GAME_WIN'], dayOptions),
        this.deps.ledgerRepository.aggregateByTypes(['BET_REFUND'], dayOptions),
        this.deps.ledgerRepository.aggregateByTypes(['WITHDRAWAL_HOLD'], completed),
        this.deps.ledgerRepository.aggregateByTypes(['WITHDRAWAL_COMPLETED'], completed),
        this.deps.ledgerRepository.aggregateByTypes(['WITHDRAWAL_REVERSED'], completed),
      ]);

    const [pendingBets, exposure, wallet] = await Promise.all([
      this.deps.betRepository.findByStatus('PENDING'),
      this.deps.riskRepository.getTotalExposure(),
      this.deps.treasuryRepository.getById(this.deps.treasuryWalletId),
    ]);

    const pendingBetsSum = this.sumPendingBets(
      pendingBets.map((bet) => ({
        amountCents: bet.amountCents,
        currency: bet.amount.currency,
      })),
      currency,
    );

    return new DailyFinancialSummary({
      date: label,
      currency,
      deposits,
      withdrawals,
      bets,
      prizes,
      refunds,
      grossGamingRevenueCents: bets.amountCents - prizes.amountCents,
      houseTotalCents: wallet?.totalBalanceCents ?? 0,
      houseProfitCents: wallet?.profitBalanceCents ?? 0,
      housePrizeReserveCents: wallet?.prizeReserveBalanceCents ?? 0,
      pendingWithdrawals: this.outstanding(holds, paidOuts, reversed),
      pendingBets: pendingBetsSum,
      exposureCents: exposure.exposureCents,
      openExposureProfiles: exposure.openProfiles,
      generatedAt: new Date().toISOString(),
    });
  }

  private resolveDay(date: string | Date): { start: Date; end: Date; label: string } {
    let start: Date;
    if (typeof date === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (!match) {
        throw new AppError('INVALID_DATE', 'Data deve estar no formato YYYY-MM-DD', 400);
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      start = new Date(Date.UTC(year, month - 1, day));
      if (
        month < 1 ||
        month > 12 ||
        start.getUTCFullYear() !== year ||
        start.getUTCMonth() !== month - 1 ||
        start.getUTCDate() !== day
      ) {
        throw new AppError('INVALID_DATE', 'Data inválida (YYYY-MM-DD)', 400);
      }
    } else {
      start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }
    const end = new Date(start.getTime() + 86_400_000);
    return { start, end, label: start.toISOString().slice(0, 10) };
  }

  private sumPendingBets(
    bets: Array<{ amountCents: number; currency: string }>,
    currency: string,
  ): MoneyAggregate {
    let amountCents = 0;
    let count = 0;
    for (const bet of bets) {
      if (bet.currency !== currency) continue;
      amountCents += bet.amountCents;
      count += 1;
    }
    return { amountCents, count };
  }

  private outstanding(
    holds: MoneyAggregate,
    paidOuts: MoneyAggregate,
    reversed: MoneyAggregate,
  ): MoneyAggregate {
    return {
      amountCents: Math.max(0, holds.amountCents - paidOuts.amountCents - reversed.amountCents),
      count: Math.max(0, holds.count - paidOuts.count - reversed.count),
    };
  }
}