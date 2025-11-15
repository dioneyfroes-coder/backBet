// users/domain/value-objects/Email.ts
import { AppError } from '@/shared/errors/AppError';

export class Email {
  constructor(public readonly value: string) {
    if (!this.isValid(value)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid email format', 400);
    }
  }

  private isValid(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    if (email.includes(' ')) return false;

    const parts = email.split('@');
    if (parts.length !== 2) return false;

    const [localPart, domain] = parts;
    if (!localPart || !domain || localPart.startsWith('.') || localPart.endsWith('.')) return false;

    const domainParts = domain.split('.');
    if (domainParts.length < 2) return false;
    if (domainParts.some((part) => !part)) return false;

    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }

  toString(): string {
    return this.value;
  }
}
