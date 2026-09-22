import { TransferProfitToPrize } from '../TransferProfitToPrize';
import { TransferPrizeToProfit } from '../TransferPrizeToProfit';
import { HouseTreasuryService } from '@/core/treasury/domain/services/HouseTreasuryService';

const moveProfitToPrizeReserve = jest.fn();
const movePrizeReserveToProfit = jest.fn();

const treasuryService = {
  moveProfitToPrizeReserve,
  movePrizeReserveToProfit,
} as unknown as HouseTreasuryService;

beforeEach(() => {
  moveProfitToPrizeReserve.mockReset();
  movePrizeReserveToProfit.mockReset();
});

describe('TransferProfitToPrize', () => {
  it('sem idempotência → transação direta no serviço', async () => {
    moveProfitToPrizeReserve.mockResolvedValue({ moved: 100 });
    const useCase = new TransferProfitToPrize(treasuryService);

    const result = await useCase.execute(100, 'rundown', { reason: 'rebalance' });

    expect(moveProfitToPrizeReserve).toHaveBeenCalledWith(100, 'rundown', { reason: 'rebalance' });
    expect(result).toEqual({ moved: 100 });
  });

  it('com idempotência mas sem chave → direto, sem tocar no idempotency', async () => {
    moveProfitToPrizeReserve.mockResolvedValue({ moved: 50 });
    const idempotency = { execute: jest.fn() } as any;
    const useCase = new TransferProfitToPrize(treasuryService, idempotency);

    await useCase.execute(50);

    expect(idempotency.execute).not.toHaveBeenCalled();
    expect(moveProfitToPrizeReserve).toHaveBeenCalledWith(50, undefined, undefined);
  });

  it('com idempotência e chave → executa via idempotency.execute', async () => {
    moveProfitToPrizeReserve.mockResolvedValue({ moved: 10 });
    const execute = jest.fn(async (_key: string, _fp: string, op: () => unknown) => op());
    const idempotency = { execute } as any;
    const useCase = new TransferProfitToPrize(treasuryService, idempotency);

    const result = await useCase.execute(10, undefined, undefined, 'k-profit-to-prize');

    expect(execute).toHaveBeenCalledWith(
      'treasury:profit-to-prize:k-profit-to-prize',
      expect.any(String),
      expect.any(Function),
      undefined,
      expect.any(Number),
    );
    expect(moveProfitToPrizeReserve).toHaveBeenCalledWith(10, undefined, undefined);
    expect(result).toEqual({ moved: 10 });
  });
});

describe('TransferPrizeToProfit', () => {
  it('sem idempotência → transação direta no serviço', async () => {
    movePrizeReserveToProfit.mockResolvedValue({ moved: 100 });
    const useCase = new TransferPrizeToProfit(treasuryService);

    const result = await useCase.execute(100, 'prize top-up', { reason: 'rebalance' });

    expect(movePrizeReserveToProfit).toHaveBeenCalledWith(100, 'prize top-up', {
      reason: 'rebalance',
    });
    expect(result).toEqual({ moved: 100 });
  });

  it('com idempotência e chave → executa via idempotency.execute', async () => {
    movePrizeReserveToProfit.mockResolvedValue({ moved: 200 });
    const execute = jest.fn(async (_key: string, _fp: string, op: () => unknown) => op());
    const idempotency = { execute } as any;
    const useCase = new TransferPrizeToProfit(treasuryService, idempotency);

    const result = await useCase.execute(200, undefined, undefined, 'k-prize-to-profit');

    expect(execute).toHaveBeenCalledWith(
      'treasury:prize-to-profit:k-prize-to-profit',
      expect.any(String),
      expect.any(Function),
      undefined,
      expect.any(Number),
    );
    expect(movePrizeReserveToProfit).toHaveBeenCalledWith(200, undefined, undefined);
    expect(result).toEqual({ moved: 200 });
  });
});