export interface IWalletDTO {
  userId: string;
  balance: number;
  lockedBalance: number;
  currency: string;
}

export interface ICreateWalletDTO {
  userId: string;
  currency: string;
}