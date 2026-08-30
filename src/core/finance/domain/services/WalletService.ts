import { TransactionContext, Wallet } from '../entities/Wallet';
import { LedgerEntry, LedgerOperationType, LedgerStatus } from '../entities/LedgerEntry';
import { IWalletRepository } from '../repositories/IWalletRepository';
import { ILedgerRepository } from '../repositories/ILedgerRepository';
import { ICreateWalletDTO } from '../../types/wallet.types';
import { Currency, CurrencyValueObject } from '../value-objects/Currency';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { writeStructuredLog } from '@/shared/logging/structuredLogger';
import { WalletRepositoryOptions } from '../repositories/IWalletRepository';
import { randomUUID } from 'crypto';
import { depositsCounter, withdrawalsCounter } from '@/infrastructure/observability/metrics';

export class WalletService {
  constructor(
    private walletRepository: IWalletRepository,
    private ledgerRepository?: ILedgerRepository,
  ) {}

  /**
   * Executa a operação financeira como uma unidade atômica: quando nenhuma
   * sessão foi fornecida pelo chamador e o repository suporta transações
   * Mongo, a mutação da Wallet e a entrada do Ledger rodam na MESMA transação.
   * Se alguma etapa falhar (inclusive appendLedger), tudo é revertido.
   */
  private async run<T>(
    work: (options?: WalletRepositoryOptions) => Promise<T>,
    givenOptions?: WalletRepositoryOptions,
  ): Promise<T> {
    if (givenOptions) return work(givenOptions);
    if (this.walletRepository.withTransaction) {
      return this.walletRepository.withTransaction((session) => work({ session }));
    }
    return work(undefined);
  }

  async createWallet(input: ICreateWalletDTO): Promise<Wallet> {
    const existingWallet = await this.walletRepository.findByUserId(input.userId);
    if (existingWallet) {
      throw new DomainError({
        code: 'WALLET_ALREADY_EXISTS',
        message: 'Wallet already exists for user',
        details: { userId: input.userId },
      });
    }

    const currency = new CurrencyValueObject((input.currency || 'BRL') as Currency);
    const wallet = new Wallet(input.userId, currency.toString());
    await this.walletRepository.save(wallet);
    return wallet;
  }

  async deposit(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.run((opts) => this.doDeposit(userId, amount, context, opts), options);
  }

