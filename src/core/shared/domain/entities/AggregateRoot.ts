/**
 * Interface base para agregados (Aggregate Roots).
 * 
 * Agregados são conjuntos de entidades tratadas como uma unidade em transações.
 * Exemplos:
 * - User + Wallet = agregado de usuário
 * - Bet + Event + Market = agregado de apostas
 */
export interface AggregateRoot {
  /**
   * ID único do agregado.
   */
  id: string;

  /**
   * Data de criação.
   */
  createdAt: Date;

  /**
   * Data de última atualização.
   */
  updatedAt?: Date;

  /**
   * Versão do agregado (para otimistic locking).
   */
  version?: number;
}

/**
 * Classe abstrata base para agregados.
 */
export abstract class BaseAggregateRoot implements AggregateRoot {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  version?: number = 1;

  constructor(id: string, createdAt: Date = new Date()) {
    this.id = id;
    this.createdAt = createdAt;
  }

  /**
   * Incrementa versão para controle de concorrência.
   */
  incrementVersion(): void {
    if (this.version) {
      this.version++;
    }
  }

  /**
   * Atualiza timestamp de modificação.
   */
  touch(): void {
    this.updatedAt = new Date();
    this.incrementVersion();
  }
}
