import { UserService } from '@/core/user/domain/services/UserService';

export class UpdatePreferences {
  constructor(private readonly userService: UserService) {}

  async execute(userId: string, partial: Partial<Record<string, unknown>>) {
    // Narrow the allowed fields explicitly in the use-case
    const allowed: Partial<{
      emailNotifications: boolean;
      smsNotifications: boolean;
      marketingEmails: boolean;
      requireWithdrawPassword?: boolean | null;
    }> = {};

    if (typeof (partial as any).emailNotifications !== 'undefined') {
      allowed.emailNotifications = Boolean((partial as any).emailNotifications);
    }
    if (typeof (partial as any).smsNotifications !== 'undefined') {
      allowed.smsNotifications = Boolean((partial as any).smsNotifications);
    }
    if (typeof (partial as any).marketingEmails !== 'undefined') {
      allowed.marketingEmails = Boolean((partial as any).marketingEmails);
    }
    if (typeof (partial as any).requireWithdrawPassword !== 'undefined') {
      allowed.requireWithdrawPassword = (partial as any).requireWithdrawPassword;
    }

    return this.userService.updatePreferences(userId, allowed as any);
  }
}
