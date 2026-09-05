/**
 * Copyright (c) 2026 Dioney Froes
 * Project: BackBet
 * Provenance-ID: ML-B522
 */
// ML-B522
/**
 * Value Object base: representa um identificador único (ID).
 * Reutilizável em todos os cores.
 */
export class UniqueId {
  private readonly _value: string;

  constructor(value?: string) {
    this._value = value || this.generateUUID();
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  equals(other: UniqueId): boolean {
    return this._value === other.value;
  }
}
