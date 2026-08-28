import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';
import {
  buildBettorPayload,
  buildWalletPayload,
  buildBetsPayload,
  buildDailyAggregatePayload,
  buildMonthlyAggregatePayload,
  buildPayloadForFileType,
  betRecordFromBet,
  walletRecordFromAggregates,
} from '../SigapPayloadBuilder';

const bettor = () => ({
  userId: 'u-1',
  email: 'a@b.com',
  username: 'apostador',
  status: 'ACTIVE',
  verified: true,
  registeredAt: new Date('2026-08-01T00:00:00Z'),
});

describe('SigapPayloadBuilder', () => {
  it('APOSTADOR: monta registro de apostador', () => {
    const payload = buildBettorPayload([bettor()]);
    expect(payload[0]).toMatchObject({
      idApostador: 'u-1',
      email: 'a@b.com',
      nomeUsuario: 'apostador',
      verificado: true,
    });
    expect(payload[0].dataCadastro).toBe('2026-08-01T00:00:00.000Z');
  });

  it('APOSTAS: monta registro a partir de aposta de domÃ­nio', () => {
    const bet = new Bet(
      'bet-1',
      'u-1',
      'evt-1',
      'mkt-1',
      Money.fromCents(2500, 'BRL'),
      new Odds(2),
      'PENDING',
      'SINGLE',
      new Date('2026-08-02T10:00:00Z'),
    );
    const payload = buildBetsPayload([betRecordFromBet(bet)]);
    expect(payload[0]).toMatchObject({
      idAposta: 'bet-1',
      idApostador: 'u-1',
      valorCentavos: 2500,
      cotacao: 2,
    });
  });

  it('CARTEIRA: monta registro a partir de agregados', () => {
    const payload = buildWalletPayload([
      walletRecordFromAggregates({
        userId: 'u-1',
        currency: 'BRL',
        balanceCents: 1000,
        lockedBalanceCents: 500,
        depositsCents: 2000,
        withdrawalsCents: 300,
        betsCents: 1500,
        winsCents: 800,
      }),
    ]);
    expect(payload[0]).toMatchObject({
      idApostador: 'u-1',
      saldoCentavos: 1000,
      totalDepositosCentavos: 2000,
      totalPremiosCentavos: 800,
    });
  });

  it('OPERADOR_DIARIO e OPERADOR_MENSAL montam agregados', () => {
    const daily = buildDailyAggregatePayload([
      {
        referenceDate: '2026-08-28',
        totalBettors: 3,
        totalBets: 10,
        totalBetAmountCents: 50000,
        totalWinsPaidCents: 20000,
        totalDepositsCents: 150000,
        totalWithdrawalsCents: 40000,
      },
    ]);
    expect(daily[0]).toMatchObject({ totalApostas: 10, totalValorApostadoCentavos: 50000 });

    const monthly = buildMonthlyAggregatePayload([
      {
        referencePeriod: '2026-08',
        totalBettors: 20,
        totalBets: 100,
        totalBetAmountCents: 500000,
        totalWinsPaidCents: 150000,
        totalDepositsCents: 900000,
        totalWithdrawalsCents: 200000,
        totalGGRCents: 350000,
      },
    ]);
    expect(monthly[0]).toMatchObject({ periodoReferencia: '2026-08', totalGGRCentavos: 350000 });
  });

  it('buildPayloadForFileType roteia para o builder correto', () => {
    const payload = buildPayloadForFileType('APOSTADOR', { bettors: [bettor()] });
    expect(payload).toHaveLength(1);

    const empty = buildPayloadForFileType('OPERADOR_MENSAL', {});
    expect(empty).toHaveLength(0);
  });
});


