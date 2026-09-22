# Fase de Otimização de Performance — Plano

> Fase seguinte ao baseline de performance (item #14 do plano `BackBet-Correcoes-Passo-a-Passo.md`).
> Objetivo: reduzir o gargalo de contenção na mesma carteira e melhorar o uso de recursos,
> mantendo invariantes financeiros e **0 rejeitadas** sob concorrência.

## Contexto (baseline 21/09/2026 — nível 50)

| cenário | p50 | p95 | p99 | mean | ops/s | mongo cpu pico | rejeitadas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| contenção (1 carteira) | 6172 ms | 8047 ms | 8077 ms | 5495.7 ms | 6 | 103.3% | 0 |
| distribuído (N carteiras) | 713 ms | 759 ms | 772 ms | 713.5 ms | 65 | — | 0 |

- **Correção**: 0 rejeitadas, 0 conflitos CAS, saldo/ledger consistentes.
- **Gargalo patológico**: serialização do documento único por carteira + reexecução de transação otimista (retry de `WriteConflict`).
- **Distribuído**: teto é CPU do runner, não o Mongo.
- Referência pré-fix (`fase13/final`): p95 ≈ 13 s @50 → 449 s @200 → 22 min @300; 174/500 rejeitadas por WriteConflict @500.

## Passo 1 — Lock distribuído por carteira (Redis)

- Criar interface `WalletLockService` em `src/core/finance/domain/services/`:

  ```ts
  interface WalletLockService {
    withLock<T>(userId: string, fn: () => Promise<T>): Promise<T>;
  }
  ```

- Implementar `RedisWalletLockService` em `src/infrastructure/persistence/locks/` usando `RedisClient.setIfAbsentStrict` (`SET NX EX`):
  - chave: `wallet:lock:<userId>`;
  - valor: token aleatório do dono;
  - `LOCK_TTL_MS` (default 5000) — se o dono morre, o lock expira sozinho;
  - release **seguro** via Lua script (`del` somente se o token bater) — evita delegar lock de outro owner após TTL;
  - `WAIT_MAX_MS` (default 200) — spin com backoff; timeout lança `DOMAIN_ERROR WALLET_LOCK_BUSY`.
- `WalletService.run()` passa a envolver a transação com o lock **somente quando nenhum `WalletRepositoryOptions`/session externo é fornecido**:
  - requests HTTP (sem session) → lock + transação;
  - workers/filas que já passam `session` (transação Mongo controlada externamente) → comportamento atual preservado (evita deadlock lock-dentro-transação).
- Timeout mapeado para 409/429 pelo caller (a definir na rota/controller).

## Passo 2 — Métricas

- Novos contadores em `src/shared/observability/IMetricsPort`:
  - `walletLockAcquired` (counter);
  - `walletLockWaitMs` (histogram);
  - `walletLockTimedOut` (counter).
- Integrados ao `RedisWalletLockService` e expostos em `/metrics` quando `OBS_ENABLE_PROMETHEUS=true`.

## Passo 3 — Testes

- `WalletLockService.test.ts` (unit, store in-memory mockado):
  - mutual exclusion entre 2 chamadas concorrentes para o mesmo userId;
  - wallet distintas não bloqueiam entre si;
  - timeout após `WAIT_MAX_MS` → `WALLET_LOCK_BUSY`;
  - release libera para o próximo (`withLock` sequencial roda);
  - callback lançando erro libera o lock (finally).
- `wallet-lock.integration.test.ts` (Redis real na rede do `docker-compose.test.yml`):
  - duas corrotinas disputam a mesma chave → exatamente 1 executou por vez (flag de in-progress);
  - simulação de crash: lock expira após TTL e outro processo consegue adquirir;
  - release com token errado não remove o lock de outro owner.
- Estender `multi-worker.integration.test.ts`: dois processos reais disputando a **mesma carteira** (não só o mesmo payout) com lock ativo.

## Passo 4 — Re-baseline

- Rodar `PERC_LEVELS=50 node scripts/percentile-driver.cjs`.
- Comparar contrário a `scripts/load-results/fase14/02326fa4-7e5e-4185-ac00-475ecf86d9b5/`.
- Métricas de comparação: p50/p95/p99, mean, wall, ops/s, rejeitadas, conflitos CAS, CPU/RAM Mongo/Redis/runner, pings Mongo/Redis.
- Atualizar `docs/PERFORMANCE-BASELINE.mdx` com a nova rodada e leitura.

## Passo 5 — Próximos candidatos (se necessário)

- **Saldo agregado "de jogo"**: doc separado com saldo de jogo grudado na sessão de aposta; reduz escritas no doc principal da carteira (pós-lock, o próximo gargalo de contenção é a escrita do doc quente).
- **Particionamento por moeda/escopo**: dividir o documento da carteira por moeda/CCC.
- **Bull → BullMQ** (dívida técnica — worker mais robusto, backoff e DLQ nativos).

## Critérios de saída (Definition of Done desta fase)

- [ ] `npm test` verde (0 falhas) e `npm run check` verde.
- [ ] Lock validado em suíte de integração com Redis real (rede Docker) e no `multi-worker`.
- [ ] Nova rodada de baseline registrada com `runId` em `scripts/load-results/fase15/`.
- [ ] `docs/PERFORMANCE-BASELINE.mdx` e `docs/TESTING-ENV.mdx` atualizados.
- [ ] matriz de riscos atualizada se aplicável.

## Decisões em aberto (para confirmar antes do Passo 1)

1. Lock opcional (feature flag `FINANCE_WALLET_LOCK=true`) ou sempre ativo quando Redis estiver habilitado?
2. Timeout `WALLET_LOCK_BUSY` → mapear para HTTP 409 ou 429?
3. Colocar o lock em `WalletService.run()` (todos os callers) ou apenas nos use-cases de request HTTP?