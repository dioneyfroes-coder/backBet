import { AppError } from '@/shared/errors/AppError';
import type { WithdrawalStatus } from './WithdrawalRequest';

export type JobState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'RETRY' | 'FAILED';

/**
 * Mapeia o status persistido de um WithdrawalRequest para o estado do job de
 * payout. O status do job (queue) e o status da entidade evoluem juntos:
 *  - REQUESTED/VALIDATING/APPROVED -> PENDING (job da fila ainda não processado);
 *  - PROCESSING                    -> PROCESSING;
 *  - COMPLETED                     -> COMPLETED;
 *  - REJECTED/CANCELED/FAILED/REVERSED -> FAILED (terminal).
 */
export function jobStateForWithdrawalStatus(status: WithdrawalStatus): JobState {
  switch (status) {
    case 'REQUESTED':
    case 'VALIDATING':
    case 'APPROVED':
      return 'PENDING';
    case 'PROCESSING':
      return 'PROCESSING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'REJECTED':
    case 'CANCELED':
    case 'FAILED':
    case 'REVERSED':
      return 'FAILED';
  }
}

/**
 * Regras que cada estado deve responder (Fase 7 — Workers):
 *  - canProcess:       pode ser processado agora?
 *  - canRepeat:        pode ser repetido/retry?
 *  - canRevert:        pode voltar (compensação/reversão)?
 *  - canReceiveWebhook pode receber webhook de status?
 *  - canGenerateLedger pode gerar lançamento de ledger?
 *  - canGeneratePayment pode gerar pagamento?
 */
export interface JobStateRules {
  canProcess: boolean;
  canRepeat: boolean;
  canRevert: boolean;
  canReceiveWebhook: boolean;
  canGenerateLedger: boolean;
  canGeneratePayment: boolean;
}

export const JOB_STATE_RULES: Readonly<Record<JobState, JobStateRules>> = {
  PENDING: {
    canProcess: true,
    canRepeat: false,
    canRevert: false,
    canReceiveWebhook: false,
    canGenerateLedger: false,
    canGeneratePayment: false,
  },
  PROCESSING: {
    canProcess: false,
    canRepeat: true,
    canRevert: false,
    canReceiveWebhook: true,
    canGenerateLedger: true,
    canGeneratePayment: true,
  },
  RETRY: {
    canProcess: true,
    canRepeat: true,
    canRevert: false,
    canReceiveWebhook: false,
    canGenerateLedger: false,
    canGeneratePayment: false,
  },
  COMPLETED: {
    canProcess: false,
    canRepeat: false,
    canRevert: true,
    canReceiveWebhook: false,
    canGenerateLedger: true,
    canGeneratePayment: false,
  },
  FAILED: {
    canProcess: false,
    canRepeat: false,
    canRevert: true,
    canReceiveWebhook: false,
    canGenerateLedger: true,
    canGeneratePayment: false,
  },
};

export const JOB_STATE_ALLOWED_TRANSITIONS: Readonly<Record<JobState, readonly JobState[]>> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'RETRY', 'FAILED'],
  RETRY: ['PROCESSING', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export const TERMINAL_JOB_STATES: ReadonlySet<JobState> = new Set<JobState>([
  'COMPLETED',
  'FAILED',
]);

export class JobStateMachine {
  private _state: JobState;

  constructor(initialState: JobState = 'PENDING') {
    this._state = initialState;
  }

  get state(): JobState {
    return this._state;
  }

  get rules(): JobStateRules {
    return JOB_STATE_RULES[this._state];
  }

  get isTerminal(): boolean {
    return TERMINAL_JOB_STATES.has(this._state);
  }

  canProcess(): boolean {
    return this.rules.canProcess;
  }

  canRepeat(): boolean {
    return this.rules.canRepeat;
  }

  canRevert(): boolean {
    return this.rules.canRevert;
  }

  canReceiveWebhook(): boolean {
    return this.rules.canReceiveWebhook;
  }

  canGenerateLedger(): boolean {
    return this.rules.canGenerateLedger;
  }

  canGeneratePayment(): boolean {
    return this.rules.canGeneratePayment;
  }

  canTransitionTo(next: JobState): boolean {
    return JOB_STATE_ALLOWED_TRANSITIONS[this._state].includes(next);
  }

  transitionTo(next: JobState): this {
    if (!this.canTransitionTo(next)) {
      throw new AppError(
        'CONFLICT',
        `Invalid job state transition: ${this._state} -> ${next}`,
        409,
      );
    }
    this._state = next;
    return this;
  }
}