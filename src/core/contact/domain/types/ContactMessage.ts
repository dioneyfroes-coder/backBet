export type ContactMessageInput = {
  name?: string;
  email?: string;
  message: string;
  recaptchaToken?: string;
};

export type ContactPayload = {
  ticketId: string;
  name?: string | null;
  email?: string | null;
  message: string;
  createdAt: string;
};