// users/config/user-config.ts
const userConfig = {
  minPasswordLength: 8,
  maxLoginAttempts: 5,
  accountVerificationTimeout: 24 * 60 * 60 * 1000, // 24h
  defaultCurrency: 'BRL',
  minDepositAmount: 10,
  maxDepositAmount: 5000,
  minWithdrawalAmount: 20,
  maxWithdrawalAmount: 10000,
} as const;

export { userConfig };
