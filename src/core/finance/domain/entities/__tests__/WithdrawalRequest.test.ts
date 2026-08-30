import { WithdrawalRequest } from '../WithdrawalRequest';
import { AppError } from '@/shared/errors/AppError';

describe('WithdrawalRequest entity', () => {
  const buildRequest = (amount = 50) => new WithdrawalRequest('req-1', 'user-1', amount, 'BRL');

  it('starts in REQUESTED status', () => {
    expect(buildRequest().status).toBe('REQUESTED');
    expect(buildRequest().isTerminal).toBe(false);
  });

  it('tracks the full lifecycle REQUESTED -> PROCESSING -> COMPLETED', () => {
    const request = buildRequest();

    request.validateBy('admin-1');
    expect(request.status).toBe('VALIDATING');

    request.approve('admin-1', 'ok');
    expect(request.status).toBe('APPROVED');
    expect(request.approvalLogs).toHaveLength(1);

    request.markProcessing();
    expect(request.status).toBe('PROCESSING');
    expect(request.isTerminal).toBe(false);

    request.completePayout();
    expect(request.status).toBe('COMPLETED');
    expect(request.isTerminal).toBe(true);
  });

  it('goes VALIDATING -> REJECTED on rejection', () => {
    const request = buildRequest();
    request.validateBy('admin-2');
    request.reject('admin-2', 'not allowed');

    expect(request.status).toBe('REJECTED');
    expect(request.processedAt).toBeInstanceOf(Date);
    expect(request.approvalLogs[0]).toMatchObject({ action: 'REJECTED', notes: 'not allowed' });
    expect(request.isTerminal).toBe(true);
  });

  it('marks PROCESSING -> FAILED on payout failure', () => {
    const request = buildRequest();
    request.validateBy('admin');
    request.approve('admin');
    request.markProcessing();
    request.failPayout();

    expect(request.status).toBe('FAILED');
    expect(request.isTerminal).toBe(true);
  });

  it('can be CANCELED from REQUESTED or VALIDATING', () => {
    const requested = buildRequest();
    requested.cancel();
    expect(requested.status).toBe('CANCELED');
    expect(requested.isTerminal).toBe(true);

    const validating = buildRequest();
    validating.validateBy('admin');
    validating.cancel();
    expect(validating.status).toBe('CANCELED');
  });

  it('can be REVERSED from PROCESSING or COMPLETED', () => {
    const processing = buildRequest();
    processing.validateBy('admin');
    processing.approve('admin');
    processing.markProcessing();
    processing.reverse();
    expect(processing.status).toBe('REVERSED');
  });

  it('rejects invalid transitions', () => {
    const request = buildRequest();
    expect(() => request.approve('admin-1')).toThrow(AppError);
    expect(() => request.completePayout()).toThrow(AppError);
  });

  it('prevents re-processing after a terminal state', () => {
    const request = buildRequest();
    request.validateBy('admin');
    request.approve('admin');
    request.markProcessing();
    request.completePayout();

    expect(() => request.markProcessing()).toThrow(AppError);
    expect(() => request.approve('admin')).toThrow(AppError);
  });

  it('rejects invalid amounts', () => {
    expect(() => buildRequest(0)).toThrow('Amount must be positive');
    expect(() => buildRequest(-5)).toThrow(AppError);
  });

  it('rejects amounts with more than 2 decimal places', () => {
    expect(() => buildRequest(0.299)).toThrow('at most 2 decimal places');
    expect(() => buildRequest(100.45)).not.toThrow();
    expect(() => buildRequest(10.5)).not.toThrow();
  });

  it('exposes a DTO reflecting the current status', () => {
    const request = buildRequest();
    request.validateBy('admin');
    request.approve('admin');

    const dto = request.toDTO();
    expect(dto).toMatchObject({
      id: 'req-1',
      status: 'APPROVED',
      approvalLogs: request.approvalLogs,
    });
  });
});
