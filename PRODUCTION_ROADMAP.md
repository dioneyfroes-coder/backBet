# 🚀 Roadmap de Produção - BackBet

## Cronograma de Entregas até Lançamento v1.0.0

---

## 📅 Sprint 1: API REST & Autenticação (Semana 1-2)

### Objetivos
- [ ] Implementar API REST com Express/Fastify
- [ ] Setup de autenticação JWT
- [ ] Validação de requisições

### Tarefas

#### 1.1 Setup Express API
```
[ ] Criar server.ts com Express setup
[ ] Configurar middleware: cors, helmet, json, error handler
[ ] Implementar health check endpoint
[ ] Estruturar base controller abstrato
```

#### 1.2 Controllers de Autenticação
```
[ ] POST /auth/register - Criar conta
    ├─ Validar email
    ├─ Hash password (bcrypt)
    ├─ Criar usuário via RegisterUser use case
    ├─ Gerar JWT token
    └─ Retornar user + token

[ ] POST /auth/login - Autenticar
    ├─ Validar credenciais
    ├─ Gerar JWT token
    └─ Retornar token + user

[ ] POST /auth/refresh - Renovar token
    ├─ Validar refresh token
    └─ Gerar novo access token

[ ] POST /auth/logout - Sair
    ├─ Invalidar token (blacklist)
```

#### 1.3 Controllers de Usuário
```
[ ] GET /users/me - Perfil do usuário
    ├─ Requer autenticação
    ├─ Buscar do contexto da requisição
    └─ Retornar dados do usuário

[ ] PATCH /users/me - Atualizar perfil
    ├─ Validar dados
    ├─ Atualizar via UserService
    └─ Retornar usuário atualizado

[ ] PATCH /users/me/email - Alterar email
    ├─ Validar novo email
    ├─ Enviar confirmação (opcional)
    └─ Atualizar email
```

#### 1.4 Validação de Requisições
```
[ ] Criar schema validators (Joi ou Zod)
    ├─ RegisterDTO schema
    ├─ LoginDTO schema
    ├─ UpdateUserDTO schema
    └─ UpdateEmailDTO schema

[ ] Implementar middleware de validação
    ├─ Validar body
    ├─ Validar params
    └─ Validar query
```

#### 1.5 Testes de Integração
```
[ ] Testes E2E para autenticação
    ├─ POST /auth/register sucesso
    ├─ POST /auth/register - email duplicado
    ├─ POST /auth/login sucesso
    ├─ POST /auth/login - credenciais inválidas
    └─ GET /users/me - sem token (403)
```

---

## 📅 Sprint 2: Banco de Dados & Persistência (Semana 2-3)

### Objetivos
- [ ] Implementar camada de persistência
- [ ] Setup PostgreSQL com TypeORM/Prisma
- [ ] Migrations e seeders

### Tarefas

#### 2.1 Configuração do Banco
```
[ ] Setup PostgreSQL connection
    ├─ Connection string via env
    ├─ Connection pooling (max 20 connections)
    ├─ Retry logic

[ ] Escolher ORM (TypeORM ou Prisma)
    ├─ Instalar dependências
    ├─ Criar data source/client
    ├─ Configurar para strict mode
```

#### 2.2 Implementar Repositórios
```
[ ] UserRepository (TypeORM/Prisma)
    ├─ findById(id)
    ├─ findByEmail(email) - para login
    ├─ save(user)
    ├─ update(user)
    └─ delete(id)

[ ] WalletRepository
    ├─ findByUserId(userId)
    ├─ save(wallet)
    ├─ update(wallet)
    └─ delete(id)

[ ] BetRepository
    ├─ findById(id)
    ├─ findByUserId(userId, paginated)
    ├─ findByEventId(eventId)
    ├─ save(bet)
    ├─ update(bet)
    └─ delete(id)

[ ] EventRepository
    ├─ findById(id)
    ├─ findByStatus(status, paginated)
    ├─ findByCategory(category, paginated)
    ├─ findUpcoming()
    ├─ save(event)
    ├─ update(event)
    └─ delete(id)
```

