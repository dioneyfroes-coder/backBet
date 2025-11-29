import { RiskService } from '@/core/risk/domain/services/RiskService';
import { AssessBetRisk } from '@/core/risk/application/use-cases/AssessBetRisk';

describe('AssessBetRisk use-case', () => {
  it('allows a bet under limits', async () => {
    const rs = new RiskService();
    const uc = new AssessBetRisk(rs);
    const res = await uc.execute({ userId: 'u1', stake: 10, oddsValue: 2 });
    expect(res.decision).toBe('ALLOW');
  });

  it('rejects a bet that exceeds single stake limit', async () => {
    const rs = new RiskService();
    const uc = new AssessBetRisk(rs);
    // temporarily monkeypatch config via direct call: use a very small MAX_SINGLE_STAKE by placing a huge stake
    const res = await uc.execute({ userId: 'u1', stake: 9999999, oddsValue: 2 });
    expect(res.decision).toBe('REJECT');
  });
});
