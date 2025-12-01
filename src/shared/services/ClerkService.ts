import { createClerkClient } from '@clerk/backend';
import type { ClerkClient, User as ClerkUser } from '@clerk/backend';
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
    const secretKey =
      process.env.CLERK_API_KEY ||
      process.env.CLERK_SECRET_KEY ||
      env.CLERK_API_KEY ||
      env.CLERK_SECRET_KEY;
    const isTestKey = Boolean(secretKey?.includes('sk_test'));
    const nodeEnv = process.env.NODE_ENV || env.NODE_ENV || 'development';
    const runtimeEnv =
      process.env.BACKBET_RUNTIME_ENV || env.BACKBET_RUNTIME_ENV || nodeEnv || 'development';
    const isProduction = runtimeEnv === 'production';
    const forceClerkInTests = process.env.CLERK_ENABLE_IN_TESTS === 'true';
    const isTestRuntime =
      runtimeEnv === 'test' ||
      nodeEnv === 'test' ||
      (Boolean(process.env.JEST_WORKER_ID) && !forceClerkInTests);

    if (isTestRuntime) {
      return;
    }

    if (!secretKey) {
      return;
    }

    if (isProduction && isTestKey) {
      console.warn('Refusing to bootstrap ClerkService with a test key in production.');
      return;
    }

    this.client = createClerkClient({
      secretKey,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY,
      apiUrl: process.env.CLERK_API_URL || env.CLERK_API_URL,
    });
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

  async linkInternalUserId(clerkUserId: string, internalUserId: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.users.updateUser(clerkUserId, {
        publicMetadata: {
          internalUserId,
        },
      } as any);
    } catch (error) {
      console.warn('Failed to link internalUserId on Clerk user:', error);
    }
  }
}
