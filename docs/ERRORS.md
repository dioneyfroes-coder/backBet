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

- `VALIDATION_ERROR` — 400
  - Usage: Input validation failures (Zod). `details` contains a field → message map.
- `BAD_REQUEST` — 400
  - Usage: Malformed request or business rule violation (e.g. insufficient funds).
- `UNAUTHORIZED` — 401
  - Usage: Missing/invalid authentication token.
- `FORBIDDEN` — 403
  - Usage: Authenticated user lacks permission to perform the action.
- `NOT_FOUND` — 404
  - Usage: Resource not found (user, wallet, bet, event).
- `CONFLICT` — 409
  - Usage: Resource conflict (e.g. duplicate email).
- `RATE_LIMIT_EXCEEDED` — 429
  - Usage: Rate limiting policy exceeded. May include `retryAfter` inside `error.details`.
- `INTERNAL_SERVER_ERROR` — 500
  - Usage: Unexpected server error.

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
