import { SigapSubmission } from '../entities/SigapSubmission';
import { SigapFileType, SigapSubmissionStatus } from '../types/sigap.types';

export interface SigapSubmissionQueryOptions {
  limit?: number;
  offset?: number;
  fileType?: SigapFileType;
  status?: SigapSubmissionStatus;
  operatorId?: string;
  referenceDate?: string;
}

export interface SigapSubmissionQueryResult {
  items: SigapSubmission[];
  total: number;
}

/**
 * Port de persistência de remessas SIGAP. A implementação identifica de forma
 * determinística um lote por (operatorId, fileType, referenceDate) para
 * permitir reenvio idempotente do mesmo arquivo do dia.
 */
export interface ISigapSubmissionRepository {
  save(submission: SigapSubmission): Promise<SigapSubmission>;
  findById(id: string): Promise<SigapSubmission | null>;
  findByKey(
    operatorId: string,
    fileType: SigapFileType,
    referenceDate: string,
  ): Promise<SigapSubmission | null>;
  query(options?: SigapSubmissionQueryOptions): Promise<SigapSubmissionQueryResult>;
}
