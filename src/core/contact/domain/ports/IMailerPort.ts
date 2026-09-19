import type { ContactPayload } from '../types/ContactMessage';

export interface IMailerPort {
  sendContact(payload: ContactPayload): Promise<void>;
}

export const noopMailer: IMailerPort = {
  sendContact: async () => undefined,
};