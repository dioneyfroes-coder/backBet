// -----------------------------
// ENUMS / TYPE ALIASES
// -----------------------------

export type BetStatus = 'PENDING' | 'WON' | 'LOST' | 'CANCELED';
export type BetType = 'SINGLE' | 'MULTIPLE';

export type EventStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELED';
export type MarketStatus = 'OPEN' | 'SUSPENDED' | 'CLOSED';
export type OddStatus = 'ACTIVE' | 'SUSPENDED';

// -----------------------------
// DOMAIN DTOs (Data Transfer Objects)
// -----------------------------

export interface ICreateBetDTO {
  /** ID do usuário que fez a aposta */
  userId: string;

  /** ID do evento esportivo */
  eventId: string;

  /** ID do mercado (ex: “Vencedor”, “Total de Gols”) */
  marketId: string;

  /** ID da odd selecionada */
  oddId: string;

  /** Valor da aposta */
  amount: number;

  /** Tipo da aposta (simples ou múltipla) */
  type: BetType;
}

export interface ICancelBetDTO {
  /** ID da aposta a ser cancelada */
  betId: string;

  /** Motivo do cancelamento (opcional para logs e auditoria) */
  reason: string;

  /** ID do usuário ou sistema que cancelou a aposta */
  canceledBy: string;
}

export interface IResolveBetDTO {
  /** ID da aposta a ser resolvida */
  betId: string;

  /** Resultado da aposta */
  result: Extract<BetStatus, 'WON' | 'LOST'>;

  /** Resultado real do mercado (ex: “Time A venceu”) */
  marketResult: string;
}
