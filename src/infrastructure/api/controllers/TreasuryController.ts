import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { GetTreasurySummary } from '@/core/treasury/application/use-cases/GetTreasurySummary';
import { GetTreasuryLedger } from '@/core/treasury/application/use-cases/GetTreasuryLedger';
import { RecordTreasuryProfit } from '@/core/treasury/application/use-cases/RecordTreasuryProfit';
import { TransferProfitToPrize } from '@/core/treasury/application/use-cases/TransferProfitToPrize';
import { TransferPrizeToProfit } from '@/core/treasury/application/use-cases/TransferPrizeToProfit';
import { RebalanceTreasury } from '@/core/treasury/application/use-cases/RebalanceTreasury';
import { ReconcileTreasury } from '@/core/treasury/application/use-cases/ReconcileTreasury';
import { TreasuryAmountDTO, TreasuryRebalanceDTO } from '../dtos/TreasuryDTOs';
import { TreasuryLedgerMetadata } from '@/core/treasury/domain/entities/TreasuryLedgerEntry';
import { appConfig } from '@/shared/config/appConfig';

export class TreasuryController extends BaseController {
  constructor(
    private readonly getSummaryUseCase: GetTreasurySummary,
    private readonly getLedgerUseCase: GetTreasuryLedger,
    private readonly recordProfitUseCase: RecordTreasuryProfit,
    private readonly transferProfitToPrizeUseCase: TransferProfitToPrize,
    private readonly transferPrizeToProfitUseCase: TransferPrizeToProfit,
    private readonly reconcileUseCase: ReconcileTreasury,
    private readonly rebalanceUseCase: RebalanceTreasury,
  ) {
    super();
  }

  async getSummary(_req: Request, res: Response) {
    const summary = await this.getSummaryUseCase.execute();
    return this.ok(res, {
      summary,
      config: appConfig.treasury,
    });
  }

  async getLedger(req: Request, res: Response) {
    const limit = Math.max(1, Number(req.query.limit ?? 20));
    const ledger = await this.getLedgerUseCase.execute(limit);
    return this.ok(res, {
      ledger,
      pagination: { limit },
    });
  }

  async recordProfit(req: Request, res: Response) {
    const payload = this.validateSchema(TreasuryAmountDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const amountCents = Math.round(payload.amount * 100);
    const snapshot = await this.recordProfitUseCase.execute(
      amountCents,
      payload.description,
      this.metadataFromPayload(payload),
    );

    return this.ok(res, {
      message: 'Lucro registrado na tesouraria',
      summary: snapshot,
    });
  }

  async transferProfitToPrize(req: Request, res: Response) {
    const payload = this.validateSchema(TreasuryAmountDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const amountCents = Math.round(payload.amount * 100);
    const summary = await this.transferProfitToPrizeUseCase.execute(
      amountCents,
      payload.description,
      this.metadataFromPayload({ ...payload, source: 'manual-topup' }),
    );

    return this.ok(res, {
      message: 'Reserva de prêmios reforçada',
      summary,
    });
  }

  async transferPrizeToProfit(req: Request, res: Response) {
    const payload = this.validateSchema(TreasuryAmountDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    const amountCents = Math.round(payload.amount * 100);
    const summary = await this.transferPrizeToProfitUseCase.execute(
      amountCents,
      payload.description,
      this.metadataFromPayload({ ...payload, source: 'manual-release' }),
    );

    return this.ok(res, {
      message: 'Valor movido para lucro',
      summary,
    });
  }

  async reconcile(_req: Request, res: Response) {
    const reconciliation = await this.reconcileUseCase.execute();
    return this.ok(res, { reconciliation });
  }

  async rebalance(req: Request, res: Response) {
    const payload = this.validateSchema(TreasuryRebalanceDTO, req.body) ?? {};
    const config = appConfig.treasury;
    const ratioRange = config.prizeRatioRange ?? { min: 0.01, max: 0.99 };
    const requestedRatio =
      typeof payload.targetPrizeRatio === 'number'
        ? payload.targetPrizeRatio
        : config.targetPrizeRatio;
    const targetPrizeRatio = Math.min(ratioRange.max, Math.max(ratioRange.min, requestedRatio));
    const minProfitBufferCents = Math.round((payload.minProfitBuffer ?? config.minProfitBuffer) * 100);
    const maxTransferCents = payload.maxTransfer ? Math.round(payload.maxTransfer * 100) : config.maxTransferPerRun ? Math.round(config.maxTransferPerRun * 100) : undefined;
    const { snapshot, result } = await this.rebalanceUseCase.execute({
      targetPrizeRatio,
      minProfitBufferCents,
      maxTransferCents,
    });

    return this.ok(res, {
      result,
      summary: snapshot,
    });
  }

  private metadataFromPayload(
    payload: Partial<{ referenceId?: string; actorId?: string; source?: string }>,
  ): TreasuryLedgerMetadata {
    const metadata: TreasuryLedgerMetadata = {
      source: payload.source ?? 'manual',
    };
    if (payload.referenceId) {
      metadata.referenceId = payload.referenceId;
    }
    if (payload.actorId) {
      metadata.actorId = payload.actorId;
    }
    return metadata;
  }
}
