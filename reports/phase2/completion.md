# Phase 2 – Infraestrutura & API Hardening (Conclusão)

_Data: 2025-11-22_

## Escopo Coberto
- **Headers/CORS/Segurança:** `ApiServer.ts` passou a exigir lista branca dinâmica, helmet com HSTS e frameguard, request-id, structured logging e fallback controlado para Clerk em ambientes de teste/dev.
- **Rate limiting granular:** `routeRateLimiter.ts` agora usa `ipKeyGenerator` e cada rota sensível (`auth`, `wallets`, `bets`) ganhou limites específicos via `appConfig`.
- **Cache & Redis:** adicionados middlewares dedicados (`cacheMiddleware.ts`), invalidações em controllers financeiros, novas TTLs configuráveis e polling condicionado em `observability/metrics.ts`.
- **Repos & Sanitização:** `MongooseWalletRepository.ts` higieniza `userId`, persiste/rehidrata transações completas, e `FinanceController`/`WalletController` reforçam validações DTO.
- **Logging & Tracing:** logs JSON com request/user IDs e IP, além de métricas por rota em `metricsMiddleware`.

## Evidências Técnicas
- PRs/Commits relevantes: ajustes em `src/infrastructure/api/ApiServer.ts`, `routes/*`, `middleware/*`, `cache/*`, `observability/metrics.ts`, `shared/config/*`, `persistence/mongoose/*`.
- Configurações centralizadas (`appConfig.ts`, `cacheConfig.ts`, `env.ts`) agora expõem defaults seguros e validam segredos obrigatórios antes do boot.
- Clerk middleware é ignorado apenas em `NODE_ENV=test` ou quando chaves reais não estão presentes fora de produção.

## Validações Executadas
- `npm run lint`
- `npm run test`
- `npm run build`
- `NODE_ENV=development JWT_SECRET=dev-secret timeout 10s npm run start` (smoke test – encerra via `timeout`; único log extra é o aviso oficial de depreciação do `@clerk/clerk-sdk-node`).

## Riscos / Próximos Passos
1. Migrar de `@clerk/clerk-sdk-node` para `@clerk/express` para eliminar o aviso de depreciação (planejar para Fase 3/4).
2. Revisar se endpoints admin futuros herdam as mesmas políticas (documentado no backlog da Fase 3).
3. Monitorar custos de cache ao habilitar em produção; métricas Prometheus já expõem `backbet_cache_*`.
