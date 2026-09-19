import { UserService } from '@/core/user/domain/services/UserService';

type AllowedPreferences = Partial<{
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  requireWithdrawPassword?: boolean | null;
}>;

export class UpdatePreferences {
  constructor(private readonly userService: UserService) {}

  async execute(userId: string, partial: Partial<Record<string, unknown>>) {
    // Narrow the allowed fields explicitly in the use-case
    const allowed: AllowedPreferences = {};

    const readBoolean = (key: keyof AllowedPreferences): boolean | undefined => {
      const value = partial[key];
      return typeof value === 'boolean' ? value : undefined;
    };

    const emailNotifications = readBoolean('emailNotifications');
    const smsNotifications = readBoolean('smsNotifications');
    const marketingEmails = readBoolean('marketingEmails');

    if (emailNotifications !== undefined) allowed.emailNotifications = emailNotifications;
    if (smsNotifications !== undefined) allowed.smsNotifications = smsNotifications;
    if (marketingEmails !== undefined) allowed.marketingEmails = marketingEmails;

    const requireWithdrawPasswordRaw = partial['requireWithdrawPassword'];
    if (typeof requireWithdrawPasswordRaw !== 'undefined') {
      if (typeof requireWithdrawPasswordRaw === 'boolean' || requireWithdrawPasswordRaw === null) {
        allowed.requireWithdrawPassword = requireWithdrawPasswordRaw;
      }
    }

    return this.userService.updatePreferences(userId, allowed);
  }
}
