import {
  JobStateMachine,
  jobStateForWithdrawalStatus,
  JOB_STATE_RULES,
  TERMINAL_JOB_STATES,
} from '../JobStateMachine';
import { AppError } from '@/shared/errors/AppError';

describe('JobStateMachine (Fase 7)', () => {
  it('começa em PENDING por padrão e não é terminal', () => {
    const job = new JobStateMachine();
    expect(job.state).toBe('PENDING');
    expect(job.isTerminal).toBe(false);
  });

  it('transita PENDING -> PROCESSING -> COMPLETED', () => {
    const job = new JobStateMachine('PENDING');
    expect(job.transitionTo('PROCESSING').state).toBe('PROCESSING');
    expect(job.transitionTo('COMPLETED').state).toBe('COMPLETED');
    expect(job.isTerminal).toBe(true);
  });

  it('permite PROCESSING -> RETRY -> PROCESSING e PROCESSING -> FAILED', () => {
    const job = new JobStateMachine('PROCESSING');
    expect(job.transitionTo('RETRY').state).toBe('RETRY');
    expect(job.transitionTo('PROCESSING').state).toBe('PROCESSING');
    expect(job.transitionTo('FAILED').state).toBe('FAILED');
    expect(job.isTerminal).toBe(true);
  });

  it('rejeita transições inválidas (terminal -> algo)', () => {
    const job = new JobStateMachine('COMPLETED');
    expect(() => job.transitionTo('RETRY')).toThrow(AppError);
  });

  it('rejeita transição que não existe (PENDING -> COMPLETED direto)', () => {
    const job = new JobStateMachine('PENDING');
    expect(job.canTransitionTo('COMPLETED')).toBe(false);
  });

  it('cada estado define todas as capacidades da Fase 7', () => {
    for (const state of ['PENDING', 'PROCESSING', 'COMPLETED', 'RETRY', 'FAILED'] as const) {
      const rules = JOB_STATE_RULES[state];
      expect(rules).toEqual({
        canProcess: expect.any(Boolean),
        canRepeat: expect.any(Boolean),
        canRevert: expect.any(Boolean),
        canReceiveWebhook: expect.any(Boolean),
        canGenerateLedger: expect.any(Boolean),
        canGeneratePayment: expect.any(Boolean),
      });
    }
  });

  it('a matriz expõe os acessores por estado', () => {
    const pending = new JobStateMachine('PENDING');
    expect(pending.canProcess()).toBe(true);
    expect(pending.canRepeat()).toBe(false);
    expect(pending.canRevert()).toBe(false);
    expect(pending.canReceiveWebhook()).toBe(false);
    expect(pending.canGenerateLedger()).toBe(false);
    expect(pending.canGeneratePayment()).toBe(false);

    const processing = new JobStateMachine('PROCESSING');
    expect(processing.canReceiveWebhook()).toBe(true);
    expect(processing.canGeneratePayment()).toBe(true);

    const completed = new JobStateMachine('COMPLETED');
    expect(completed.canRevert()).toBe(true);
  });

  it('mapeia o status do WithdrawalRequest para o estado do job', () => {
    expect(jobStateForWithdrawalStatus('REQUESTED')).toBe('PENDING');
    expect(jobStateForWithdrawalStatus('VALIDATING')).toBe('PENDING');
    expect(jobStateForWithdrawalStatus('APPROVED')).toBe('PENDING');
    expect(jobStateForWithdrawalStatus('PROCESSING')).toBe('PROCESSING');
    expect(jobStateForWithdrawalStatus('COMPLETED')).toBe('COMPLETED');
    expect(jobStateForWithdrawalStatus('REJECTED')).toBe('FAILED');
    expect(jobStateForWithdrawalStatus('CANCELED')).toBe('FAILED');
    expect(jobStateForWithdrawalStatus('FAILED')).toBe('FAILED');
    expect(jobStateForWithdrawalStatus('REVERSED')).toBe('FAILED');
    expect(TERMINAL_JOB_STATES.has('COMPLETED')).toBe(true);
    expect(TERMINAL_JOB_STATES.has('FAILED')).toBe(true);
  });

  it('padrão de uso na recovery: APPROVED (PENDING) é processável e re-enfileirável', () => {
    const job = new JobStateMachine(jobStateForWithdrawalStatus('APPROVED'));
    expect(job.canProcess()).toBe(true);
    // PENDING não pode gerar pagamento: a recovery consulta o PSP / re-enfileira, nunca paga.
    expect(job.canGeneratePayment()).toBe(false);
  });
});