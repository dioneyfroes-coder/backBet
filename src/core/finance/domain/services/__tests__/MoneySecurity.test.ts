import { MoneySecurityService } from '../MoneySecurityService';
import { InMemoryLedgerRepository } from '../../repositories/InMemoryLedgerRepository';
import { UserRepository } from '@/core/user/domain/repositories/UserRepository';
import { WithdrawalRequestRepository } from '../../repositories/WithdrawalRequestRepository';
import { LedgerEntry, LedgerOperationType } from '../../entities/LedgerEntry';
import { WithdrawalRequest } from '../../entities/WithdrawalRequest';
import { DomainError } from '@/core/shared/domain/errors/DomainError';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';
import { randomUUID } from 'crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const OLD_PIX_CHANGE = new Date(Date.now() - 30 * DAY_MS);
const MIM = {
  id: 'user-1',
  email: new Email('mim@example.com'),
  username: 'mim',
  passwordHash: 'hash',
  status: 'ACTIVE' as const,
  createdAt: new Date(Date.now() - 30 * DAY_MS),
  updatedAt: new Date(Date.now() - 30 * DAY_MS),
} as const;

const buildUser = (overrides: Partial<User> = {}): User =>
  new User(
    overrides.id ?? MIM.id,
    overrides.email ?? MIM.email,
    overrides.username ?? MIM.username,
    overrides.passwordHash ?? MIM.passwordHash,
    overrides.status ?? MIM.status,
    overrides.createdAt ?? MIM.createdAt,
    overrides.updatedAt ?? MIM.updatedAt,
    overrides.pixKey ?? 'mim@bank.example',
    overrides.documents ?? [],
    overrides.preferences ?? {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: false,
      requireWithdrawPassword: null,
    },
    overrides.passwordRecovery ?? undefined,
    overrides.pixUpdatedAt ?? OLD_PIX_CHANGE,
  );

const append = (
  ledger: InMemoryLedgerRepository,
  userId: string,
  type: LedgerOperationType,
  amountCents: number,
  at?: Date,
) =>
  ledger.append(
    new LedgerEntry(
      randomUUID(),
      userId,
      type,
      amountCents,
      'BRL',
      randomUUID(),
      'TEST',
      'COMPLETED',
      at ?? new Date(),
      undefined,
    ),
  );

