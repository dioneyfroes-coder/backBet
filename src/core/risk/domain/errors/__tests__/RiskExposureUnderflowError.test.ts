import { DomainError } from '@/core/shared/domain/errors/DomainError';
import {
  RISK_EXPOSURE_UNDERFLOW,
  RiskExposureUnderflowError,
  isRiskExposureUnderflow,
} from '../RiskExposureUnderflowError';

describe('RiskExposureUnderflowError', () => {
  it('monta code/message/details e o nome da classe', () => {
    const err = new RiskExposureUnderflowError({
      scope: 'USER',
      refId: 'user-1',
      requestedCents: 500,
      currentCents: 200,
    });

    expect(err.code).toBe(RISK_EXPOSURE_UNDERFLOW);
    expect(err.message).toBe(
      'Exposição insuficiente para redução: atual=200, solicitado=500',
    );
    expect(err.name).toBe('RiskExposureUnderflowError');
    expect(err.details).toEqual({
      scope: 'USER',
      refId: 'user-1',
      requestedCents: 500,
      currentCents: 200,
    });
    expect(err).toBeInstanceOf(DomainError);
  });

  it('isRiskExposureUnderflow verdadeiro para a instância da classe', () => {
    const err = new RiskExposureUnderflowError({
      scope: 'EVENT',
      refId: 'event-1',
      requestedCents: 1,
      currentCents: 0,
      recordExists: false,
    });
    expect(isRiskExposureUnderflow(err)).toBe(true);
  });

  it('isRiskExposureUnderflow verdadeiro para DomainError genérico com mesmo code', () => {
    const err = new DomainError({ code: RISK_EXPOSURE_UNDERFLOW, message: 'x' });
    expect(isRiskExposureUnderflow(err)).toBe(true);
  });

  it('isRiskExposureUnderflow falso para erro comum', () => {
    expect(isRiskExposureUnderflow(new Error('boom'))).toBe(false);
    expect(isRiskExposureUnderflow(undefined)).toBe(false);
  });

  it('isRiskExposureUnderflow falso para DomainError de outro code', () => {
    const err = new DomainError({ code: 'OTHER_CODE', message: 'x' });
    expect(isRiskExposureUnderflow(err)).toBe(false);
  });
});