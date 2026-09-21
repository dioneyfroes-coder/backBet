import { MockPaymentAdapter } from '@/infrastructure/payments/MockPaymentAdapter';
import TestPaymentAdapter from '@/infrastructure/payments/TestPaymentAdapter';
import { Currency } from '@/core/finance/domain/value-objects/Currency';

// #4 — Tornar idempotência uma garantia do limite do PSP.
// Contrato: `same requestId + same payout = same external operation`.
// Repetir a chamada NUNCA pode criar outro payout externo.
describe('MockPaymentAdapter — contrato idempotente no limite do PSP (#4)', () => {
  it('payWithdrawal repetido para o MESMO requestId devolve o MESMO transactionId (1 payout externo)', async () => {
    const adapter = new MockPaymentAdapter({ attempts: 1, baseBackoffMs: 1, jitterMs: 0 });
    const currency = 'BRL' as Currency;

    const first = await adapter.payWithdrawal('wd-1', 'user-1', 100, currency);
    const second = await adapter.payWithdrawal('wd-1', 'user-1', 100, currency);
    const third = await adapter.payWithdrawal('wd-1', 'user-1', 50, currency);

    expect(first.success).toBe(true);
    expect(first.transactionId).toBeDefined();
    expect(second.success).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(third.transactionId).toBe(first.transactionId);
  });

  it('getWithdrawalStatus resolve a resposta perdida: PAID com a MESMA transação', async () => {
    const adapter = new MockPaymentAdapter({ attempts: 1, baseBackoffMs: 1, jitterMs: 0 });
    const currency = 'BRL' as Currency;

    const paid = await adapter.payWithdrawal('wd-2', 'user-1', 100, currency);
    const status = await adapter.getWithdrawalStatus('wd-2');

    expect(status.status).toBe('PAID');
    expect(status.transactionId).toBe(paid.transactionId);
  });

  it('payWithdrawal que NUNCA pagou pode ser ressumbitido — só o PAGO é curto-circuitado', async () => {
    const adapter = new MockPaymentAdapter({ attempts: 1, baseBackoffMs: 1, jitterMs: 0 });
    const currency = 'BRL' as Currency;

    adapter.simulateFailed('wd-3', 'payout_failed');

    const before = await adapter.getWithdrawalStatus('wd-3');
    expect(before.status).toBe('FAILED');

    const retried = await adapter.payWithdrawal('wd-3', 'user-1', 100, currency);
    expect(retried.success).toBe(true);
    expect(retried.transactionId).toBeDefined();

    const after = await adapter.getWithdrawalStatus('wd-3');
    expect(after.status).toBe('PAID');
    expect(after.transactionId).toBe(retried.transactionId);
  });
});

describe('TestPaymentAdapter — contrato idempotente no limite do PSP (#4)', () => {
  it('uma vez pago, o requestId devolve a MESMA transação sem consumir retry', async () => {
    const adapter = new TestPaymentAdapter(2);
    const currency = 'BRL' as Currency;

    const first = await adapter.payWithdrawal('req-retry', 'user-1', 100, currency);
    expect(first.success).toBe(false);
    const second = await adapter.payWithdrawal('req-retry', 'user-1', 100, currency);
    expect(second.success).toBe(false);
    const third = await adapter.payWithdrawal('req-retry', 'user-1', 100, currency);
    expect(third.success).toBe(true);

    const afterPaid = await adapter.payWithdrawal('req-retry', 'user-1', 100, currency);
    expect(afterPaid.transactionId).toBe(third.transactionId);
    // Replay pós-pagamento não incrementa a contagem global de tentativas.
    expect(adapter.attempts).toBe(3);
  });
});