import { SigapService } from '../SigapService';
import { InMemorySigapSubmissionRepository } from '../../repositories/InMemorySigapSubmissionRepository';
import {
  ISigapTransmissionPort,
  SigapTransmissionInput,
} from '../../ports/ISigapTransmissionPort';
import { appConfig } from '@/shared/config/appConfig';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';

class FakeTransmissionProvider implements ISigapTransmissionPort {
  public calls: SigapTransmissionInput[] = [];
  public failNext = false;

  async transmit(input: SigapTransmissionInput) {
    this.calls.push(input);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('falha simulada');
    }
    return { ackId: `ack-${input.fileType}-${input.referenceDate}`, receivedAt: new Date() };
  }
}

describe('SigapService', () => {
  let repo: InMemorySigapSubmissionRepository;
  let provider: FakeTransmissionProvider;
  let service: SigapService;

  beforeEach(() => {
    repo = new InMemorySigapSubmissionRepository();
    provider = new FakeTransmissionProvider();
    service = new SigapService({
      submissionRepository: repo,
      transmissionProvider: provider,
    });
  });

  it('transmite um arquivo e grava a submissÃ£o como ACKED', async () => {
    const submission = await service.transmitFile({
      fileType: 'OPERADOR_DIARIO',
      referenceDate: '2026-08-28',
      payload: [{ totalApostas: 5 }],
    });
    expect(submission.status).toBe('ACKED');
    expect(submission.ackId).toContain('OPERADOR_DIARIO');
    expect(provider.calls).toHaveLength(1);
  });

  it('Ã© idempotente por (operatorId, fileType, referenceDate): reutiliza e incrementa tentativas', async () => {
    await service.transmitFile({
      fileType: 'APOSTADOR',
      referenceDate: '2026-08-28',
      payload: [{ idApostador: 'u-1' }],
    });
    const second = await service.transmitFile({
      fileType: 'APOSTADOR',
      referenceDate: '2026-08-28',
      payload: [{ idApostador: 'u-1' }],
    });
    expect(second.attemptCount).toBe(2);
    expect(repo.size).toBe(1);
  });

  it('marca a submissÃ£o como FAILED quando o provedor falha', async () => {
    provider.failNext = true;
    const submission = await service.transmitFile({
      fileType: 'CARTEIRA',
      referenceDate: '2026-08-28',
      payload: [{ idApostador: 'u-1' }],
    });
    expect(submission.status).toBe('FAILED');
    expect(submission.errorCode).toBe('SIGAP_TRANSMISSION_FAILED');
  });

  it('usa operatorId de appConfig quando nÃ£o informado', async () => {
    appConfig.sigap.operatorId = 'op-config';
    const submission = await service.transmitFile({
      fileType: 'APOSTADOR',
      referenceDate: '2026-08-28',
      payload: [{ idApostador: 'u-1' }],
    });
    expect(submission.operatorId).toBe('op-config');
  });

  it('consulta submissÃµes e busca por id', async () => {
    await service.transmitFile({
      fileType: 'APOSTADOR',
      referenceDate: '2026-08-28',
      payload: [{ idApostador: 'u-1' }],
    });
    const result = await service.getSubmissions({ fileType: 'APOSTADOR' });
    expect(result.total).toBe(1);
    const byId = await service.getSubmissionById(result.items[0].id);
    expect(byId?.fileType).toBe('APOSTADOR');
  });

  it('checkImpediment retorna UNKNOWN quando provider nÃ£o configurado', async () => {
    const svc = new SigapService({ submissionRepository: repo, transmissionProvider: provider });
    const result = await svc.checkImpediment('11144477735');
    expect(result.status).toBe('UNKNOWN');
  });

  it('buildDailyAggregate agrega apostas por dia', async () => {
    const bet = new Bet(
      'b1',
      'u-1',
      'evt-1',
      'mkt-1',
      Money.fromCents(1000, 'BRL'),
      new Odds(2),
      'PENDING',
      'SINGLE',
      new Date('2026-08-28T12:00:00Z'),
    );
    const agg = await service.buildDailyAggregate('2026-08-28', [bet, bet]);
    expect(agg.totalBets).toBe(2);
    expect(agg.totalBettors).toBe(1);
    expect(agg.totalBetAmountCents).toBe(2000);
  });
});

