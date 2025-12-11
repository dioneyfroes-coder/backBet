import { processContactPayload } from '../ContactWorker';
import nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('ContactWorker.processContactPayload', () => {
  const sendMailMock = jest.fn().mockResolvedValue({ accepted: ['support@example.com'] });

  beforeAll(() => {
    // @ts-ignore - mock createTransport
    nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends an email with the payload data', async () => {
    const payload = {
      ticketId: 'ticket-123',
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello team',
      createdAt: new Date().toISOString(),
    };

    await processContactPayload(payload as any);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const called = sendMailMock.mock.calls[0][0];
    expect(called).toHaveProperty('to');
    expect(called).toHaveProperty('subject');
    expect(called).toHaveProperty('text');
    expect(called.replyTo).toBe('jane@example.com');
  });
});
