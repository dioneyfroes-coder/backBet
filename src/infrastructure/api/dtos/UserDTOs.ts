import { z } from 'zod';

/**
 * DTO para atualizar perfil do usuário
 */
export const UpdateProfileDTO = z.object({
  firstName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  lastName: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres').optional(),
  bio: z.string().max(500, 'Bio deve ter no máximo 500 caracteres').optional(),
});

export type UpdateProfileDTOType = z.infer<typeof UpdateProfileDTO>;

/**
 * DTO para mudar email do usuário
 */
export const ChangeEmailDTO = z.object({
  email: z.string().email('Email inválido'),
  verificationCode: z.string().optional(),
});

export type ChangeEmailDTOType = z.infer<typeof ChangeEmailDTO>;

const pixKeySchema = z
  .string()
  .trim()
  .min(5, 'Chave Pix deve ter pelo menos 5 caracteres')
  .max(140, 'Chave Pix deve ter no máximo 140 caracteres')
  .regex(/^[A-Za-z0-9@.+\-_:]+$/, 'Chave Pix contém caracteres inválidos');

export const UpdatePixKeyDTO = z.object({
  pixKey: z.union([pixKeySchema, z.literal(''), z.null()]),
});

export type UpdatePixKeyDTOType = z.infer<typeof UpdatePixKeyDTO>;

/**
 * Response DTO para usuário
 */
export const UserResponseDTO = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  bio: z.string().optional(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED']),
  createdAt: z.string().datetime(),
  pixKey: z.string().nullable().optional(),
});

export type UserResponseDTOType = z.infer<typeof UserResponseDTO>;
