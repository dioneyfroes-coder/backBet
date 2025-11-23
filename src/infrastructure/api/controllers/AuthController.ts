import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';
import { RegisterDTO, LoginDTO, RefreshTokenDTO } from '../dtos/AuthDTOs';
import { RegisterUser } from '@core/user/application/use-cases/RegisterUser';
import { UserService } from '@core/user/domain/services/UserService';
import { User } from '@core/user/domain/entities/User';
import { ClerkService } from '@/shared/services/ClerkService';
import { JwtService } from '@/shared/services/JwtService';
import type { User as ClerkUser } from '@clerk/backend';
import { randomUUID } from 'crypto';

/**
 * Controller de autenticação
 * Integra com Clerk para gerenciar sessions
 */
export class AuthController extends BaseController {
  constructor(
    private registerUserUseCase: RegisterUser,
    private userService: UserService,
    private clerkService: ClerkService,
    private jwtService: JwtService
  ) {
    super();
  }

  /**
   * @openapi
   * /api/auth/register:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Registra novo usuário e cria carteira inicial
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterRequest'
   *     responses:
   *       '201':
   *         description: Usuário registrado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RegisterResponse'
   *       '400':
   *         description: Dados inválidos
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       '409':
   *         description: Email já cadastrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ConflictError'
   */
  async register(req: Request, res: Response): Promise<Response> {
    const payload = this.validateSchema(RegisterDTO, req.body);

    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    // Delegar registro para use-case
    const result = await this.registerUserUseCase.execute({
      email: payload.email,
      username: payload.username,
      password: payload.password,
      currency: 'BRL',
    });

    if (this.clerkService.isEnabled()) {
      try {
        await this.clerkService.createUser({
          externalUserId: result.user.id,
          email: payload.email,
          username: payload.username,
          firstName: payload.firstName,
          lastName: payload.lastName,
          password: payload.password,
        });
      } catch (error) {
        console.warn('Failed to sync user with Clerk:', error);
      }
    }

    return this.created(res, {
      message: 'Usuário registrado com sucesso',
      user: result.user,
      wallet: result.wallet,
    });
  }

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Autentica usuário (placeholder - usar Clerk OAuth em produção)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *                 example: 'Senha'
   *     responses:
   *       '200':
   *         description: Token retornado
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/AuthResponse'
   *       '401':
   *         description: Credenciais inválidas
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/ErrorResponse'
   */
  async login(req: Request, res: Response): Promise<Response> {
    const payload = this.validateSchema(LoginDTO, req.body);

    if (!payload) {
      return this.badRequest(res, 'Dados inválidos');
    }

    // Buscar usuário
    const user = await this.userService.findByEmail(payload.email);
    if (!user) {
      return this.unauthorized(res, 'Email ou senha inválidos');
    }

    const isPasswordValid = await this.userService.comparePassword(user, payload.password);
    if (!isPasswordValid) {
      return this.unauthorized(res, 'Email ou senha inválidos');
    }

    const sessionId = randomUUID();
    const accessToken = this.jwtService.signAccessToken(user.id, sessionId);
    const refreshToken = this.jwtService.signRefreshToken(user.id, sessionId);

    const clerkUser = await this.clerkService.getUser(user.id);

    return this.ok(res, {
      accessToken,
      refreshToken,
      user: this.buildUserProfile(user, clerkUser),
    });
  }

  /**
   * @openapi
   * /api/auth/refresh:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Renova access token usando refresh token (placeholder)
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               refreshToken:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Token renovado
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/AuthResponse'
   *       '400':
   *         content:
   *           application/json:
   *             $ref: '#/components/schemas/ErrorResponse'
   */
  async refreshToken(req: Request, res: Response): Promise<Response> {
    const payload = this.validateSchema(RefreshTokenDTO, req.body);
    if (!payload) {
      return this.badRequest(res, 'Refresh token inválido');
    }
    const decoded = this.jwtService.verifyRefreshToken(payload.refreshToken);

    const user = await this.userService.findById(decoded.userId);
    if (!user) {
      return this.notFound(res, 'Usuário não encontrado');
    }

    const sessionId = decoded.sessionId || randomUUID();
    const accessToken = this.jwtService.signAccessToken(user.id, sessionId);
    const refreshToken = this.jwtService.signRefreshToken(user.id, sessionId);
    const clerkUser = await this.clerkService.getUser(user.id);

    return this.ok(res, {
      accessToken,
      refreshToken,
      user: this.buildUserProfile(user, clerkUser),
    });
  }

  /**
   * @openapi
   * /api/auth/me:
   *   get:
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     summary: Retorna dados do usuário autenticado
   *     responses:
   *       '200':
   *         description: Dados do usuário
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MeResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   *       '404':
   *         description: Usuário não encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  async me(req: AuthenticatedRequest, res: Response): Promise<Response> {
    const userId = req.auth?.userId;

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    // Buscar usuário
    const user = await this.userService.findById(userId);
    if (!user) {
      return this.notFound(res, 'Usuário não encontrado');
    }

    const clerkUser = await this.clerkService.getUser(userId);
    return this.ok(res, this.buildUserProfile(user, clerkUser));
  }

  /**
   * @openapi
   * /api/auth/logout:
   *   post:
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     summary: Faz logout e invalida session (gerenciado pelo Clerk)
   *     responses:
   *       '200':
   *         description: Logout realizado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LogoutResponse'
   *       '401':
   *         description: Não autenticado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/UnauthorizedError'
   */
  async logout(req: AuthenticatedRequest, res: Response): Promise<Response> {
    // Logout é gerenciado pelo Clerk no cliente
    return this.ok(res, {
      message: 'Logout realizado com sucesso',
    });
  }

  private buildUserProfile(user: User, clerkUser: ClerkUser | null) {
    const defaultNames = user.username.split('.');
    const defaultFirstName = defaultNames[0] ?? '';
    const defaultLastName = defaultNames[1] ?? '';
    return {
      id: user.id,
      email: user.email.value,
      username: clerkUser?.username ?? user.username,
      firstName: clerkUser?.firstName ?? defaultFirstName,
      lastName: clerkUser?.lastName ?? defaultLastName,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
