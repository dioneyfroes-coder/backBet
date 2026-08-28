import { InMemorySigapSubmissionRepository } from '../InMemorySigapSubmissionRepository';
import { SigapSubmission } from '../../entities/SigapSubmission';

const makeSubmission = (overrides: Partial<Parameters<typeof SigapSubmission.create>[0]> = {}) =>
  SigapSubmission.create({
    id: overrides.id ?? 's-1',
    operatorId: overrides.operatorId ?? 'op-1',
    fileType: overrides.fileType ?? 'OPERADOR_DIARIO',
    referenceDate: overrides.referenceDate ?? '2026-08-28',
    provider: overrides.provider ?? 'mock-sigap',
    ...overrides,
  });

describe('InMemorySigapSubmissionRepository', () => {
  let repo: InMemorySigapSubmissionRepository;

  beforeEach(() => {
    repo = new InMemorySigapSubmissionRepository();
  });

  it('salva e busca por id', async () => {
    const sub = makeSubmission();
    await repo.save(sub);
    const found = await repo.findById('s-1');
    expect(found?.fileType).toBe('OPERADOR_DIARIO');
  });

  it('findByKey busca por (operatorId, fileType, referenceDate)', async () => {
    await repo.save(makeSubmission());
    const found = await repo.findByKey('op-1', 'OPERADOR_DIARIO', '2026-08-28');
    expect(found?.id).toBe('s-1');
    const notFound = await repo.findByKey('op-1', 'APOSTADOR', '2026-08-28');
    expect(notFound).toBeNull();
  });

  it('query filtra e pagina', async () => {
    await repo.save(makeSubmission({ id: 's-1', fileType: 'OPERADOR_DIARIO', status: 'ACKED' }));
    await repo.save(makeSubmission({ id: 's-2', fileType: 'APOSTAS', status: 'FAILED' }));
    await repo.save(makeSubmission({ id: 's-3', fileType: 'APOSTAS', status: 'ACKED' }));

    const all = await repo.query();
    expect(all.total).toBe(3);

    const byType = await repo.query({ fileType: 'APOSTAS' });
    expect(byType.total).toBe(2);

    const byStatus = await repo.query({ status: 'ACKED' });
    expect(byStatus.total).toBe(2);

    const paged = await repo.query({ limit: 1, offset: 0 });
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(3);
  });
});
