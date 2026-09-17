# Plano de Finalização e Lançamento do BackBet — MVP

## Contexto

Base atual: suíte completa **902/902 verde** (888 unitários herméticos + 14 integração real)
— commit `74a15f6`. Solução de concorrência financeira já consolidada (retry em `CONFLICT`
no `WalletService` + transações Mongo + ledger idempotente).

>>>
**Próxima sequência**
1. Congelar a correção atual — `git diff`, revisar exatamente o que mudou na solução de
   concorrência, garantir que o novo tratamento de transações tenha teste de regressão.
2. Teste de repetibilidade — executar a suíte completa mais 2–3 vezes; objetivo: confirmar
   que `LOAD rejected: 0` não foi circunstancial.
3. Teste de carga progressiva — carga atual → 2x → 5x → 10x. Medir: tempo total,
   requisições/operações concluídas, rejeições, erros, CPU, RAM, MongoDB, Redis.
4. Testar falhas reais (chaos) — Redis indisponível, MongoDB indisponível, reinício do
   container da aplicação, reinício de worker, recuperação após a falha.
5. Só depois: cobertura — global ~54%; pontos pouco exercitados: `RiskService`,
   `MongooseBetRepository`, `MongooseUserRepository`, `WithdrawalPayoutWorker`.
>>>

## Ordem de execução

**Fase 1 — Repetibilidade → Fase 2 — carga progressiva → Fase 3 — chaos/failure →
Fase 4 — cobertura.**

Antes de mexer no código novamente: teste de repetibilidade + medição de recursos (linha de
base de um BackBet funcionando corretamente).

| Fase | Ação | Critério de saída |
|---|---|---|
| 0. Congelar correção atual | `git diff`, revisão do fix de concorrência, regressão coberta | diff auditado; teste de regressão presente |
| 1. Repetibilidade | Suíte completa ×2–3 | `LOAD rejected: 0` em todas as execuções |
| 2. Carga progressiva | 1x → 2x → 5x → 10x com medições | tempos/ops/rejeições/erros + CPU/RAM/Mongo/Redis documentados |
| 3. Chaos / failure | Redis down, Mongo down, restart da app, restart de worker, recuperação | sistema se recupera; sem corrupção financeira |
| 4. Cobertura | Foco: `RiskService`, `MongooseBetRepository`, `MongooseUserRepository`, `WithdrawalPayoutWorker` | cobertura desses módulos elevada e verde |

## Infraestrutura de execução

- Stack de produção local: Mongo `192.168.22.250:27018` (rs0), Redis `192.168.22.250:6379`,
  app `backbet`, `withdrawal-worker`, `contact-worker`.
- Estado observado em **17/set/2026**: `withdrawal-worker` e `contact-worker` estavam em
  `Restarting (1)` — investigar na Fase 3 (chaos/failure).
- Suíte de integração real: `npm run test:integration` com `MONGODB_URI`/`MONGODB_TEST_URI`/
  `REDIS_URL` apontando para a infra publicada (backbet-test, nunca o db da aplicação).
- Suíte hermética: `npm test` (sem infra).

## Log de execução

(As fases são executadas uma a uma, com commit + push ao final de cada uma.)

### Fase 0 — Congelar a correção atual · concluída (17/set/2026)

- `git diff` no estado atual: **árvore limpa** (nada além do autal commit). A solução de
  concorrência está congelada nos commits `735d7cb` e `74a15f6`.
- Revisão do que mudou na solução de concorrência (`735d7cb`):
  `WalletService.run()` agora envolve cada mutação financeira em transação Mongo
  (`withTransaction`) e, ao receber `AppError CONFLICT` (optimistic lock — versão
  obsoleta lançada por `MongooseWalletRepository.update`), **re-executa a transação
  inteira até 3 tentativas** com backoff `10ms × tentativa`. Erros que não são
  `CONFLICT` propagam imediatamente (sem retry). Falha do ledger rejeita/reverte a
  operação.
- Regressão garantida:
  - Existente: `WalletConcurrency.test.ts` (in-memory, convergência 100 ops) e
    `load.concurrency.integration.test.ts` (Mongo real — `LOAD rejected: 0`).
  - **Lacuna fechada**: novo teste unitário do retry interno de `run()` em
    `WalletService.atomicity.test.ts` — (1) `CONFLICT` transitório re-executa e conclui;
    (2) `CONFLICT` persistente esgota as 3 tentativas e rejeita sem gravar ledger;
    (3) erro não-`CONFLICT` não é re-tentado. 7/7 verdes.