describe('MoneySecurityService — Fase 13: segurança específica de dinheiro', () => {
  let ledger: InMemoryLedgerRepository;
  let users: UserRepository;
  let withdrawalRequests: WithdrawalRequestRepository;
  let service: MoneySecurityService;

  beforeEach(() => {
    ledger = new InMemoryLedgerRepository();
    users = new UserRepository();
    withdrawalRequests = new WithdrawalRequestRepository();
    service = new MoneySecurityService(ledger, users, withdrawalRequests);
    users.save(buildUser());
  });

  const expectBlock = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toMatchObject<Partial<DomainError>>({ code });
  };

  describe('depósitos', () => {
    it('permite depósito dentro dos limites', async () => {
      await expect(service.assertDepositAllowed('user-1', 100)).resolves.toBeUndefined();
    });

    it('bloqueia depósito acima do máximo por operação', async () => {
      await expectBlock(service.assertDepositAllowed('user-1', 5001), 'MONEY_SECURITY_DEPOSIT_MAX_AMOUNT');
    });

    it('bloqueia depósito acima do limite diário de valor', async () => {
      for (let i = 0; i < 5; i += 1) {
        await append(ledger, 'user-1', 'DEPOSIT', 4000 * 100);
      }
      await expectBlock(
        service.assertDepositAllowed('user-1', 100),
        'MONEY_SECURITY_DEPOSIT_DAILY_LIMIT',
      );
    });

    it('bloqueia depósito acima do limite diário de quantidade', async () => {
      for (let i = 0; i < 20; i += 1) {
        await append(ledger, 'user-1', 'DEPOSIT', 100 * 100);
      }
      await expectBlock(
        service.assertDepositAllowed('user-1', 100),
        'MONEY_SECURITY_DEPOSIT_DAILY_COUNT',
      );
    });

    it('ignora depósitos de dias anteriores no limite diário', async () => {
      for (let i = 0; i < 20; i += 1) {
        await append(ledger, 'user-1', 'DEPOSIT', 100 * 100, new Date(Date.now() - 2 * DAY_MS));
      }
      await expect(service.assertDepositAllowed('user-1', 100)).resolves.toBeUndefined();
    });
  });

  describe('saques', () => {
    it('permite saque dentro dos limites', async () => {
      await expect(service.assertWithdrawalAllowed('user-1', 100, 'mim@bank.example')).resolves.toBeUndefined();
    });

    it('bloqueia saque acima do máximo por operação', async () => {
      await expectBlock(
        service.assertWithdrawalAllowed('user-1', 10001, 'mim@bank.example'),
        'MONEY_SECURITY_WITHDRAWAL_MAX_AMOUNT',
      );
    });

    it('bloqueia saque alto de conta recém-criada (comportamento anômalo)', async () => {
      users.save(
        buildUser({
          id: 'newbie',
          createdAt: new Date(Date.now() - 60 * 1000),
          updatedAt: new Date(Date.now() - 60 * 1000),
          pixUpdatedAt: new Date(Date.now() - 60 * 1000),
        }),
      );
      await expectBlock(
        service.assertWithdrawalAllowed('newbie', 500, 'newbie@bank.example'),
        'MONEY_SECURITY_ACCOUNT_TOO_NEW',
      );
    });

    it('bloqueia saque após mudança recente de Pix (cooldown)', async () => {
      users.save(
        buildUser({
          id: 'pix-changed',
          pixUpdatedAt: new Date(Date.now() - 15 * 60 * 1000),
        }),
      );
      await expectBlock(
        service.assertWithdrawalAllowed('pix-changed', 100, 'pix-changed@bank.example'),
        'MONEY_SECURITY_PIX_CHANGED_RECENTLY',
      );
    });

    it('bloqueia saque quando a chave Pix está vinculada a outra conta', async () => {
      users.save(
        buildUser({
          id: 'user-2',
          email: new Email('other@example.com'),
          pixKey: 'shared@bank.example',
        }),
      );
      users.save(
        buildUser({
          id: 'user-3',
          email: new Email('third@example.com'),
          pixKey: 'shared@bank.example',
        }),
      );
      await expectBlock(
        service.assertWithdrawalAllowed('user-3', 100, 'shared@bank.example'),
        'MONEY_SECURITY_PIX_KEY_LINKED',
      );
    });

    it('bloqueia saque acima do limite diário de valor', async () => {
      // 3 saques de R$ 9.000 hoje (fora da janela de velocidade), +100 excederia 25.000
      for (let i = 0; i < 3; i += 1) {
        await append(
          ledger,
          'user-1',
          'WITHDRAWAL_HOLD',
          9000 * 100,
          new Date(Date.now() - 20 * 60 * 1000),
        );
      }
      await expectBlock(
        service.assertWithdrawalAllowed('user-1', 100, 'mim@bank.example'),
        'MONEY_SECURITY_WITHDRAWAL_DAILY_LIMIT',
      );
    });

    it('bloqueia saque acima do limite diário de quantidade', async () => {
      for (let i = 0; i < 5; i += 1) {
        await append(
          ledger,
          'user-1',
          'WITHDRAWAL_HOLD',
          100 * 100,
          new Date(Date.now() - 20 * 60 * 1000),
        );
      }
      await expectBlock(
        service.assertWithdrawalAllowed('user-1', 100, 'mim@bank.example'),
        'MONEY_SECURITY_WITHDRAWAL_DAILY_COUNT',
      );
    });

    it('bloqueia múltiplos saques rápidos (velocidade)', async () => {
      for (let i = 0; i < 3; i += 1) {
        await append(ledger, 'user-1', 'WITHDRAWAL_HOLD', 100 * 100);
      }
      await expectBlock(
        service.assertWithdrawalAllowed('user-1', 100, 'mim@bank.example'),
        'MONEY_SECURITY_WITHDRAWAL_VELOCITY',
      );
    });

    it('bloqueia tentativas repetitivas após saques falhos', async () => {
      for (let i = 0; i < 5; i += 1) {
        await withdrawalRequests.create(
          new WithdrawalRequest(
            randomUUID(),
            'user-1',
            100,
            'BRL',
            new Date(Date.now() - 10 * 60 * 1000),
            'REJECTED',
          ),
        );
      }
      await expectBlock(
        service.assertWithdrawalAllowed('user-1', 100, 'mim@bank.example'),
        'MONEY_SECURITY_TOO_MANY_FAILED_ATTEMPTS',
      );
    });

    it('ignora saques de dias anteriores no limite diário', async () => {
      for (let i = 0; i < 6; i += 1) {
        await append(
          ledger,
          'user-1',
          'WITHDRAWAL_HOLD',
          100 * 100,
          new Date(Date.now() - 2 * DAY_MS),
        );
      }
      await expect(service.assertWithdrawalAllowed('user-1', 100, 'mim@bank.example')).resolves.toBeUndefined();
    });
  });
});