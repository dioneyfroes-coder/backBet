# ERROR CODES (AppError) — BackBet

This document lists standardized errors used by the BackBet API. The application raises structured errors using the `AppError` class with fields `code`, `message`, `statusCode` and optional `details`.

Standard response format

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Human readable error message",
    "details": { "field": "validation message" }
  },
  "meta": { "timestamp": "2025-11-15T12:00:00.000Z" }
}
```

Primary error codes and HTTP mapping

| Code | HTTP | Usage |
|------|------|-------|
| `VALIDATION_ERROR` | 400 | Input validation failures (Zod, value-object checks). `details` contains field → message map. |
| `BAD_REQUEST` | 400 | Business rule violation (e.g. insufficient funds, market closed, user suspended). |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token. |
| `FORBIDDEN` | 403 | Authenticated user lacks permission. |
| `NOT_FOUND` | 404 | Resource not found (user, wallet, bet, event, market, odd). |
| `CONFLICT` | 409 | Resource conflict (e.g. duplicate email, wallet already exists). |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limiting policy exceeded. May include `retryAfter` in `error.details`. |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error. |

### Real occurrences in codebase

Based on a scan of `src/`, the error codes are primarily thrown in:

- **VALIDATION_ERROR**: Email format, bet amounts, odds, event/market/bet ID validation, Money operations, currency validation.
- **BAD_REQUEST**: Insufficient funds, market/event state violations (closed, suspended, non-pending bet, etc.), negative operations, state mismatches.
- **NOT_FOUND**: User not found, wallet not found, bet not found, event not found, market not found, odd not found.
- **CONFLICT**: Email already exists, wallet already exists for user.
- **UNAUTHORIZED**: (Currently via middleware; not explicitly thrown in domain code.)
- **FORBIDDEN**: (Currently via middleware; not explicitly thrown in domain code.)
- **RATE_LIMIT_EXCEEDED**: (To be implemented via rate-limiting middleware.)

Examples

- Validation failed (400 / `VALIDATION_ERROR`)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { "email": "Invalid email format", "username": "Required" }
  },
  "meta": { "timestamp": "2025-11-15T12:01:00.000Z" }
}
```

- Conflict (409 / `CONFLICT`)

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Email already exists"
  },
  "meta": { "timestamp": "2025-11-15T12:02:00.000Z" }
}
```

- Rate limit (429 / `RATE_LIMIT_EXCEEDED`)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": { "retryAfter": 60 }
  },
  "meta": { "timestamp": "2025-11-15T12:03:00.000Z" }
}
```

How this maps to OpenAPI

- `components.schemas.ErrorResponse` in `src/infrastructure/config/swagger.ts` already describes the top-level structure (`error.code`, `error.message`, `error.details`).
- Use the `ValidationError` schema for `error.details` when applicable.

Developer guidelines

- Throw `AppError` from domain/use-case code instead of `throw new Error(...)`.
- Keep controllers thin; allow errors to bubble to the global error handler which formats responses consistently.
- Avoid including stack traces or sensitive information in `details`.

See also: `src/shared/errors/AppError.ts` for the canonical error class implementation.
