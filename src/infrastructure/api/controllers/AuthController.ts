import { Request, Response, CookieOptions } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest, getRequestUserId } from '../middleware/AuthMiddleware';
import {
  RegisterDTO,
  LoginDTO,
  RefreshTokenDTO,
  LogoutDTO,
  ChangePasswordDTO,
} from '../dtos/AuthDTOs';
import { RegisterUser } from '@core/user/application/use-cases/RegisterUser';
import { UserService } from '@core/user/domain/services/UserService';
import { User } from '@core/user/domain/entities/User';
import { JwtService } from '@/shared/services/JwtService';
import { UserStatus } from '@core/user/types/user.types';
import { appConfig } from '@/shared/config/appConfig';
import { SessionService } from '@/core/auth/domain/services/SessionService';
import { getSessionService } from '@/core/auth/domain/services/SessionServiceSingleton';
import { ChangePassword } from '@core/user/application/use-cases/ChangePassword';
import { Session } from '@/core/auth/domain/entities/Session';

/**
 * Controller de autenticação
 * Gerencia registro/autenticação local com JWT e ciclo de vida das sessões
 * (rotação de refresh token, revogação em logout/mudança de senha/suspensão).
 */
export class AuthController extends BaseController {
  constructor(
    private registerUserUseCase: RegisterUser,
    private userService: UserService,
    private jwtService: JwtService,
    private sessionService: SessionService | (() => Promise<SessionService>) = getSessionService,
    private changePasswordUseCase?: ChangePassword,
  ) {
    super();
  }

