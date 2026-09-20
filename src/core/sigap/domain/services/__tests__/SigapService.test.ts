import { SigapService } from '../SigapService';
import { InMemorySigapSubmissionRepository } from '../../repositories/InMemorySigapSubmissionRepository';
import {
  ISigapTransmissionPort,
  SigapTransmissionInput,
} from '../../ports/ISigapTransmissionPort';
import { ISigapImpedimentPort } from '../../ports/ISigapImpedimentPort';
import { appConfig } from '@/shared/config/appConfig';
import { Bet } from '@/core/betting/domain/entities/Bet';
import { Money } from '@/core/shared/domain/value-objects/Money';
import { Odds } from '@/core/odds/domain/value-objects/Odds';

class FakeTransmissionProvider implements ISigapTransmissionPort {
  public calls: SigapTransmissionInput[] = [];
  public failNext = false;
  public rejectNext: { code?: string; reason?: string } | undefined;

  async transmit(input: SigapTransmissionInput) {
    this.calls.push(input);
    if (this.failNext) {
      this.failNext = false;
      throw new Error('falha simulada');
    }
    const rejection = this.rejectNext;
    this.rejectNext = undefined;
    if (rejection) {
      return {
        status: 'REJECTED' as const,
        rejectionCode: rejection.code ?? 'SIGAP_REJECTED',
        rejectionReason: rejection.reason ?? 'rejeitado pela SPA',
        receivedAt: new Date(),
      };
    }
    return { status: 'ACKED' as const, ackId: `ack-${input.fileType}-${input.referenceDate}`, receivedAt: new Date() };
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

  it('marca a submissÃ£o como REJECTED quando a SPA rejeita o arquivo', async () => {
    provider.rejectNext = { code: 'SIGAP_SCHEMA_INVALID', reason: 'formato divergente' };
    const submission = await service.transmitFile({
      fileType: 'CARTEIRA',
      referenceDate: '2026-08-28',
      payload: [{ idApostador: 'u-1' }],
    });
    expect(submission.status).toBe('REJECTED');
    expect(submission.errorCode).toBe('SIGAP_SCHEMA_INVALID');
    expect(submission.errorMessage).toBe('formato divergente');
    expect(provider.calls).toHaveLength(1);
  });

  it('nÃ£o reenvia alÃ©m do teto de retry (retryMaxAttempts)', async () => {
    const retryService = new SigapService({
      submissionRepository: repo,
      transmissionProvider: provider,
      retryMaxAttempts: 2,
    });
    await retryService.transmitFile({
      fileType: 'OPERADOR_MENSAL',
      referenceDate: '2026-08-28',
      payload: [{ total: 1 }],
    });
    const second = await retryService.transmitFile({
      fileType: 'OPERADOR_MENSAL',
      referenceDate: '2026-08-28',
      payload: [{ total: 1 }],
    });
    expect(second.attemptCount).toBe(2);
    expect(second.status).toBe('ACKED');
    expect(provider.calls).toHaveLength(2);

    const third = await retryService.transmitFile({
      fileType: 'OPERADOR_MENSAL',
      referenceDate: '2026-08-28',
      payload: [{ total: 1 }],
    });
    expect(third.attemptCount).toBe(2);
    expect(third.status).toBe('FAILED');
    expect(third.errorCode).toBe('SIGAP_RETRY_LIMIT_EXCEEDED');
    expect(provider.calls).toHaveLength(2);
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

  it('checkImpediment retorna IMPEDED/NOT_IMPEDED conforme o provedor', async () => {
    const previous = appConfig.sigap.enabled;
    appConfig.sigap.enabled = true;
    try {
      const impedimentProvider: ISigapImpedimentPort = {
        async checkImpediment(documentNumber: string) {
          const digits = documentNumber.replace(/\D/g, '');
          return {
            status: digits === '11144477735' ? 'IMPEDED' : 'NOT_IMPEDED',
            reference: `sigap-${digits}`,
          };
        },
      };
      const svc = new SigapService({
        submissionRepository: repo,
        transmissionProvider: provider,
        impedimentProvider,
      });
      const impeded = await svc.checkImpediment('111.444.777-35');
      expect(impeded.status).toBe('IMPEDED');
      const notImpeded = await svc.checkImpediment('52998224725');
      expect(notImpeded.status).toBe('NOT_IMPEDED');
    } finally {
      appConfig.sigap.enabled = previous;
    }
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

