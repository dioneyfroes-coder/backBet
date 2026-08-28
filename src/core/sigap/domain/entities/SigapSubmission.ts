import { UniqueId } from '@/core/shared/domain/value-objects/UniqueId';
import {
  SigapFileType,
  SigapSubmissionStatus,
  SigapPayloadRecord,
} from '../types/sigap.types';

export interface ISigapSubmissionInput {
  id?: string;
  operatorId: string;
  fileType: SigapFileType;
  referenceDate: string;
  status?: SigapSubmissionStatus;
  provider: string;
  attemptCount?: number;
  payloadSummary?: SigapPayloadRecord;
  ackId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
  submittedAt?: Date;
}

export interface ISigapSubmissionDTO {
  id: string;
  operatorId: string;
  fileType: SigapFileType;
  referenceDate: string;
  status: SigapSubmissionStatus;
  provider: string;
  attemptCount: number;
  payloadSummary?: SigapPayloadRecord;
  ackId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
}

/**
 * SigapSubmission é um registro de uma transmissão (tentativa) de arquivo ao
 * SIGAP. Imutável quanto ao identificador, porém seu status evolui conforme o
 * ciclo de vida da remessa (PENDING -> TRANSMITTED -> ACKED | REJECTED), e as
 * tentativas de reenvio incrementam attemptCount. Persistido em coleção própria
 * para rastreabilidade e auditoria regulatória.
 */
export class SigapSubmission {
  constructor(
    public readonly id: string,
    public readonly operatorId: string,
    public readonly fileType: SigapFileType,
    public readonly referenceDate: string,
    public status: SigapSubmissionStatus,
    public provider: string,
    public attemptCount: number,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public readonly payloadSummary?: SigapPayloadRecord,
    public readonly ackId?: string,
    public readonly errorCode?: string,
    public readonly errorMessage?: string,
    public readonly submittedAt?: Date,
  ) {}

  static create(input: ISigapSubmissionInput): SigapSubmission {
    const now = new Date();
    return new SigapSubmission(
      input.id ?? new UniqueId().value,
      input.operatorId,
      input.fileType,
      input.referenceDate,
      input.status ?? 'PENDING',
      input.provider,
      input.attemptCount ?? 0,
      input.createdAt ?? now,
      input.updatedAt ?? now,
      input.payloadSummary,
      input.ackId,
      input.errorCode,
      input.errorMessage,
      input.submittedAt,
    );
  }

  markTransmitted(ackId: string): void {
    this.status = 'ACKED';
    (this as { ackId?: string }).ackId = ackId;
    (this as { submittedAt?: Date }).submittedAt = new Date();
    this.updatedAt = new Date();
  }

  markFailed(errorCode: string, errorMessage: string): void {
    this.status = 'FAILED';
    (this as { errorCode?: string }).errorCode = errorCode;
    (this as { errorMessage?: string }).errorMessage = errorMessage;
    this.updatedAt = new Date();
  }

  markPending(): void {
    this.status = 'PENDING';
    this.updatedAt = new Date();
  }

  toDTO(): ISigapSubmissionDTO {
    return {
      id: this.id,
      operatorId: this.operatorId,
      fileType: this.fileType,
      referenceDate: this.referenceDate,
      status: this.status,
      provider: this.provider,
      attemptCount: this.attemptCount,
      payloadSummary: this.payloadSummary,
      ackId: this.ackId,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      submittedAt: this.submittedAt,
    };
  }
}
