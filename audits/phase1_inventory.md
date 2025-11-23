# Phase 1 — Module Inventory & Risk Log

> Snapshot generated on 22 Nov 2025 while executing Step 1 of `tasks_breakdown.txt`

## core/user (`src/core/user`)
- **Scope**: User entity/value-objects (`domain/entities/User.ts`, `domain/value-objects/Email.ts`), business services (`domain/services/UserService.ts`), auth/register use-cases (`application/use-cases`), and config (`config/user-config.ts`). Register flow (`application/use-cases/RegisterUser.ts`) also orchestrates wallet provisioning across bounded contexts.
- **Risks / Gaps**
  - Repository default is in-memory (`domain/repositories/UserRepository.ts`); persistence flips to Mongo only if `USE_MONGOOSE_PERSISTENCE=true`, so production data would be lost across restarts by default.
  - `RegisterUser.execute` creates the user and only then calls `WalletService.createWallet`; if wallet creation throws (e.g., Redis/network issues), the user remains stored without a wallet (no transaction/compensation).
  - `UserService` exposes suspend/activate/update operations but has no audit trail or rate limiting, and passwords only enforce length (no strength, no breach checks).
  - Account lifecycle flags (`PENDING_VERIFICATION`, `SUSPENDED`) are not enforced anywhere in controllers/middleware; `AuthController.login` simply validates password and issues JWTs regardless of user status.
  - `ClerkService` integration lives in `shared/services/ClerkService.ts` and is skipped whenever a `sk_test` key is provided, meaning staging/test cannot exercise real external flows and failures are silently swallowed.

## core/finance (`src/core/finance`)
- **Scope**: Wallet aggregate (`domain/entities/Wallet.ts`, `Transaction.ts`), currency VO (`domain/value-objects/Currency.ts`), wallet service (`domain/services/WalletService.ts`), repositories (`domain/repositories/WalletRepository.ts`) plus credit/withdrawal services.
- **Risks / Gaps**
  - Repository is just an array in memory; no database or locking is used, so concurrent deposits/withdrawals can interleave and double-spend.
  - `WalletService` sequences operations without transactions; if `walletRepository.update` fails, balances and recorded transactions diverge with no retry/rollback strategy.
  - `Wallet.getTransactions` stores history in process memory only; the `getHistory` API returns empty data after a restart and there is no pagination persistence.
  - Money handling relies on `Money` VO but wallets accept raw `number` inputs everywhere—no rounding, currency conversion, or fraud checks beyond positive amounts.
  - Cache invalidation is absent: controllers call `redisClient` for reads via middleware but deposits/withdrawals never bust `wallet:balance:*` keys, so stale balances may be served for up to the TTL.

## core/betting (`src/core/betting`)
- **Scope**: Betting aggregates (`domain/entities/Bet.ts`, `Event.ts`), value-objects (`domain/value-objects/BetAmount.ts`, `Odds.ts`), factories, repositories, and services like `domain/services/BetService.ts`. Use-cases live under the misspelled `aplication/use-cases` directory and wire into controllers.
- **Risks / Gaps**
  - Both `BetRepository` and `EventRepository` store data in arrays; helper queries such as `findByStatus`, `findUpcoming`, etc., always return `[]`, so any feature depending on them silently fails.
  - The folder alias `@core/betting/aplication` propagates the typo; adding new tooling/tests requires remembering the misspelling, hurting DX and discoverability.
  - `BetService.placeBet` withdraws from the wallet before persisting the bet but lacks a failure path to refund the user if `betRepository.create` throws.
  - There is no odds or event synchronization—`EventRepository` never seeds real data, so the betting flow only works with fixtures provided directly in tests/integration bootstraps.
  - Bets depend on the wallet currency but `Wallet` does not expose currency state publicly beyond `wallet.currency`; the service falls back to `'BRL'` which can desync multi-currency wagers.

## shared (`src/shared` and `src/core/shared`)
- **Scope**: Cross-cutting config (`shared/config/appConfig.ts`, `env.ts`, `cacheConfig.ts`), global errors (`shared/errors/AppError.ts`), services (`shared/services/JwtService.ts`, `ClerkService.ts`), and observability helpers (`shared/observability/requestContext.ts`). Domain-level value objects live in `src/core/shared` (e.g., `domain/value-objects/Money.ts`, `UniqueId.ts`).
- **Risks / Gaps**
  - `shared/config/cache.ts` and `shared/config/dbConfig.ts` are empty placeholders; importing them later would yield undefined config and runtime crashes.
  - The environment bootstrap (`shared/config/env.ts`) throws whenever `.env` is missing—even in development—which makes onboarding brittle and blocks simple `npm run dev` without manual env scaffolding.
  - `JwtService` uses a single symmetric secret for both access and refresh tokens with no audience/jti claims or rotation, making token revocation impossible and widening blast radius if the key leaks.
  - `ClerkService` silently no-ops when only test keys are available, so controllers behave differently depending on environment without any explicit feature flags or fallbacks.
  - `UniqueId` and other VOs rely on the global `crypto` object without importing it, which passes in Node but breaks in tools/bundlers that expect explicit imports.

## infrastructure (`src/infrastructure`)
- **Scope**: Express server setup (`api/ApiServer.ts`), controllers/routes, middleware (auth, caching, rate limiting), cache client (`cache/RedisClient.ts`), persistence factories (`persistence/factory.ts` + Mongoose adapters), observability metrics, and configuration glue.
- **Risks / Gaps**
  - `ApiServer.registerHealthCheck` and `/readiness` do not test any dependency; they always return healthy even if Mongo/Redis are unreachable, defeating orchestration probes.
  - `AuthMiddleware` enables a dev bypass whenever `ALLOW_DEV_BEARER_BYPASS` or missing Clerk keys are detected, effectively trusting any `Authorization: Bearer <userId>` header—dangerous if the flag leaks into staging.
  - `redisClient` creates a singleton connection but never closes it and lacks retry/backoff controls; connection drops will manifest as unhandled promise rejections.
  - Persistence factory checks `USE_MONGOOSE_PERSISTENCE`, yet no place in the boot process calls `connectMongoDB`, meaning enabling Mongo persistence still leaves repositories unconnected.
  - Controllers and routers instantiate repositories/services directly in `createApiRouter` without dependency injection; swapping implementations or injecting test doubles requires recreating the entire router per call.
  - Express 5.1.0 (still an RC) is used with v5 typings; ecosystem middleware/plugins may not yet support it, and there is no compatibility flag.

## Additional Notes
- `package.json` scripts rely on Jest + ts-jest and `tsx` for dev; no lint/build is currently enforced in CI, and there is no Husky/pre-commit config.
- Observability metrics (`infrastructure/observability/metrics.ts`) only cover HTTP/cache. There are no histograms for external calls (Mongo, Redis, Clerk) nor log sampling.
- Integration tests under `src/integration/__tests__` bootstrap use-cases directly, bypassing the Express surface; API regression coverage is therefore limited to `infrastructure/api/__tests__/observabilityEndpoints.test.ts` added in Phase 4.