#### 2.3 Migrations
```
[ ] Migration 001: Create Users table
    ├─ id UUID PRIMARY KEY
    ├─ email VARCHAR UNIQUE
    ├─ username VARCHAR UNIQUE
    ├─ password_hash VARCHAR
    ├─ status ENUM (ACTIVE, SUSPENDED, PENDING_VERIFICATION)
    ├─ created_at TIMESTAMP DEFAULT NOW()
    ├─ updated_at TIMESTAMP DEFAULT NOW()
    └─ version INT DEFAULT 1

[ ] Migration 002: Create Wallets table
    ├─ id UUID PRIMARY KEY
    ├─ user_id UUID FOREIGN KEY
    ├─ balance DECIMAL(20,2)
    ├─ locked_balance DECIMAL(20,2)
    ├─ currency VARCHAR (BRL, USD, EUR)
    ├─ created_at TIMESTAMP
    ├─ updated_at TIMESTAMP
    └─ version INT

[ ] Migration 003: Create Events table
    ├─ id UUID PRIMARY KEY
    ├─ title VARCHAR
    ├─ description TEXT
    ├─ category VARCHAR (FOOTBALL, TENNIS, etc)
    ├─ status ENUM (SCHEDULED, LIVE, FINISHED, CANCELED)
    ├─ scheduled_at TIMESTAMP
    ├─ started_at TIMESTAMP
    ├─ finished_at TIMESTAMP
    ├─ created_at TIMESTAMP
    ├─ updated_at TIMESTAMP
    └─ version INT

[ ] Migration 004: Create Bets table
    ├─ id UUID PRIMARY KEY
    ├─ user_id UUID FOREIGN KEY
    ├─ event_id UUID FOREIGN KEY
    ├─ market_id VARCHAR
    ├─ amount DECIMAL(20,2)
    ├─ odds DECIMAL(10,2)
    ├─ potential_return DECIMAL(20,2)
    ├─ status ENUM (PENDING, WON, LOST, CANCELED)
    ├─ result_value DECIMAL(20,2) NULL
    ├─ placed_at TIMESTAMP
    ├─ resolved_at TIMESTAMP NULL
    ├─ created_at TIMESTAMP
    ├─ updated_at TIMESTAMP
    └─ version INT

[ ] Criar script de rollback para cada migration
```

#### 2.4 Seeders
```
[ ] Seeder de usuários (10 usuários teste)
    ├─ emails diversos
    ├─ senhas hasheadas
    └─ status ACTIVE

[ ] Seeder de eventos (20 eventos)
    ├─ Mix de SCHEDULED, LIVE, FINISHED
    ├─ Diferentes categorias
    └─ Datas distribuídas

[ ] Seeder de carteiras
    ├─ Para cada usuário
    ├─ Saldos iniciais diversos
    └─ Moedas BRL/USD

[ ] Script de limpeza (DROP all tables)
```

#### 2.5 Testes
```
[ ] Testes de repositório com BD real
    ├─ Testes transacionais (rollback após teste)
    ├─ Validar índices
    ├─ Performance queries
```

---

## 📅 Sprint 3: Controllers de Finanças & Apostas (Semana 3-4)

### Objetivos
- [ ] Implementar controllers de wallet
- [ ] Implementar controllers de bets
- [ ] Validação de business rules

### Tarefas

#### 3.1 Controllers de Wallet
```
[ ] GET /wallets/me - Saldo do usuário autenticado
    ├─ Requer autenticação
    ├─ Retornar: balance, lockedBalance, currency
    └─ Testes: com token, sem token

[ ] POST /wallets/deposit - Depositar fundos
    ├─ Requer autenticação
    ├─ Body: { amount: number, currency: string }
    ├─ Validar:
    │  ├─ amount > 0
    │  ├─ currency suportada (BRL, USD, EUR)
    │  └─ Limite máximo de deposição
    ├─ Chamar DepositFunds use case
    ├─ Retornar novo saldo
    └─ Testes: sucesso, validação falha, usuário não encontrado

[ ] POST /wallets/withdraw - Sacar fundos
    ├─ Requer autenticação
    ├─ Body: { amount: number }
    ├─ Validar:
    │  ├─ amount > 0
    │  ├─ balance suficiente
    │  └─ Sem apostas bloqueadas
    ├─ Chamar WithdrawFunds use case
    ├─ Retornar novo saldo
    └─ Testes: sucesso, saldo insuficiente, aposta pendente

[ ] GET /wallets/history - Histórico de transações
    ├─ Requer autenticação
    ├─ Query params: page, limit, type (deposit/withdraw)
    ├─ Retornar transações paginadas
    └─ Testes: paginação, filtro por tipo
```