  private async doDeposit(
    userId: string,
    amount: number,
    context: TransactionContext | undefined,
    options: WalletRepositoryOptions | undefined,
  ): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId, options);
    if (await this.ledgerAlreadyApplied(context, 'DEPOSIT', options)) return wallet;
    wallet.deposit(amount, context);
    wallet.incrementVersion();
    if (options) await this.walletRepository.update(wallet, options);
    else await this.walletRepository.update(wallet);
    depositsCounter.inc({ type: context?.type ?? 'DEPOSIT' });
    await this.appendLedger(userId, amount, wallet.currency, context, 'DEPOSIT', options);
    this.logWalletAction('deposit', wallet, amount, context);
    return wallet;
  }

  async findByUserId(userId: string, options?: WalletRepositoryOptions): Promise<Wallet | null> {
    return options
      ? this.walletRepository.findByUserId(userId, options)
      : this.walletRepository.findByUserId(userId);
  }

  async getHistory(userId: string, limit = 10, offset = 0) {
    return this.walletRepository.getHistory(userId, limit, offset);
  }

  async getLedgerHistory(userId: string, limit = 50, offset = 0) {
    if (!this.ledgerRepository) {
      return { entries: [], total: 0 };
    }
    const entries = await this.ledgerRepository.findByUserId(userId, { limit, offset });
    const total = await this.ledgerRepository.countByUserId(userId);
    return { entries, total };
  }

  async withdraw(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.run((opts) => this.doWithdraw(userId, amount, context, opts), options);
  }

  private async doWithdraw(
    userId: string,
    amount: number,
    context: TransactionContext | undefined,
    options: WalletRepositoryOptions | undefined,
  ): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId, options);
    if (await this.ledgerAlreadyApplied(context, 'WITHDRAWAL_COMPLETED', options)) return wallet;
    wallet.withdraw(amount, context);
    wallet.incrementVersion();
    if (options) await this.walletRepository.update(wallet, options);
    else await this.walletRepository.update(wallet);
    withdrawalsCounter.inc();
    await this.appendLedger(userId, amount, wallet.currency, context, 'WITHDRAWAL_COMPLETED', options);
    this.logWalletAction('withdraw', wallet, amount, context);
    return wallet;
  }

  async lock(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.run((opts) => this.doLock(userId, amount, context, opts), options);
  }

  private async doLock(
    userId: string,
    amount: number,
    context: TransactionContext | undefined,
    options: WalletRepositoryOptions | undefined,
  ): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId, options);
    if (await this.ledgerAlreadyApplied(context, 'WITHDRAWAL_HOLD', options)) return wallet;
    wallet.lock(amount, context);
    wallet.incrementVersion();
    if (options) await this.walletRepository.update(wallet, options);
    else await this.walletRepository.update(wallet);
    await this.appendLedger(userId, amount, wallet.currency, context, 'WITHDRAWAL_HOLD', options);
    this.logWalletAction('lock', wallet, amount, context);
    return wallet;
  }

  async unlock(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.run((opts) => this.doUnlock(userId, amount, context, opts), options);
  }

  private async doUnlock(
    userId: string,
    amount: number,
    context: TransactionContext | undefined,
    options: WalletRepositoryOptions | undefined,
  ): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId, options);
    if (await this.ledgerAlreadyApplied(context, 'WITHDRAWAL_REVERSED', options)) return wallet;
    wallet.unlock(amount, context);
    wallet.incrementVersion();
    if (options) await this.walletRepository.update(wallet, options);
    else await this.walletRepository.update(wallet);
    await this.appendLedger(userId, amount, wallet.currency, context, 'WITHDRAWAL_REVERSED', options);
    this.logWalletAction('unlock', wallet, amount, context);
    return wallet;
  }

  async withdrawLocked(userId: string, amount: number, context?: TransactionContext, options?: WalletRepositoryOptions): Promise<Wallet> {
    return this.run((opts) => this.doWithdrawLocked(userId, amount, context, opts), options);
  }

  private async doWithdrawLocked(
    userId: string,
    amount: number,
    context: TransactionContext | undefined,
    options: WalletRepositoryOptions | undefined,
  ): Promise<Wallet> {
    const wallet = await this.ensureWalletExists(userId, options);
    if (await this.ledgerAlreadyApplied(context, 'WITHDRAWAL_COMPLETED', options)) return wallet;
    wallet.withdrawLocked(amount, context);
    wallet.incrementVersion();
    if (options) await this.walletRepository.update(wallet, options);
    else await this.walletRepository.update(wallet);
    withdrawalsCounter.inc();
    await this.appendLedger(userId, amount, wallet.currency, context, 'WITHDRAWAL_COMPLETED', options);
    this.logWalletAction('withdraw_locked', wallet, amount, context);
    return wallet;
  }

  private ledgerTransactionId(
    context: TransactionContext | undefined,
    defaultType: LedgerOperationType,
  ): string {
    return context?.referenceId ? `${context.type ?? defaultType}:${context.referenceId}` : '';
  }

  /**
   * Guarda de idempotência no nível do ledger: quando a operação possui uma
   * referência determinística (referenceId), se o movimento correspondente já
   * foi registrado, esta chamada é uma repetição e NÃO deve mutar o saldo
   * novamente. Protege contra retries sequenciais fora do middleware (ex. após
   * expiração da Idempotency-Key ou perda da resposta).
   */
  private async ledgerAlreadyApplied(
    context: TransactionContext | undefined,
    defaultType: LedgerOperationType,
    options?: WalletRepositoryOptions,
  ): Promise<boolean> {
    if (!this.ledgerRepository) return false;
    const transactionId = this.ledgerTransactionId(context, defaultType);
    if (!transactionId) return false;
    return options
      ? this.ledgerRepository.exists(transactionId, options)
      : this.ledgerRepository.exists(transactionId);
  }

  private async appendLedger(
    userId: string,
    amount: number,
    currency: string,
    context: TransactionContext | undefined,
    defaultType: LedgerOperationType,
    options?: WalletRepositoryOptions,
  ): Promise<void> {
    if (!this.ledgerRepository) {
      return;
    }
    const entry = new LedgerEntry(
      context?.referenceId ? `${context.type ?? defaultType}:${context.referenceId}` : randomUUID(),
      userId,
      context?.type ?? defaultType,
      Math.round(amount * 100),
      currency,
      context?.referenceId,
      context?.source,
      (context?.status as LedgerStatus | undefined) ?? 'COMPLETED',
      new Date(),
      context?.metadata,
    );
    try {
      await this.ledgerRepository.append(entry, options);
    } catch (error) {
      // A entrada do ledger é parte da mesma unidade atômica da mutação da
      // carteira. O erro é registrado para observabilidade e RE-LANÇADO:
      // dentro de uma transação Mongo isso reverte a mutação (Wallet == Ledger);
      // fora de transação a operação financeira falha em vez de silenciosamente
      // gravar um movimento incompleto.
      writeStructuredLog(
        {
          event: 'ledger_append_failed',
          userId,
          type: entry.type,
          amountCents: entry.amountCents,
          err: error instanceof Error ? error.message : 'unknown',
        },
        'error',
      );
      throw error;
    }
  }

  private async ensureWalletExists(userId: string, options?: WalletRepositoryOptions): Promise<Wallet> {
    const wallet = options
      ? await this.walletRepository.findByUserId(userId, options)
      : await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new DomainError({
        code: 'WALLET_NOT_FOUND',
        message: 'Wallet not found',
        details: { userId },
      });
    }
    return wallet;
  }

  private logWalletAction(
    action: 'deposit' | 'withdraw' | 'lock' | 'unlock' | 'withdraw_locked',
    wallet: Wallet,
    amount: number,
    context?: TransactionContext,
  ) {
    writeStructuredLog({
      event: 'wallet_action',
      action,
      userId: wallet.userId,
      amount,
      currency: wallet.currency,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      description: context?.description,
      metadata: context?.metadata,
    });
  }
}