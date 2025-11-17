# ERROS (AppError) — BackBet

Esta página descreve os erros padronizados usados pela API BackBet. A aplicação lança erros estruturados usando a classe `AppError` com os campos `code`, `message`, `statusCode` e (`details` opcional).

Formato padrão de resposta de erro

```json

    "details": { "campo": "mensagem de validação" }
  },
  "meta": { "timestamp": "2025-11-15T12:00:00.000Z" }
}
```

Principais códigos (lista e mapeamento HTTP)

- `VALIDATION_ERROR` — 400
  - Uso: erros de validação de entrada (Zod). `details` contém um objeto campo → mensagem.
- `BAD_REQUEST` — 400
  - Uso: requisições malformadas ou regras de negócio violadas (ex.: atualizar recurso inválido).
- `UNAUTHORIZED` — 401
  - Uso: token ausente/expirado ou credenciais inválidas.
- `FORBIDDEN` — 403
  - Uso: usuário sem permissão para executar a ação.
- `NOT_FOUND` — 404
  - Uso: recurso não encontrado (usuário, carteira, aposta, evento).
- `CONFLICT` — 409
  - Uso: conflitos, por exemplo email já cadastrado.
- `RATE_LIMIT_EXCEEDED` — 429
  - Uso: política de rate limiting violada. Pode incluir `retryAfter` em `error.details`.
- `INTERNAL_SERVER_ERROR` — 500
  - Uso: erro inesperado no servidor.

Exemplos

- Validação falhou (400 / `VALIDATION_ERROR`)

```json

    "details": { "email": "Formato inválido", "username": "Obrigatório" }
  },
  "meta": { "timestamp": "2025-11-15T12:01:00.000Z" }
}
```

- Conflito (409 / `CONFLICT`)

```json

  },
  "meta": { "timestamp": "2025-11-15T12:02:00.000Z" }
}
```

- Rate limit (429 / `RATE_LIMIT_EXCEEDED`)

```json

    "details": { "retryAfter": 60 }
  }
}
```

Como documentar no OpenAPI

- `components.schemas.ErrorResponse` : já existe e descreve `error.code`, `error.message` e `error.details`.
- Use `ValidationError` para descrever o formato de `details` quando for um mapa campo→mensagem.

Boas práticas para desenvolvedores

- Sempre lance `AppError` no domínio em vez de `throw new Error(...)`.
- Controllers não devem capturar erros — deixe o middleware global formatar a resposta.
- Ao retornar `details`, mantenha apenas informações necessárias (não exponha stacks ou segredos).

Arquivo relacionado: `src/shared/errors/AppError.ts`
