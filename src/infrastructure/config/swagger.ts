import swaggerJsdoc from 'swagger-jsdoc';

/**
 * Configuração Swagger/OpenAPI 3.0
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BackBet API',
      version: '1.0.0',
      description: 'API de Apostas - Backend',
      contact: {
        name: 'BackBet Team',
        url: 'https://github.com/dioneyfroes-coder/backBet',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Desenvolvimento',
      },
      {
        url: 'https://api.backbet.com',
        description: 'Produção',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token ou User ID em desenvolvimento',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: 'cadaeb28-c7f7-425b-91f7-73a27141ae49',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            username: {
              type: 'string',
              example: 'joaosilva',
            },
            firstName: {
              type: 'string',
              example: 'João',
            },
            lastName: {
              type: 'string',
              example: 'Silva',
            },
            status: {
              type: 'string',
              enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'],
              example: 'ACTIVE',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-11-14T23:20:42.778Z',
            },
          },
          required: ['id', 'email', 'username', 'status', 'createdAt'],
        },
        Wallet: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            userId: {
              type: 'string',
              format: 'uuid',
            },
            balance: {
              type: 'object',
              properties: {
                amount: {
                  type: 'number',
                  example: 1000.00,
                },
                currency: {
                  type: 'string',
                  example: 'BRL',
                },
              },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              minLength: 8,
              example: 'SecurePass@123',
            },
            firstName: {
              type: 'string',
              minLength: 2,
              example: 'João',
            },
            lastName: {
              type: 'string',
              minLength: 2,
              example: 'Silva',
            },
            username: {
              type: 'string',
              minLength: 3,
              pattern: '^[a-zA-Z0-9_]+$',
              example: 'joaosilva',
            },
          },
          required: ['email', 'password', 'firstName', 'lastName', 'username'],
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              properties: {
                accessToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                refreshToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                user: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
          example: {
            success: true,
            data: {
              accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
              refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example',
              user: {
                id: 'cadaeb28-c7f7-425b-91f7-73a27141ae49',
                email: 'user@example.com',
                username: 'joaosilva',
                firstName: 'João',
                lastName: 'Silva',
                status: 'PENDING_VERIFICATION',
                createdAt: '2025-11-14T23:20:42.778Z',
              },
            },
            meta: { timestamp: new Date().toISOString() },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'BAD_REQUEST',
                },
                message: {
                  type: 'string',
                  example: 'Dados inválidos',
                },
                details: {
                  type: 'object',
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'Dados inválidos',
              details: { username: 'Invalid input: expected string' },
            },
            meta: { timestamp: new Date().toISOString() },
          },
        },
        RegisterResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Usuário registrado com sucesso' },
                user: { $ref: '#/components/schemas/User' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
          example: {
            success: true,
            data: {
              message: 'Usuário registrado com sucesso',
              user: {
                id: 'cadaeb28-c7f7-425b-91f7-73a27141ae49',
                email: 'user@example.com',
                username: 'joaosilva',
                status: 'PENDING_VERIFICATION',
                createdAt: '2025-11-14T23:20:42.778Z',
              },
            },
            meta: { timestamp: '2025-11-14T23:20:42.778Z' },
          },
        },
        MeResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { $ref: '#/components/schemas/User' },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
          example: {
            success: true,
            data: {
              id: 'cadaeb28-c7f7-425b-91f7-73a27141ae49',
              email: 'user@example.com',
              username: 'joaosilva',
              firstName: 'João',
              lastName: 'Silva',
              status: 'ACTIVE',
              createdAt: '2025-11-14T23:20:42.778Z',
            },
            meta: { timestamp: '2025-11-14T23:21:06.343Z' },
          },
        },
        LogoutResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Logout realizado com sucesso' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
          example: {
            success: true,
            data: { message: 'Logout realizado com sucesso' },
            meta: { timestamp: '2025-11-14T23:22:00.000Z' },
          },
        },
        ConflictError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'CONFLICT' },
                message: { type: 'string', example: 'Email já cadastrado' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'CONFLICT',
              message: 'Email já cadastrado',
            },
            meta: { timestamp: '2025-11-14T23:20:00.000Z' },
          },
        },
        UnauthorizedError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'UNAUTHORIZED' },
                message: { type: 'string', example: 'Autenticação requerida' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
          example: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Autenticação requerida',
            },
            meta: { timestamp: '2025-11-14T23:21:00.000Z' },
          },
        },
        // Bets schemas
        PlaceBetRequest: {
          type: 'object',
          properties: {
            eventId: { type: 'string', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
            marketId: { type: 'string', example: 'market-123' },
            oddId: { type: 'string', example: 'odd-456' },
            amount: { type: 'number', example: 50.0, minimum: 0.01 },
            type: { type: 'string', enum: ['SINGLE', 'MULTIPLE'], example: 'SINGLE' },
            currency: { type: 'string', enum: ['BRL', 'USD', 'EUR'], example: 'BRL' },
          },
          required: ['eventId', 'marketId', 'oddId', 'amount'],
        },
        CancelBetRequest: {
          type: 'object',
          properties: {
            betId: { type: 'string', format: 'uuid', example: '7d9f6c2b-1b2a-4a8b-9c0d-123456789abc' },
            reason: { type: 'string', example: 'Erro no mercado' },
          },
          required: ['betId'],
        },
        BetResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '7d9f6c2b-1b2a-4a8b-9c0d-123456789abc' },
            userId: { type: 'string', format: 'uuid', example: 'cadaeb28-c7f7-425b-91f7-73a27141ae49' },
            eventId: { type: 'string', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
            marketId: { type: 'string', example: 'market-123' },
            amount: { type: 'number', example: 50.0 },
            odds: { type: 'number', example: 1.85 },
            potentialReturn: { type: 'number', example: 92.5 },
            status: { type: 'string', enum: ['PENDING', 'WON', 'LOST', 'CANCELED'], example: 'PENDING' },
            type: { type: 'string', example: 'SINGLE' },
            createdAt: { type: 'string', format: 'date-time', example: '2025-11-14T23:30:00.000Z' },
            resolvedAt: { type: 'string', format: 'date-time', nullable: true },
            cancellationReason: { type: 'string', nullable: true },
          },
        },
        BetListResponse: {
          type: 'object',
          properties: {
            bets: {
              type: 'array',
              items: { $ref: '#/components/schemas/BetResponse' },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Status do servidor',
      },
      {
        name: 'Auth',
        description: 'Autenticação e registro de usuários',
      },
      {
        name: 'Users',
        description: 'Gerenciamento de usuários',
      },
      {
        name: 'Wallets',
        description: 'Gerenciamento de carteiras',
      },
      {
        name: 'Bets',
        description: 'Gerenciamento de apostas',
      },
    ],
  },
  apis: [
    './src/infrastructure/api/routes/*.ts',
    './src/infrastructure/api/controllers/*.ts',
  ],
};

/**
 * Especificação OpenAPI gerada
 */
export const swaggerSpec = swaggerJsdoc(swaggerOptions);