#### 3.2 Controllers de Eventos
```
[ ] GET /events - Listar eventos
    ├─ Query params: 
    │  ├─ page, limit (paginação)
    │  ├─ status (SCHEDULED, LIVE, FINISHED)
    │  ├─ category (FOOTBALL, TENNIS, etc)
    │  └─ sort (asc/desc)
    ├─ Retornar eventos com odds
    └─ Testes: listagem, filtros, paginação

[ ] GET /events/:id - Detalhes do evento
    ├─ Retornar:
    │  ├─ Dados do evento
    │  ├─ Mercados disponíveis
    │  └─ Odds atualizadas
    └─ Testes: evento existe, não existe (404)

[ ] POST /events - Criar evento (ADMIN)
    ├─ Requer autenticação + role ADMIN
    ├─ Body: { title, description, category, scheduledAt }
    ├─ Validar datas (scheduledAt no futuro)
    └─ Retornar evento criado

[ ] PATCH /events/:id - Atualizar evento (ADMIN)
    ├─ Requer ADMIN
    ├─ Validar mudanças permitidas por status
    └─ Retornar evento atualizado

[ ] POST /events/:id/start - Iniciar evento (ADMIN)
    ├─ Mudar status para LIVE
    ├─ Lock de odds
    └─ Notificar apostadores

[ ] POST /events/:id/finish - Finalizar evento (ADMIN)
    ├─ Mudar status para FINISHED
    ├─ Requer resultado
    ├─ Acionar resolução de apostas
    └─ Notificar apostadores
```

#### 3.3 Controllers de Apostas
```
[ ] GET /bets - Listar apostas do usuário
    ├─ Requer autenticação
    ├─ Query params: page, limit, status
    ├─ Filtrar por usuário autenticado
    └─ Retornar apostas paginadas

[ ] GET /bets/:id - Detalhes da aposta
    ├─ Requer autenticação
    ├─ Validar permissão (só pode ver próprias apostas)
    ├─ Retornar:
    │  ├─ Dados da aposta
    │  ├─ Evento relacionado
    │  └─ Status e resultado
    └─ Testes: aposta existe, usuário diferente (403)

[ ] POST /bets - Colocar aposta
    ├─ Requer autenticação
    ├─ Body: { eventId, marketId, amount, odds }
    ├─ Validar:
    │  ├─ Evento existe e está SCHEDULED
    │  ├─ Aposta amount > 0 e <= balance
    │  ├─ Odds > 1
    │  └─ Usuário não bloqueado
    ├─ Chamar PlaceBetUseCase
    ├─ Bloquear fundos via WalletService.lock()
    ├─ Retornar aposta criada
    └─ Testes: sucesso, saldo insuficiente, evento inválido

[ ] POST /bets/:id/cancel - Cancelar aposta
    ├─ Requer autenticação
    ├─ Validar:
    │  ├─ Aposta pertence ao usuário
    │  ├─ Status é PENDING
    │  └─ Evento ainda SCHEDULED
    ├─ Chamar CancelBetUseCase
    ├─ Desbloquear fundos via WalletService.unlock()
    ├─ Retornar aposta cancelada
    └─ Testes: sucesso, aposta já resolvida (409)

[ ] GET /events/:id/odds - Odds para evento
    ├─ Retornar odds dos mercados
    ├─ Atualizar em tempo real (WebSocket future)
    └─ Testes: evento existe, não existe
```

