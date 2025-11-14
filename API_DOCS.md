# 📚 Documentação de Endpoints - BackBet API

## Base URL

```
Desenvolvimento:  http://localhost:3000/api
Produção:        https://api.backbet.com/api
```

## Health Checks

### `GET /health`
Status geral da aplicação

**Resposta (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-14T10:30:00.000Z",
  "uptime": 3600.5
}
```

### `GET /readiness`
Verificar se aplicação está pronta para receber requisições

**Resposta (200):**
```json
{
  "ready": true
}
```

---

## Autenticação (`/auth`)

### `POST /auth/register`
Registra novo usuário

**Request:**
```json
{
  "email": "usuario@example.com",
  "password": "senhaForte123!",
  "username": "usuario_123",
  "firstName": "João",
  "lastName": "Silva"
}
```

**Success (201):**
```json
{
  "success": true,
  "data": {
    "message": "Usuário registrado com sucesso",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "usuario@example.com",
      "username": "usuario_123",
      "status": "PENDING_VERIFICATION",
      "createdAt": "2025-11-14T10:30:00.000Z"
    }
  }
}
```

**Errors:**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Email já cadastrado",
    "statusCode": 409
  }
}
```

---

### `POST /auth/login`
Autentica usuário (via Clerk OAuth)

**Note:** Login é feito no cliente via Clerk SDK

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_METHOD_CLERK",
    "message": "Login deve ser feito via Clerk OAuth"
  }
}
```

---

### `GET /auth/me`
Retorna dados do usuário autenticado

**Headers:**
```
Authorization: Bearer <clerk_token>
```

**Success (200):**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "usuario@example.com",
    "username": "usuario_123",
    "firstName": "João",
    "lastName": "Silva",
    "status": "ACTIVE",
    "createdAt": "2025-11-14T10:00:00.000Z"
  }
}
```

**Errors:**
- `401 Unauthorized` - Token ausente ou expirado
- `404 Not Found` - Usuário não encontrado

---

### `POST /auth/logout`
Faz logout

**Headers:**
```
Authorization: Bearer <clerk_token>
```

**Success (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logout realizado com sucesso"
  }
}
```

---

### `POST /auth/refresh`
Renova access token (Clerk)

**Request:**
```json
{
  "refreshToken": "refresh_token_aqui"
}
```

**Success (200):**
```json
{
  "success": true,
  "data": {
    "message": "Refresh via Clerk OAuth necessário"
  }
}
```

---

## Usuários (`/users`) - Em Desenvolvimento

### `GET /users/me`
Perfil do usuário autenticado

**Headers:**
```
Authorization: Bearer <token>
```

### `PATCH /users/me`
Atualizar perfil

### `PATCH /users/me/email`
Alterar email

---

## Carteiras (`/wallets`) - Em Desenvolvimento

### `GET /wallets/me`
Saldo da carteira do usuário

### `POST /wallets/deposit`
Depositar fundos

### `POST /wallets/withdraw`
Sacar fundos

### `GET /wallets/history`
Histórico de transações

---

## Eventos (`/events`) - Em Desenvolvimento

### `GET /events`
Listar eventos disponíveis

### `GET /events/:id`
Detalhes do evento

### `GET /events/:id/odds`
Odds de um evento

---

## Apostas (`/bets`) - Em Desenvolvimento

### `GET /bets`
Listar apostas do usuário

### `GET /bets/:id`
Detalhes da aposta

### `POST /bets`
Colocar aposta

### `POST /bets/:id/cancel`
Cancelar aposta

---

## Error Responses

### Padrão de Erro

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Descrição do erro",
    "statusCode": 400,
    "details": {
      "field": "Detalhes específicos"
    }
  },
  "meta": {
    "timestamp": "2025-11-14T10:30:00.000Z"
  }
}
```

### Códigos de Erro

| Code | Status | Significado |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Dados inválidos |
| `UNAUTHORIZED` | 401 | Autenticação necessária |
| `FORBIDDEN` | 403 | Acesso negado |
| `NOT_FOUND` | 404 | Recurso não encontrado |
| `CONFLICT` | 409 | Conflito (ex: email duplicado) |
| `INTERNAL_SERVER_ERROR` | 500 | Erro no servidor |

---

## Rate Limiting

### Limites Globais
- **Global:** 1000 requisições/minuto
- **Por usuário:** 100 requisições/minuto

### Limites por Endpoint
```
POST /auth/register    → 5 requisições/hora
POST /auth/login       → 10 requisições/minuto
POST /wallets/deposit  → 5 requisições/minuto
POST /wallets/withdraw → 5 requisições/minuto
POST /bets            → 10 requisições/minuto
```

**Headers de Rate Limit:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1731489000
```

**Erro 429 (Too Many Requests):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Limite de requisições atingido",
    "statusCode": 429,
    "retryAfter": 60
  }
}
```

---

## Autenticação

Todos os endpoints protegidos requerem:

**Header:**
```
Authorization: Bearer <token>
```

**Tokens suportados:**
- JWT do Clerk (fase atual)
- JWT próprio (fase 2)

---

## Exemplos com cURL

### Registrar usuário
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!",
    "username": "testuser",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### Obter perfil
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Fazer logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

---

## Exemplos com Postman

1. Importar collection:
   - File → Import → [API_COLLECTION.json](#)

2. Configurar ambiente:
   - Token: {{ clerk_token }}
   - Base URL: {{ api_url }}

3. Executar requests com auth automática

---

## Versionamento de API

Versão atual: **v1**

Futuro:
- `GET /v2/events` - Quebras de compatibilidade
- `GET /v1/events` - Versão legada

---

**Última atualização:** 14 de Novembro de 2025
**Status:** Sprint 1 - Em Desenvolvimento
