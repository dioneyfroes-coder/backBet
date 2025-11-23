import { WithdrawalRequest } from '../WithdrawalRequest';
import { AppError } from '@/shared/errors/AppError';

describe('WithdrawalRequest entity', () => {
  const buildRequest = (amount = 50) => new WithdrawalRequest('req-1', 'user-1', amount, 'BRL');

  it('tracks approval logs, prevents re-processing, and exposes DTO', () => {
    const request = buildRequest();

    request.approve('admin-1', 'ok');
    expect(request.status).toBe('APPROVED');
    expect(request.approvalLogs).toHaveLength(1);

    expect(() => request.reject('admin-1')).toThrow(AppError);

    const dto = request.toDTO();
    expect(dto).toMatchObject({ id: 'req-1', status: 'APPROVED', approvalLogs: request.approvalLogs });
  });

  it('rejects invalid amounts', () => {
    expect(() => buildRequest(0)).toThrow('Amount must be positive');
    expect(() => buildRequest(-5)).toThrow(AppError);
  });

  it('handles rejection workflow separately from approvals', () => {
    const request = buildRequest();
    request.reject('admin-2', 'not allowed');

    expect(request.status).toBe('REJECTED');
    expect(request.processedAt).toBeInstanceOf(Date);
    expect(request.approvalLogs[0]).toMatchObject({ action: 'REJECTED', notes: 'not allowed' });
  });
});