#### 3.4 Testes de Integração
```
[ ] E2E: Fluxo completo de aposta
    ├─ Registrar usuário
    ├─ Depositar fundos
    ├─ Criar evento
    ├─ Colocar aposta
    ├─ Iniciar evento
    ├─ Finalizar evento
    ├─ Resolver aposta
    └─ Verificar novo saldo

[ ] E2E: Cancelamento de aposta
    ├─ Colocar aposta
    ├─ Cancelar aposta
    └─ Verificar fundos desbloqueados

[ ] E2E: Múltiplas apostas simultaneamente
    ├─ Colocar 5 apostas diferentes
    ├─ Validar lock de fundos
    ├─ Resolver uma aposta
    └─ Validar apenas um premio
```

---

## 📅 Sprint 4: Cache & Performance (Semana 4-5)

### Objetivos
- [ ] Implementar Redis cache
- [ ] Otimizar queries
- [ ] Rate limiting

### Tarefas

#### 4.1 Redis Setup
```
[ ] Instalar Redis client (ioredis)
[ ] Configurar conexão
[ ] Estratégia de TTL por tipo:
    ├─ Events: 5 minutos
    ├─ User profile: 10 minutos
    ├─ Odds: 1 minuto (real-time)
    ├─ Transactions: 1 hora
    └─ Session tokens: 24 horas (refresh)
```

#### 4.2 Cache Strategies
```
[ ] Cache de Eventos
    ├─ GET /events/:id
    ├─ GET /events (com filtros)
    ├─ Invalidar ao atualizar evento

[ ] Cache de Odds
    ├─ GET /events/:id/odds
    ├─ TTL muito curto (1 min)
    └─ Buscar sempre do mercado de odds

[ ] Cache de Wallet
    ├─ GET /wallets/me
    ├─ Invalidar ao depositar/sacar
    └─ TTL: 5 minutos (consistência eventual)

[ ] Rate Limiting
    ├─ Global: 1000 req/min
    ├─ Per user: 100 req/min
    ├─ Per endpoint sensível:
    │  ├─ /bets: 10 req/min
    │  ├─ /wallets/deposit: 5 req/min
    │  └─ /wallets/withdraw: 5 req/min
```

#### 4.3 Database Optimization
```
[ ] Criar índices
    ├─ users.email
    ├─ users.username
    ├─ wallets.user_id
    ├─ bets.user_id
    ├─ bets.event_id
    ├─ bets.status
    ├─ events.category
    ├─ events.status
    └─ events.scheduled_at

[ ] Query optimization
    ├─ Usar SELECT específico (não *)
    ├─ Eager loading de relações
    ├─ Pagination sempre
    └─ Evitar N+1 queries

[ ] Connection pooling
    ├─ Min: 5, Max: 20 conexões
    ├─ Idle timeout: 30s
```

#### 4.4 Testes de Performance
```
[ ] Load testing com k6
    ├─ 100 usuários simultâneos
    ├─ Duração: 5 minutos
    ├─ Métricas:
    │  ├─ P95 latency < 200ms
    │  ├─ P99 latency < 500ms
    │  └─ Error rate < 0.1%

[ ] Stress testing
    ├─ 1000 usuários
    ├─ Encontrar limite de quebra
    ├─ Documentar breaking point
```

---

## 📅 Sprint 5: Logging & Observabilidade (Semana 5-6)

### Objetivos
- [ ] Implementar logging estruturado
- [ ] Setup de tracing
- [ ] Health checks e métricas

### Tarefas

#### 5.1 Logging Estruturado
```
[ ] Instalar Winston ou Pino
[ ] Configurar níveis:
    ├─ ERROR: Erros críticos, alertar
    ├─ WARN: Avisos, possíveis problemas
    ├─ INFO: Informações importantes
    ├─ DEBUG: Detalhes de execução
    └─ TRACE: Tudo (desenvolvimento)

[ ] Log estruturado por tipo:
    ├─ Autenticação (login, token, refresh)
    ├─ Transações financeiras (deposit, withdraw)
    ├─ Apostas (criação, cancelamento, resolução)
    ├─ Eventos (criação, atualização de status)
    ├─ Erros (stack trace, contexto)
    └─ Performance (query time, cache hits)

[ ] Implementar correlationId
    ├─ Gerar por requisição
    ├─ Propagar em chamadas internas
    └─ Incluir em todos os logs
```

