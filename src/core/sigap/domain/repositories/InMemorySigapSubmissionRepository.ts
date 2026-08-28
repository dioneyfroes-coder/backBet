import { SigapSubmission } from '../entities/SigapSubmission';
import {
  ISigapSubmissionRepository,
  SigapSubmissionQueryOptions,
  SigapSubmissionQueryResult,
} from './ISigapSubmissionRepository';

export class InMemorySigapSubmissionRepository implements ISigapSubmissionRepository {
  private readonly records: Map<string, SigapSubmission> = new Map();

  async save(submission: SigapSubmission): Promise<SigapSubmission> {
    this.records.set(submission.id, submission);
    return submission;
  }

  async findById(id: string): Promise<SigapSubmission | null> {
    return this.records.get(id) ?? null;
  }

  async findByKey(
    operatorId: string,
    fileType: SigapSubmission['fileType'],
    referenceDate: string,
  ): Promise<SigapSubmission | null> {
    for (const record of this.records.values()) {
      if (
        record.operatorId === operatorId &&
        record.fileType === fileType &&
        record.referenceDate === referenceDate
      ) {
        return record;
      }
    }
    return null;
  }

  async query(options: SigapSubmissionQueryOptions = {}): Promise<SigapSubmissionQueryResult> {
    let items = Array.from(this.records.values());
    if (options.fileType) {
      items = items.filter((s) => s.fileType === options.fileType);
    }
    if (options.status) {
      items = items.filter((s) => s.status === options.status);
    }
    if (options.operatorId) {
      items = items.filter((s) => s.operatorId === options.operatorId);
    }
    if (options.referenceDate) {
      items = items.filter((s) => s.referenceDate === options.referenceDate);
    }
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const total = items.length;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;
    return { items: items.slice(offset, offset + limit), total };
  }

  clear(): void {
    this.records.clear();
  }

  get size(): number {
    return this.records.size;
  }
}
