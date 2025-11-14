import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthenticatedRequest } from '../middleware/AuthMiddleware';
import { RegisterDTO, LoginDTO, RefreshTokenDTO, LogoutDTO, RegisterDTOType } from '../dtos/AuthDTOs';
import { UserService } from '../../../core/user/domain/services/UserService';
import { WalletService } from '../../../core/finance/domain/services/WalletService';

/**
 * Controller de autenticação
 * Integra com Clerk para gerenciar sessions
 */
export class AuthController extends BaseController {
  constructor(
    private userService: UserService,
    private walletService: WalletService
  ) {
    super();
  }

  /**
   * POST /auth/register
   * Registra novo usuário e cria carteira inicial
   */
  async register(req: Request, res: Response): Promise<Response> {
    try {
      const payload = this.validateSchema(RegisterDTO, req.body);

      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      // Verificar se usuário já existe
      const existingUser = await this.userService.findByEmail(payload.email);
      if (existingUser) {
        return this.conflict(res, 'Email já cadastrado');
      }

      // Registrar usuário
      const user = await this.userService.registerUser({
        email: payload.email,
        username: payload.username,
      });

      // Criar carteira inicial em BRL
      await this.walletService.createWallet({
        userId: user.id,
        currency: 'BRL',
      });

      return this.created(res, {
        message: 'Usuário registrado com sucesso',
        user: {
          id: user.id,
          email: user.email.value,
          username: user.username,
          status: user.status,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /auth/login
   * Autentica usuário com Clerk e retorna token
   * Nota: Em produção, será feito via Clerk OAuth
   */
  async login(req: Request, res: Response): Promise<Response> {
    try {
      const payload = this.validateSchema(LoginDTO, req.body);

      if (!payload) {
        return this.badRequest(res, 'Dados inválidos');
      }

      // Buscar usuário
      const user = await this.userService.findByEmail(payload.email);
      if (!user) {
        return this.unauthorized(res, 'Email ou senha inválidos');
      }

      // Validar senha (integrar com Clerk depois)
      // Por enquanto, retornar erro informando que precisa usar OAuth
      return this.internalError(
        res,
        'Login deve ser feito via Clerk OAuth. Use o SDK de front-end.'
      );
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /auth/refresh
   * Renova access token usando refresh token
   */
  async refreshToken(req: Request, res: Response): Promise<Response> {
    try {
      const payload = this.validateSchema(RefreshTokenDTO, req.body);

      // Implementar refresh token com Clerk
      return this.ok(res, {
        message: 'Refresh via Clerk OAuth necessário',
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /auth/me
   * Retorna dados do usuário autenticado
   */
  async me(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const userId = req.auth?.userId;

      if (!userId) {
        return this.unauthorized(res, 'Autenticação requerida');
      }

      // Buscar usuário
      const user = await this.userService.findById(userId);
      if (!user) {
        return this.notFound(res, 'Usuário não encontrado');
      }

      return this.ok(res, {
        id: user.id,
        email: user.email.value,
        username: user.username,
        firstName: user.username.split('.')[0], // TODO: Adicionar firstName/lastName ao User
        lastName: user.username.split('.')[1] || '',
        status: user.status,
        createdAt: user.createdAt,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /auth/logout
   * Faz logout e invalida session
   */
  async logout(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      // Logout é gerenciado pelo Clerk no cliente
      return this.ok(res, {
        message: 'Logout realizado com sucesso',
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}