#### 5.2 Health Checks
```
[ ] GET /health - Status geral
    ├─ Status do servidor
    ├─ Status do banco de dados
    ├─ Status do Redis
    └─ Uptime

[ ] Implementar readiness check
    ├─ Usado pelo container orchestration
    ├─ Verificar todas as dependências
    └─ Retornar 503 se algum falhar

[ ] Implementar liveness check
    ├─ Verificar se processo está vivo
    ├─ Não validar dependências
```

#### 5.3 Métricas
```
[ ] Implementar Prometheus metrics
    ├─ http_requests_total (contador)
    ├─ http_request_duration_seconds (histograma)
    ├─ database_query_duration_seconds
    ├─ cache_hits_total / cache_misses_total
    ├─ active_connections (gauge)
    └─ bets_placed_total (contador de apostas)

[ ] Endpoints:
    ├─ GET /metrics - Prometheus format
    └─ GET /health/metrics - Dashboard
```

#### 5.4 Error Handling Global
```
[ ] Criar handler de exceções global
    ├─ Validar tipos de erro
    ├─ Log estruturado do erro
    ├─ Retornar erro seguro ao cliente
    └─ Monitorar erros críticos

[ ] Tipos de erro padronizados:
    ├─ ValidationError (400)
    ├─ UnauthorizedError (401)
    ├─ ForbiddenError (403)
    ├─ NotFoundError (404)
    ├─ ConflictError (409)
    ├─ InternalServerError (500)
    └─ ServiceUnavailableError (503)

[ ] Response padrão de erro:
    {
      "error": {
        "code": "ERROR_CODE",
        "message": "User friendly message",
        "statusCode": 400,
        "timestamp": "2025-11-14T10:30:00Z",
        "correlationId": "uuid-xxx"
      }
    }
```

---

## 📅 Sprint 6: Segurança & Compliance (Semana 6-7)

### Objetivos
- [ ] Implementar segurança OWASP
- [ ] Validação e sanitização
- [ ] Audit trail

### Tarefas

#### 6.1 Validação de Entradas
```
[ ] Implementar Zod schemas para todas as entradas
    ├─ Auth DTOs
    ├─ User DTOs
    ├─ Wallet DTOs
    ├─ Bet DTOs
    └─ Event DTOs

[ ] Validar em controllers antes de usar
[ ] Retornar erros descritivos
```

#### 6.2 Proteção OWASP Top 10
```
[ ] A01 - Broken Access Control
    ├─ Validar permissões em cada endpoint
    ├─ Implementar role-based access (RBAC)
    └─ Testes de autorização

[ ] A02 - Cryptographic Failures
    ├─ Hash de passwords (bcrypt com salt)
    ├─ JWT com secret forte
    ├─ HTTPS obrigatório (em produção)
    └─ Secrets em variáveis de ambiente

[ ] A03 - Injection
    ├─ Usar parameterized queries
    ├─ Validar e sanitizar inputs
    ├─ Validar query params

[ ] A04 - Insecure Design
    ├─ Implementar rate limiting
    ├─ Validação de quantidade de apostas
    └─ Limites de transações

[ ] A05 - Security Misconfiguration
    ├─ CORS configurado corretamente
    ├─ Headers de segurança (Helmet)
    ├─ Variáveis sensíveis em env
    └─ Desabilitar endpoints de debug

[ ] A06 - Vulnerable Components
    ├─ npm audit regularmente
    ├─ Atualizar dependências
    ├─ Monitorar CVEs

[ ] A07 - Identification and Authentication
    ├─ JWT com expiração (15min access, 7d refresh)
    ├─ MFA opcional (preparar estrutura)
    ├─ Logout real (blacklist token)
    └─ Password policy

[ ] A08 - Data Integrity Failures
    ├─ Versionamento de entidades
    ├─ Validar integridade de dados
    └─ Auditoria de mudanças

[ ] A09 - Logging and Monitoring
    ├─ Implementar em Sprint 5
    ├─ Alertas de atividades suspeitas
    └─ Retenção de logs

[ ] A10 - SSRF / XXE
    ├─ Validar URLs externas
    ├─ Desabilitar XML parsing
    └─ Isolamento de microsserviços
```

