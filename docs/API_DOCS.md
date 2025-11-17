Documentação de Endpoints - BackBet API

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

}
```

### `GET /readiness`
Verificar se aplicação está pronta para receber requisições

**Resposta (200):**
```json

}
```

---

## Autenticação (`/auth`)

### `POST /auth/register`
Registra novo usuário

**Request:**
```json

  "lastName": "Silva"
}
```

**Success (201):**
```json

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

  }
}
```

---

### `POST /auth/login`
Autentica usuário (via Clerk OAuth)

**Note:** Login é feito no cliente via Clerk SDK

**Response:**
```json

  }
}
```

---

### `GET /auth/me`
Retorna dados do usuário autenticado

**Headers:**
```
Authorization: Bearer
```

**Success (200):**
```json

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
Authorization: Bearer
```

**Success (200):**
```json

}
```

---

### `POST /auth/refresh`
Renova access token (Clerk)

**Request:**
```json

}
```

**Success (200):**
```json

}
```

---

## Usuários (`/users`) - Em Desenvolvimento

### `GET /users/me`
Perfil do usuário autenticado

**Headers:**
```
Authorization: Bearer
```

### `PATCH /users/me`
Atualizar perfil

### `PATCH /users/me/email`
Alterar email

---

## Carteiras (`/wallets`) - Em Desenvolvimento

### `GET /wallets/me`
Saldo da carteira do usuário

**Exemplo de histórico de transações (GET /wallets/history):**

```json

        "id": "a1b2c3d4-...",
        "type": "DEPOSIT",
        "amount": 100.0,
        "currency": "BRL",
        "description": "Depósito via cartão",
        "createdAt": "2025-11-14T12:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

### `POST /wallets/deposit`
Depositar fundos

**Request:**
```json

}
```

**Success (200):**
```json

      "id": "a1b2c3d4-...",
      "type": "DEPOSIT",
      "amount": 100.5,
      "currency": "BRL",
      "description": "Depósito via cartão",
      "createdAt": "2025-11-14T12:00:00.000Z"
    }
  },
  "meta": { "timestamp": "2025-11-14T12:00:00.000Z" }
}
```

### `POST /wallets/withdraw`
Sacar fundos

**Request:**
```json

}
```

**Success (200):**
```json

      "id": "d4c3b2a1-...",
      "type": "WITHDRAW",
      "amount": 50.0,
      "currency": "BRL",
      "description": "Saque para conta bancária",
      "createdAt": "2025-11-14T13:00:00.000Z"
    }
  },
  "meta": { "timestamp": "2025-11-14T13:00:00.000Z" }
}
```

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

**Success (200):**
```json

        "id": "7d9f6c2b-1b2a-4a8b-9c0d-123456789abc",
        "userId": "cadaeb28-c7f7-425b-91f7-73a27141ae49",
        "eventId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "marketId": "market-123",
        "amount": 50.0,
        "odds": 1.85,
        "potentialReturn": 92.5,
        "status": "PENDING",
        "type": "SINGLE",
        "createdAt": "2025-11-14T23:30:00.000Z"
      }
    ]
  },
  "meta": { "timestamp": "2025-11-14T23:30:00.000Z" }
}
```

### `GET /bets/:id`
Detalhes da aposta

**Success (200):**
```json

      "userId": "cadaeb28-c7f7-425b-91f7-73a27141ae49",
      "eventId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "marketId": "market-123",
      "amount": 50.0,
      "odds": 1.85,
      "potentialReturn": 92.5,
      "status": "PENDING",
      "type": "SINGLE",
      "createdAt": "2025-11-14T23:30:00.000Z"
    }
  },
  "meta": { "timestamp": "2025-11-14T23:30:00.000Z" }
}
```

### `POST /bets`
Colocar aposta

**Request:**
```json

  "type": "SINGLE",
  "currency": "BRL"
}
```

**Success (201):**
```json

      "userId": "cadaeb28-c7f7-425b-91f7-73a27141ae49",
      "eventId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "marketId": "market-123",
      "amount": 50.0,
      "odds": 1.85,
      "potentialReturn": 92.5,
      "status": "PENDING",
      "type": "SINGLE",
      "createdAt": "2025-11-14T23:30:00.000Z"
    }
  },
  "meta": { "timestamp": "2025-11-14T23:30:00.000Z" }
}
```

### `POST /bets/:id/cancel`
Cancelar aposta

---

## Error Responses

### Padrão de Erro

```json

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

    "details": { "retryAfter": 60 }
  },
  "meta": { "timestamp": "2025-11-14T10:30:00.000Z" }
}
```

---

## Autenticação

Todos os endpoints protegidos requerem:

**Header:**
```
Authorization: Bearer
```

**Tokens suportados:**
- JWT do Clerk (fase atual)
- JWT próprio (fase 2)

---

## Exemplos com cURL

### Registrar usuário
```bash

    "username": "testuser",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### Obter perfil
```bash

```

### Fazer logout
```bash

```

---

## Exemplos com Postman

1. Importar collection:
   - File → Import → [API_COLLECTION.json]

2. Configurar ambiente:
   - Token: {}
   - Base URL: {}

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
