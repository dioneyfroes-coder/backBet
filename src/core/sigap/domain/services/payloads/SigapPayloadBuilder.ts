import { User } from '@/core/user/domain/entities/User';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { LedgerEntry } from '@/core/finance/domain/entities/LedgerEntry';
import { SigapFileType, SigapPayloadRecord } from '../../types/sigap.types';

/** Dados cadastrais de um apostador para o arquivo APOSTADOR. */
export interface SigapBettorRecord {
  userId: string;
  email: string;
  username: string;
  status: string;
  verified: boolean;
  registeredAt: Date;
}

/** Registro agregado de carteira por apostador para o arquivo CARTEIRA. */
export interface SigapWalletRecord {
  userId: string;
  currency: string;
  balanceCents: number;
  lockedBalanceCents: number;
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  totalBetsCents: number;
  totalWinsCents: number;
}

/** Registro de aposta esportiva para o arquivo APOSTAS. */
export interface SigapBetRecord {
  betId: string;
  userId: string;
  eventId: string;
  marketId: string;
  amountCents: number;
  odds: number;
  status: string;
  type: string;
  createdAt: Date;
  potentialReturnCents: number;
}

/** Agregados diários do operador para o arquivo OPERADOR_DIARIO. */
export interface SigapDailyAggregateRecord {
  referenceDate: string;
  totalBettors: number;
  totalBets: number;
  totalBetAmountCents: number;
  totalWinsPaidCents: number;
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
}

/** Agregados mensais do operador para o arquivo OPERADOR_MENSAL. */
export interface SigapMonthlyAggregateRecord {
  referencePeriod: string;
  totalBettors: number;
  totalBets: number;
  totalBetAmountCents: number;
  totalWinsPaidCents: number;
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  totalGGRCents: number;
}

/**
 * Construtor de payloads SIGAP (funções puras e determinísticas).
 *
 * Cada arquivo exigido pela SPA (APOSTADOR, CARTEIRA, APOSTAS, OPERADOR_DIARIO,
 * OPERADOR_MENSAL) é montado a partir de dados de domínio já disponíveis no
 * BackBet. As funções são puras para serem facilmente testáveis e independentes
 * de infraestrutura.
 */
export function buildBettorPayload(records: SigapBettorRecord[]): SigapPayloadRecord[] {
  return records.map((record) => ({
    idApostador: record.userId,
    email: record.email,
    nomeUsuario: record.username,
    status: record.status,
    verificado: record.verified,
    dataCadastro: record.registeredAt.toISOString(),
  }));
}

export function buildWalletPayload(records: SigapWalletRecord[]): SigapPayloadRecord[] {
  return records.map((record) => ({
    idApostador: record.userId,
    moeda: record.currency,
    saldoCentavos: record.balanceCents,
    saldoBloqueadoCentavos: record.lockedBalanceCents,
    totalDepositosCentavos: record.totalDepositsCents,
    totalSaquesCentavos: record.totalWithdrawalsCents,
    totalApostasCentavos: record.totalBetsCents,
    totalPremiosCentavos: record.totalWinsCents,
  }));
}

export function buildBetsPayload(records: SigapBetRecord[]): SigapPayloadRecord[] {
  return records.map((record) => ({
    idAposta: record.betId,
    idApostador: record.userId,
    idEvento: record.eventId,
    idMercado: record.marketId,
    valorCentavos: record.amountCents,
    cotacao: record.odds,
    status: record.status,
    tipo: record.type,
    dataCriacao: record.createdAt.toISOString(),
    retornoPotencialCentavos: record.potentialReturnCents,
  }));
}

export function buildDailyAggregatePayload(
  records: SigapDailyAggregateRecord[],
): SigapPayloadRecord[] {
  return records.map((record) => ({
    dataReferencia: record.referenceDate,
    totalApostadores: record.totalBettors,
    totalApostas: record.totalBets,
    totalValorApostadoCentavos: record.totalBetAmountCents,
    totalPremiosPagosCentavos: record.totalWinsPaidCents,
    totalDepositosCentavos: record.totalDepositsCents,
    totalSaquesCentavos: record.totalWithdrawalsCents,
  }));
}

export function buildMonthlyAggregatePayload(
  records: SigapMonthlyAggregateRecord[],
): SigapPayloadRecord[] {
  return records.map((record) => ({
    periodoReferencia: record.referencePeriod,
    totalApostadores: record.totalBettors,
    totalApostas: record.totalBets,
    totalValorApostadoCentavos: record.totalBetAmountCents,
    totalPremiosPagosCentavos: record.totalWinsPaidCents,
    totalDepositosCentavos: record.totalDepositsCents,
    totalSaquesCentavos: record.totalWithdrawalsCents,
    totalGGRCentavos: record.totalGGRCents,
  }));
}

/** Monta um registro APOSTADOR a partir de um usuário de domínio. */
export function bettorRecordFromUser(user: User, verified: boolean): SigapBettorRecord {
  return {
    userId: user.id,
    email: user.email.toString(),
    username: user.username,
    status: user.status,
    verified,
    registeredAt: user.createdAt,
  };
}

/** Monta um registro APOSTAS a partir de uma aposta de domínio. */
export function betRecordFromBet(bet: Bet): SigapBetRecord {
  return {
    betId: bet.id,
    userId: bet.userId,
    eventId: bet.eventId,
    marketId: bet.marketId,
    amountCents: bet.amountCents,
    odds: bet.odds.value,
    status: bet.status,
    type: bet.type,
    createdAt: bet.createdAt,
    potentialReturnCents: bet.potentialReturnCents,
  };
}

/** Monta um registro CARTEIRA a partir de um mapa de agregações de saldo. */
export function walletRecordFromAggregates(input: {
  userId: string;
  currency: string;
  balanceCents: number;
  lockedBalanceCents: number;
  depositsCents: number;
  withdrawalsCents: number;
  betsCents: number;
  winsCents: number;
}): SigapWalletRecord {
  return {
    userId: input.userId,
    currency: input.currency,
    balanceCents: input.balanceCents,
    lockedBalanceCents: input.lockedBalanceCents,
    totalDepositsCents: input.depositsCents,
    totalWithdrawalsCents: input.withdrawalsCents,
    totalBetsCents: input.betsCents,
    totalWinsCents: input.winsCents,
  };
}

/** Selector de builder por tipo de arquivo. */
export function buildPayloadForFileType(
  fileType: SigapFileType,
  data: {
    bettors?: SigapBettorRecord[];
    wallets?: SigapWalletRecord[];
    bets?: SigapBetRecord[];
    daily?: SigapDailyAggregateRecord[];
    monthly?: SigapMonthlyAggregateRecord[];
  },
): SigapPayloadRecord[] {
  switch (fileType) {
    case 'APOSTADOR':
      return buildBettorPayload(data.bettors ?? []);
    case 'CARTEIRA':
      return buildWalletPayload(data.wallets ?? []);
    case 'APOSTAS':
      return buildBetsPayload(data.bets ?? []);
    case 'OPERADOR_DIARIO':
      return buildDailyAggregatePayload(data.daily ?? []);
    case 'OPERADOR_MENSAL':
      return buildMonthlyAggregatePayload(data.monthly ?? []);
    default:
      return [];
  }
}

/** Função utilitária: soma de valores/contagens a partir de entradas brutas. */
export function sumLedgerByType(
  entries: LedgerEntry[],
  type: string,
): { amountCents: number; count: number } {
  let amountCents = 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.type === type) {
      amountCents += entry.amountCents;
      count += 1;
    }
  }
  return { amountCents, count };
}