#### 6.3 Audit Trail
```
[ ] Criar tabela de auditoria
    ├─ entity_type, entity_id
    ├─ action (CREATE, UPDATE, DELETE)
    ├─ user_id, timestamp
    ├─ old_value, new_value
    └─ ip_address, user_agent

[ ] Implementar audit middleware
    ├─ Registrar mudanças de usuário
    ├─ Registrar transações financeiras
    ├─ Registrar apostas
    └─ Registrar eventos

[ ] Endpoint de auditoria (ADMIN)
    ├─ GET /audit - Listar com filtros
    └─ Testes de integridade
```

#### 6.4 Testes de Segurança
```
[ ] OWASP Testing Guide
    ├─ Injection tests
    ├─ XSS tests (mesmo em JSON)
    ├─ CSRF tests
    ├─ Auth tests
    └─ Access control tests

[ ] Scanning com OWASP ZAP
    ├─ Automated scanning
    ├─ Documentar findings
    └─ Remediate vulnerabilities
```

---

## 📅 Sprint 7: Deployment & DevOps (Semana 7-8)

### Objetivos
- [ ] Docker setup
- [ ] CI/CD pipeline
- [ ] Infrastructure as Code

### Tarefas

#### 7.1 Docker
```
[ ] Dockerfile multi-stage
    ├─ Stage 1: Build (compilar TS)
    ├─ Stage 2: Runtime (rodar Node)
    └─ Otimizações de imagem

[ ] docker-compose.yml
    ├─ Service: app
    ├─ Service: postgres
    ├─ Service: redis
    └─ Networks isoladas

[ ] .dockerignore
    ├─ node_modules
    ├─ dist
    ├─ .env local
    └─ logs

[ ] Build & push
    ├─ Docker image tagging
    ├─ Push para registry (Docker Hub / ECR)
```

#### 7.2 CI/CD Pipeline (GitHub Actions)
```
[ ] Workflow: Test & Lint
    ├─ Trigger: push para branch
    ├─ Node setup
    ├─ npm install
    ├─ npm run lint
    ├─ npm test
    └─ Upload coverage

[ ] Workflow: Build Docker
    ├─ Trigger: push para main
    ├─ Build image
    ├─ Push para registry
    ├─ Tag com versão + latest

[ ] Workflow: Deploy Staging
    ├─ Trigger: merge para main
    ├─ Deploy para staging
    ├─ Executar smoke tests
    ├─ Notificar resultado

[ ] Workflow: Deploy Production
    ├─ Trigger: release criada
    ├─ Deploy para produção
    ├─ Health checks
    ├─ Rollback automático se falhar
    └─ Slack notification
```

#### 7.3 Kubernetes (Opcional para escala)
```
[ ] deployment.yaml
    ├─ Replicas: 3
    ├─ Resource limits
    ├─ Liveness probe
    └─ Readiness probe

[ ] service.yaml
    ├─ Type: LoadBalancer
    ├─ Port mapping

[ ] configmap.yaml
    ├─ Non-sensitive config

[ ] secret.yaml (via sealed-secrets)
    ├─ Database credentials
    ├─ JWT secret
    └─ API keys
```

#### 7.4 Environment Management
```
[ ] .env.example
    ├─ Documentar todas as variáveis
    ├─ Valores de exemplo seguros
    └─ Comentários sobre cada uma

[ ] .env files por ambiente
    ├─ .env.local (desenvolvimento)
    ├─ .env.staging (staging)
    ├─ .env.production (produção)
    └─ .env.test (testes)

[ ] Secrets management
    ├─ Usar dotenv-safe
    ├─ Validar na startup
    ├─ Não logar valores sensíveis
```

---

## 📅 Sprint 8: Documentação & Release (Semana 8)

### Objetivos
- [ ] Documentação completa
- [ ] Release v1.0.0
- [ ] Plano de suporte

### Tarefas

#### 8.1 Documentação de API
```
[ ] Swagger/OpenAPI 3.0
    ├─ Todos os endpoints
    ├─ Modelos de requisição/resposta
    ├─ Exemplos
    ├─ Códigos de erro
    └─ Autenticação

[ ] GET /api-docs - Swagger UI
[ ] GET /api/openapi.json - OpenAPI spec

[ ] Postman collection
    ├─ Todas as requisições
    ├─ Variables por ambiente
    ├─ Testes básicos
    └─ Documentation
```

