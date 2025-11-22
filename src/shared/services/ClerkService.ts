import { createClerkClient } from '@clerk/clerk-sdk-node';
import type { ClerkClient, User as ClerkUser } from '@clerk/clerk-sdk-node';
import { env } from '@/shared/config/env';

export type ClerkCreateUserParams = {
  externalUserId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
};

export class ClerkService {
  private client?: ClerkClient;

  constructor() {
    const secretKey = env.CLERK_API_KEY || env.CLERK_SECRET_KEY;
    const isTestKey = secretKey?.includes('sk_test');
    if (secretKey && !isTestKey) {
      this.client = createClerkClient({
        secretKey,
        publishableKey: env.CLERK_PUBLISHABLE_KEY,
        apiUrl: env.CLERK_API_URL,
      });
    }
  }

  isEnabled(): boolean {
    return Boolean(this.client);
  }

  async createUser(params: ClerkCreateUserParams): Promise<ClerkUser | null> {
    if (!this.client) {
      return null;
    }

    const { externalUserId, email, username, firstName, lastName, password } = params;

    const user = await this.client.users.createUser({
      externalId: externalUserId,
      emailAddress: [email],
      username,
      firstName,
      lastName,
      password,
      publicMetadata: {
        internalUserId: externalUserId,
      },
    });

    return user;
  }

  async getUser(userId: string): Promise<ClerkUser | null> {
    if (!this.client) {
      return null;
    }

    try {
      return await this.client.users.getUser(userId);
    } catch (_error) {
      return null;
    }
  }

}
