import { SigapTransmissionJob } from '../SigapTransmissionJob';
import { SigapService } from '@/core/sigap/domain/services/SigapService';
import { InMemorySigapSubmissionRepository } from '@/core/sigap/domain/repositories/InMemorySigapSubmissionRepository';
import { ISigapTransmissionPort } from '@/core/sigap/domain/ports/ISigapTransmissionPort';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';

class FakeTransmissionProvider implements ISigapTransmissionPort {
  async transmit(input: { fileType: string }) {
    return { ackId: `ack-${input.fileType}`, receivedAt: new Date() };
  }
}

describe('SigapTransmissionJob', () => {
  let repo: InMemorySigapSubmissionRepository;
  let service: SigapService;
  let job: SigapTransmissionJob;

  beforeEach(() => {
    repo = new InMemorySigapSubmissionRepository();
    service = new SigapService({
      submissionRepository: repo,
      transmissionProvider: new FakeTransmissionProvider(),
    });
    job = new SigapTransmissionJob(service, {
      intervalMs: 10_000,
      collectBets: () =>
        Promise.resolve([
          new Bet(
            'b1',
            'u-1',
            'evt-1',
            'mkt-1',
            Money.fromCents(1000, 'BRL'),
            new Odds(2),
            'PENDING',
            'SINGLE',
            new Date('2026-08-28T12:00:00Z'),
          ),
        ]),
    });
  });

  afterEach(() => {
    job.stop();
  });

  it('transmite o agregado OPERADOR_DIARIO e grava ACKED', async () => {
    await job.transmitDailyAggregate('2026-08-28');
    const result = await repo.query({ fileType: 'OPERADOR_DIARIO' });
    expect(result.total).toBe(1);
    expect(result.items[0].status).toBe('ACKED');
    expect(result.items[0].ackId).toContain('OPERADOR_DIARIO');
  });

  it('registra agregado com contagem de apostas', async () => {
    await job.transmitDailyAggregate('2026-08-28');
    const result = await repo.query({ fileType: 'OPERADOR_DIARIO' });
    expect(result.items[0].payloadSummary?.records).toBe(1);
  });

  it('start/stop nÃ£o lanÃ§am e sÃ£o idempotentes', () => {
    job.start();
    job.start();
    job.stop();
    job.stop();
    expect(true).toBe(true);
  });
});