#### 8.2 Documentação de Setup
```
[ ] DEPLOYMENT.md
    ├─ Pré-requisitos
    ├─ Docker setup
    ├─ Variáveis de ambiente
    ├─ Database setup
    ├─ Migrations
    ├─ Health check
    └─ Troubleshooting

[ ] CONTRIBUTING.md
    ├─ Setup dev
    ├─ Padrões de código
    ├─ Workflow de branches
    ├─ Como fazer PR
    └─ Testes obrigatórios

[ ] ARCHITECTURE.md (atualizar)
    ├─ Adicionar infraestrutura
    ├─ Diagrama de deployment
    ├─ Fluxos de integração entre núcleos
```

#### 8.3 Release v1.0.0
```
[ ] Versioning (semver)
    ├─ Tag no git: v1.0.0
    ├─ Release notes
    ├─ Changelog
    └─ Breaking changes document

[ ] Release checklist
    ├─ Testes: 100% passing
    ├─ Lint: Zero warnings
    ├─ Build: Zero errors
    ├─ Coverage: >= 90%
    ├─ Security: Audit passed
    ├─ Performance: Benchmarks OK
    ├─ Documentação: Completa
    └─ Migração de dados: Tested

[ ] Release notes template
    ├─ Features adicionadas
    ├─ Bugs corrigidos
    ├─ Breaking changes
    ├─ Dependências atualizadas
    ├─ Performance improvements
    └─ Security updates
```

#### 8.4 Plano Pós-Lançamento
```
[ ] Monitoramento em produção
    ├─ Dashboards Grafana
    ├─ Alertas críticos
    ├─ On-call rotation
    └─ Incident response plan

[ ] SLAs (Service Level Agreements)
    ├─ Uptime: 99.9%
    ├─ Response time: P95 < 500ms
    ├─ Error rate: < 0.1%
    └─ Recovery time: < 1 hora

[ ] Roadmap futuro
    ├─ Features v1.1
    ├─ Melhorias de performance
    ├─ Mobile app
    ├─ Live streaming
    ├─ In-play betting
    └─ Machine learning para odds
```

---

## 🎯 Checkpoints de Qualidade

### Antes de cada Sprint
- [ ] Testes passando 100%
- [ ] Lint zero warnings
- [ ] Build sem erros
- [ ] Coverage >= 90%
- [ ] Documentação atualizada

### Antes de Produção
- [ ] Security audit passed
- [ ] Performance benchmarks OK
- [ ] Load tests passed
- [ ] Disaster recovery tested
- [ ] Rollback plan documented

---

## 📊 Métricas de Sucesso

| Métrica | Alvo | Sprint Alvo |
|---------|------|------------|
| Test Coverage | >= 90% | S2 |
| API Response Time (P95) | < 200ms | S4 |
| API Response Time (P99) | < 500ms | S4 |
| Error Rate | < 0.1% | S5 |
| Uptime | > 99.9% | S7 |
| Security Vulnerabilities | 0 Critical | S6 |
| Build Time | < 5min | S7 |
| Deployment Time | < 10min | S7 |

---

## 🚨 Riscos e Mitigation

| Risco | Impacto | Probabilidade | Mitigation |
|-------|---------|--------------|-----------|
| Database performance | Alto | Média | Índices, query opt, caching |
| Authentication breaches | Crítico | Baixa | Rate limiting, MFA, audit |
| Data loss | Crítico | Baixa | Backups, disaster recovery |
| Third-party API failure | Médio | Média | Circuit breaker, fallbacks |
| Scope creep | Médio | Alta | Sprint planning rigoroso |

---

## ✅ Conclusão

Este roadmap detalha as 8 sprints necessárias para levar o BackBet à produção com qualidade, segurança e performance. Cada sprint é incremental e pode ser ajustado conforme necessário.

**Próxima Ação:** Iniciar Sprint 1 com implementação de Express API e autenticação JWT.

**Versão:** 1.0 | **Atualizado:** 14 de Novembro de 2025
