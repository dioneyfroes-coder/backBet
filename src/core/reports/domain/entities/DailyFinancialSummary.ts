import { SupportedCurrency } from '@/core/shared/domain/value-objects/Money';

export type MoneyAggregate = { amountCents: number; count: number };

export type DailyFinancialSummaryProps = {
  date: string;
  currency: SupportedCurrency;
  deposits: MoneyAggregate;
  withdrawals: MoneyAggregate;
  bets: MoneyAggregate;
  prizes: MoneyAggregate;
  refunds: MoneyAggregate;
  grossGamingRevenueCents: number;
  houseTotalCents: number;
  houseProfitCents: number;
  housePrizeReserveCents: number;
  pendingWithdrawals: MoneyAggregate;
  pendingBets: MoneyAggregate;
  exposureCents: number;
  openExposureProfiles: number;
  generatedAt: string;
};

export class DailyFinancialSummary {
  constructor(private readonly props: DailyFinancialSummaryProps) {}

  get grossGamingRevenueCents(): number {
    return this.props.grossGamingRevenueCents;
  }

  toDTO() {
    return {
      date: this.props.date,
      currency: this.props.currency,
      deposits: this.moneyOf(this.props.deposits),
      withdrawals: this.moneyOf(this.props.withdrawals),
      bets: this.moneyOf(this.props.bets),
      prizes: this.moneyOf(this.props.prizes),
      refunds: this.moneyOf(this.props.refunds),
      grossGamingRevenue: this.props.grossGamingRevenueCents / 100,
      house: {
        total: this.props.houseTotalCents / 100,
        profit: this.props.houseProfitCents / 100,
        prizeReserve: this.props.housePrizeReserveCents / 100,
      },
      pendingWithdrawals: this.moneyOf(this.props.pendingWithdrawals),
      pendingBets: this.moneyOf(this.props.pendingBets),
      exposure: {
        amount: this.props.exposureCents / 100,
        openProfiles: this.props.openExposureProfiles,
      },
      generatedAt: this.props.generatedAt,
    };
  }

  private moneyOf(aggregate: MoneyAggregate): { amount: number; count: number } {
    return { amount: aggregate.amountCents / 100, count: aggregate.count };
  }
}