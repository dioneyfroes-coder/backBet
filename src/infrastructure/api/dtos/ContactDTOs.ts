import { z } from 'zod';

export const ContactDTO = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  message: z.string().min(3),
  recaptchaToken: z.string().optional(),
});

export type ContactDTOType = z.infer<typeof ContactDTO>;
