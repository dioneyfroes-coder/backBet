import { MongooseSigapSubmissionRepository } from '../MongooseSigapSubmissionRepository';
import { SigapSubmissionModel } from '../../schemas/SigapSubmissionSchema';
import { SigapSubmission } from '@/core/sigap/domain/entities/SigapSubmission';

const makeSubmission = (overrides: Partial<Parameters<typeof SigapSubmission.create>[0]> = {}) =>
  SigapSubmission.create({
    id: overrides.id ?? 's-1',
    operatorId: overrides.operatorId ?? 'op-1',
    fileType: overrides.fileType ?? 'OPERADOR_DIARIO',
    referenceDate: overrides.referenceDate ?? '2026-08-28',
    provider: overrides.provider ?? 'mock-sigap',
    ...overrides,
  });

describe('MongooseSigapSubmissionRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('save usa updateOne com upsert', async () => {
    const spy = jest.spyOn(SigapSubmissionModel, 'updateOne').mockResolvedValue({} as any);
    const repo = new MongooseSigapSubmissionRepository();
    const submission = makeSubmission();
    await repo.save(submission);
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(args[0].submissionId).toBe('s-1');
  });

  it('findById retorna domínio a partir do doc', async () => {
    jest.spyOn(SigapSubmissionModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        submissionId: 's-1',
        operatorId: 'op-1',
        fileType: 'OPERADOR_DIARIO',
        referenceDate: '2026-08-28',
        status: 'ACKED',
        provider: 'mock-sigap',
        attemptCount: 1,
        payloadSummary: { records: 2 },
        ackId: 'ack-1',
        createdAt: new Date('2026-08-28T00:00:00Z'),
        updatedAt: new Date('2026-08-28T00:00:00Z'),
      } as any),
    } as any);
    const repo = new MongooseSigapSubmissionRepository();
    const found = await repo.findById('s-1');
    expect(found?.ackId).toBe('ack-1');
    expect(found?.status).toBe('ACKED');
  });

  it('findByKey busca pela chave lógica e retorna null quando ausente', async () => {
    jest.spyOn(SigapSubmissionModel, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    } as any);
    const repo = new MongooseSigapSubmissionRepository();
    const found = await repo.findByKey('op-1', 'APOSTADOR', '2026-08-28');
    expect(found).toBeNull();
  });

  it('query aplica filtros e paginação', async () => {
    const findSpy = jest.spyOn(SigapSubmissionModel, 'find').mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([makeSubmission({ id: 's-1' }).toDTO()] as any),
    } as any);
    const countSpy = jest.spyOn(SigapSubmissionModel, 'countDocuments').mockResolvedValue(1);
    const repo = new MongooseSigapSubmissionRepository();
    const result = await repo.query({ fileType: 'OPERADOR_DIARIO', limit: 10, offset: 0 });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(findSpy).toHaveBeenCalled();
    expect(countSpy).toHaveBeenCalled();
  });
});
