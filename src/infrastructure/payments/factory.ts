import MockPaymentAdapter from './MockPaymentAdapter';

export function createPaymentAdapter() {
  // Configure from env if needed in future
  return new MockPaymentAdapter({ attempts: 4, baseBackoffMs: 400, jitterMs: 300 });
}

export default createPaymentAdapter;
