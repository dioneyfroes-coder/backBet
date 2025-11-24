import { z } from 'zod';

/**
 * Schema para registrar novo usuário
 */
export const RegisterDTO = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  firstName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  lastName: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres'),
  username: z
    .string()
    .min(3, 'Username deve ter pelo menos 3 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username pode conter apenas letras, números e underscore'),
});

export type RegisterDTOType = z.infer<typeof RegisterDTO>;

/**
 * Schema para login
 */
export const LoginDTO = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é requerida'),
});

export type LoginDTOType = z.infer<typeof LoginDTO>;

/**
 * Schema para refresh token
 */
export const RefreshTokenDTO = z.object({
  refreshToken: z.string().min(1, 'Refresh token é requerido'),
});

export type RefreshTokenDTOType = z.infer<typeof RefreshTokenDTO>;

/**
 * Schema para logout
 */
export const LogoutDTO = z.object({
  sessionId: z.string().optional(),
});

export type LogoutDTOType = z.infer<typeof LogoutDTO>;

/**
 * Response de autenticação
 */
export const AuthResponseDTO = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    username: z.string(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']),
    createdAt: z.date(),
  }),
});

export type AuthResponseDTOType = z.infer<typeof AuthResponseDTO>;
