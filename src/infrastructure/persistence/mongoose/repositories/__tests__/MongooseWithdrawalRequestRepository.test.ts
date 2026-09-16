import { MongooseWithdrawalRequestRepository } from '../MongooseWithdrawalRequestRepository';
import { WithdrawalRequestModel } from '../../schemas/WithdrawalRequestSchema';
import { WithdrawalRequest } from '@/core/finance/domain/entities/WithdrawalRequest';

const CREATED_DOC = {
  requestId: 'req-1',
  userId: 'user-a',
  amountCents: 10000,
  currency: 'BRL',
  status: 'REQUESTED',
  requestedAt: new Date(),
  processedAt: undefined,
  processingAt: undefined,
  notes: undefined,
  approvalLogs: [],
};

describe('MongooseWithdrawalRequestRepository (mocked model)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('create envia array como primeiro argumento (Mongoose exige array ao passar session)', async () => {
    const createSpy = jest
      .spyOn(WithdrawalRequestModel, 'create')
      .mockResolvedValue([CREATED_DOC] as never);
    const session = { id: 'sess-1' };

    const repo = new MongooseWithdrawalRequestRepository();
    const request = new WithdrawalRequest('req-1', 'user-a', 100, 'BRL');
    const result = await repo.create(request, { session: session as never });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [docs, options] = createSpy.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(Array.isArray(docs)).toBe(true);
    const doc = (docs as Record<string, unknown>[])[0];
    expect(doc.requestId).toBe('req-1');
    expect(doc.userId).toBe('user-a');
    expect(doc.amountCents).toBe(10000);
    expect(doc.currency).toBe('BRL');
    expect(options.session).toBe(session);
    expect(result.id).toBe('req-1');
  });

  it('create funciona sem session', async () => {
    const createSpy = jest
      .spyOn(WithdrawalRequestModel, 'create')
      .mockResolvedValue([CREATED_DOC] as never);

    const repo = new MongooseWithdrawalRequestRepository();
    const request = new WithdrawalRequest('req-1', 'user-a', 100, 'BRL');
    const result = await repo.create(request);

    const [docs, options] = createSpy.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(Array.isArray(docs)).toBe(true);
    expect(options.session).toBeUndefined();
    expect(result.id).toBe('req-1');
  });
});
