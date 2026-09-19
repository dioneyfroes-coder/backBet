import type { IMailerPort } from '@/core/contact/domain/ports/IMailerPort';
import { getMailerQueue } from './index';
import { processContactPayload } from './ContactWorker';
import type { ContactPayload } from '@/core/contact/domain/types/ContactMessage';

export const queueMailerPort: IMailerPort = {
  sendContact: async (payload: ContactPayload): Promise<void> => {
    const queue = getMailerQueue();
    await queue.enqueueContact(payload);
  },
};

export const directMailerPort: IMailerPort = {
  sendContact: (payload: ContactPayload): Promise<void> => processContactPayload(payload),
};