  /**
   * @openapi
   * /api/v1/auth/register:
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
    try {
      const payload = this.validateSchema(RegisterDTO, req.body);

      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      const result = await this.registerUserUseCase.execute({
        email: payload.email,
        username: payload.username,
        password: payload.password,
        currency: 'BRL',
      });

      const userEntity = await this.userService.findById(result.user.id);
      const hydratedUser = userEntity ? this.buildUserProfile(userEntity) : result.user;
      const accountStatus = result.user.status;
      const isActive = this.isAccountActive(accountStatus);
      const canOperate = this.canOperate(accountStatus);
      const tokens = canOperate ? await this.issueSessionTokens(res, result.user.id) : null;
      const walletSummary = {
        id: result.wallet.userId,
        userId: result.wallet.userId,
        balance: result.wallet.balance,
        lockedBalance: result.wallet.lockedBalance,
        currency: result.wallet.currency,
      };

      return this.created(res, {
        message: 'Usuário registrado com sucesso',
        registrationRequestId: result.user.id,
        status: accountStatus,
        isActive,
        user: hydratedUser,
        wallet: walletSummary,
        accessToken: tokens?.accessToken ?? null,
        refreshToken: tokens?.refreshToken ?? null,
        sessionId: tokens?.sessionId ?? null,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/v1/auth/login:
   *   post:
   *     tags:
   *       - Auth
   *     summary: Autentica usuário via credenciais e retorna tokens JWT
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
    try {
      const payload = this.validateSchema(LoginDTO, req.body);

      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      const user = await this.userService.findByEmail(payload.email);
      if (!user) {
        return this.unauthorized(res, 'Email ou senha inválidos');
      }

      const isPasswordValid = await this.userService.comparePassword(user, payload.password);
      if (!isPasswordValid) {
        return this.unauthorized(res, 'Email ou senha inválidos');
      }

      if (!this.canOperate(user.status)) {
        return this.error(
          res,
          'ACCOUNT_RESTRICTED',
          'Conta restrita. Entre em contato com o suporte.',
          403,
          { status: user.status },
        );
      }

      const tokens = await this.issueSessionTokens(res, user.id);

      return this.ok(res, {
        ...tokens,
        user: this.buildUserProfile(user),
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/v1/auth/refresh:
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
    try {
      const payload = this.validateSchema(RefreshTokenDTO, req.body);
      if (!payload) {
        return this.badRequest(res, 'Refresh token inválido');
      }
      const decoded = this.jwtService.verifyRefreshToken(payload.refreshToken);

      const user = await this.userService.findById(decoded.userId);
      if (!user) {
        return this.notFound(res, 'Usuário não encontrado');
      }

      if (!this.canOperate(user.status)) {
        return this.error(res, 'ACCOUNT_RESTRICTED', 'Conta não está ativa.', 403, {
          status: user.status,
        });
      }

      // Rotação do refresh token: o jti apresentado é comparado com o vigente.
      // Reuso de token antigo/roubado revoga a família de sessão (401).
      const session = await (await this.sessionSvc()).rotate(
        decoded.userId,
        decoded.sessionId as string,
        decoded.jti,
      );

      const tokens = await this.issueSessionTokens(res, user.id, session);
      return this.ok(res, {
        ...tokens,
        user: this.buildUserProfile(user),
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * @openapi
   * /api/v1/auth/me:
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
    const userId = getRequestUserId(req);

    if (!userId) {
      return this.unauthorized(res, 'Autenticação requerida');
    }

    // Buscar usuário
    const user = await this.userService.findById(userId);
    if (!user) {
      return this.notFound(res, 'Usuário não encontrado');
    }

    return this.ok(res, this.buildUserProfile(user));
  }

  /**
   * @openapi
   * /api/v1/auth/logout:
   *   post:
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     summary: Faz logout e invalida sessão no cliente
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
    const userId = getRequestUserId(req);
    const payload = this.validateSchema(LogoutDTO, req.body ?? {});
    const sessionId = payload?.sessionId || req.authContext?.sessionId;

    if (sessionId && userId) {
      // Revoga a sessão servidor-side (best-effort e idempotente): logout é
      // sempre bem-sucedido mesmo se a sessão já expirou ou foi revogada.
      await (await this.sessionSvc()).revokeOwnSession(sessionId, userId);
    }

    this.clearAuthCookies(res);
    return this.ok(res, {
      message: 'Logout realizado com sucesso',
    });
  }

  async changePassword(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const userId = getRequestUserId(req);
      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }
      if (!this.changePasswordUseCase) {
        return this.internalError(res, 'Operação indisponível');
      }

      const payload = this.validateSchema(ChangePasswordDTO, req.body);
      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      await this.changePasswordUseCase.execute({
        userId,
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      });

      // Após a troca, as sessões foram revogadas; encerra a sessão do cliente.
      this.clearAuthCookies(res);

      return this.ok(res, {
        message: 'Senha alterada com sucesso. Faça login novamente.',
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async registrationStatus(req: Request<{ userId: string }>, res: Response): Promise<Response> {
    try {
      const { userId } = req.params;
      const user = await this.userService.findById(userId);
      if (!user) {
        return this.notFound(res, 'Registro não encontrado');
      }
      const status = user.status;
      return this.ok(res, {
        userId,
        status,
        isActive: this.isAccountActive(status),
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private buildUserProfile(user: User) {
    const [defaultFirstName = '', defaultLastName = ''] = user.username.split('.');
    return {
      id: user.id,
      email: user.email.value,
      username: user.username,
      firstName: defaultFirstName,
      lastName: defaultLastName,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  private isAccountActive(status: UserStatus): boolean {
    return status === 'ACTIVE';
  }

  private canOperate(status: UserStatus): boolean {
    return status !== 'SUSPENDED';
  }

  private async sessionSvc(): Promise<SessionService> {
    if (typeof this.sessionService === 'function') {
      return this.sessionService();
    }
    return this.sessionService;
  }

  private async issueSessionTokens(res: Response, userId: string, existingSession?: Session) {
    const session =
      existingSession ?? (await (await this.sessionSvc()).openSession(userId));
    const accessToken = this.jwtService.signAccessToken(userId, session.sessionId);
    const refreshToken = this.jwtService.signRefreshToken(userId, session.sessionId, session.jwtId);
    this.setAuthCookies(res, { refreshToken, sessionId: session.sessionId });
    return { accessToken, refreshToken, sessionId: session.sessionId };
  }

  private setAuthCookies(
    res: Response,
    payload: { refreshToken: string; sessionId: string },
  ): void {
    const cookieConfig = appConfig.auth.cookies;
    const baseOptions: CookieOptions = {
      httpOnly: true,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      domain: cookieConfig.domain,
      path: cookieConfig.path,
      maxAge: cookieConfig.maxAgeMs,
    };
    res.cookie(cookieConfig.refreshTokenName, payload.refreshToken, baseOptions);
    res.cookie(cookieConfig.sessionIdName, payload.sessionId, baseOptions);
  }

  private clearAuthCookies(res: Response): void {
    const cookieConfig = appConfig.auth.cookies;
    const clearOptions: CookieOptions = {
      httpOnly: true,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      domain: cookieConfig.domain,
      path: cookieConfig.path,
    };
    res.clearCookie(cookieConfig.refreshTokenName, clearOptions);
    res.clearCookie(cookieConfig.sessionIdName, clearOptions);
  }
}
