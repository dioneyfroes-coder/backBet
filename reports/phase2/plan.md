# Phase 2 – Infraestrutura & API Hardening Plan
_Date: 2025-11-22_

## Middleware & Routes Observations
- **CORS aberto**: `ApiServer` aceita qualquer origem local por padrão; falta permitir listas específicas por ambiente e bloquear `credentials` fora das origens autorizadas.
- **Proteção de rotas**: `protectedRoute` já cobre `/users`, `/wallets`, `/auth/me`, `/auth/logout`, `/bets` (exceto `/event/:eventId`). Precisamos garantir que rotas sensíveis em `/finance` e futuras rotas admin também usem o middleware.
- **Rate limiting granular**: somente endpoints de auth possuem limitadores dedicados. `/wallets` e `/bets` (post/withdraw) deveriam ter limites menores para reduzir abuso.
- **Segurança extra**: `helmet` usa defaults; definir HSTS, `crossOriginResourcePolicy` e bloquear `x-powered-by` ajudará.
- **Request logging**: já migrado para `res.on('finish')`, mas faltam logs estruturados e correlação com IDs de usuário quando disponíveis.

## Cache & Redis Opportunities
- **Cache middleware escopo**: apenas `/wallets/me` e `/wallets/history` usam `cacheResponse`. Rotas como `/bets/event/:eventId` e `/users/me` contam com hooks dentro dos controllers; podemos mover para middleware para reaproveitar resposta pronta.
- **Invalidation coverage**: flush existe para wallets, usuários e odds, porém controllers de finanças (compras de crédito, withdraw requests) ainda não disparam invalidadores após mutações.
- **TTL tuning**: valores em `cacheTTL` são fixos; expor via env e documentar defaults permitiria ajustar rapidamente para endpoints de alto tráfego.
- **Metrics poll**: `updateCacheMetrics` roda mesmo com cache desligado; ligar/desligar o `setInterval` de acordo com `cacheConfig.enabled` economiza ciclos.

## Persistence & Sanitization
- **Repositories Mongoose**: `MongooseWalletRepository` não restaura transações, apenas saldo/lockedBalance, o que torna o histórico inconsistente. Também não projeta/normaliza moedas ou garante limites.
- **Queries não indexadas**: Busca por `userId` é frequente; garantir índices ou `lean()` (já usado) e validação de entrada antes de passar ao Mongo evitará scans.
- **DTO sanitization**: controllers ainda recebem números/códigos sem clamp. Precisamos adicionar verificações de faixa e conversão para `Number`/`BigInt` antes de chegar aos repositórios.

## Próximas Ações para Execução
1. **CORS & headers**: definir listas de origem por ambiente, remover `credentials` quando não necessário e ajustar opções do `helmet` (HSTS, frameguard, hidePoweredBy).
2. **Rate limits adicionais**: aplicar `createRouteRateLimiter` em `/wallets` (dep/saque) e `/bets` (place/cancel) com limites agressivos.
3. **Cache middleware**: criar middlewares para `/bets/event/:eventId` e `/users/me`, reaproveitando `cacheResponse`, além de garantir invalidação em controllers de finanças.
4. **Redis metrics interval**: iniciar/parar o `setInterval` conforme `cacheConfig.enabled`.
5. **Repository fixes**: reidratar histórico em `MongooseWalletRepository` e validar entradas (ex. `sanitizeUserId` antes de usar em queries).
6. **Logging**: incluir `req.auth?.userId` e `req.ip` no logger, preparar formato JSON amigável a agregadores.
