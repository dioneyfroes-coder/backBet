import { DepositDTO, WithdrawDTO } from '../WalletDTOs';
import { CreateWithdrawalRequestDTO } from '../FinanceDTOs';

describe('DTOs de dinheiro rejeitam mais de 2 casas decimais', () => {
  it('DepositDTO aceita até 2 casas e rejeita 3+', () => {
    expect(DepositDTO.safeParse({ amount: 5.29, currency: 'BRL' }).success).toBe(true);
    expect(DepositDTO.safeParse({ amount: 5.123 }).success).toBe(false);
  });

  it('WithdrawDTO aceita até 2 casas e rejeita 3+', () => {
    expect(
      WithdrawDTO.safeParse({ amount: 100.5, currency: 'BRL', pixKey: 'user@pix' }).success,
    ).toBe(true);
    expect(WithdrawDTO.safeParse({ amount: 100.125, currency: 'BRL' }).success).toBe(false);
  });

  it('CreateWithdrawalRequestDTO aceita até 2 casas e rejeita 3+', () => {
    expect(
      CreateWithdrawalRequestDTO.safeParse({ amount: 0.29, currency: 'BRL' }).success,
    ).toBe(true);
    expect(
      CreateWithdrawalRequestDTO.safeParse({ amount: 0.299, currency: 'BRL' }).success,
    ).toBe(false);
  });
});