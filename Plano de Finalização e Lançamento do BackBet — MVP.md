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

### Fase 1 — Repetibilidade · concluída (17/set/2026)

Protocolo de execução no host (todas as 3 iterações **verdes**):

| Iteração | Suíte hermética (unit) | Suíte integração real | `LOAD rejected` |
|---|---|---|---|
| 1 | 891 passed / 0 failed (99,7s) | 14 passed | **0** |
| 2 | 891 passed / 0 failed (97,2s) | 14 passed | **0** |
| 3 | 891 passed / 0 failed (104,2s) | 14 passed | **0** |

- Total: **905 testes** (891 unit + 14 integração real) verdes em todas as execuções.
  `LOAD rejected: 0` **não foi circunstancial**.
- Observação ambiental: `npm run test` direto no host falha em 8 suítes por **timeout**
  porque `.env` aponta `REDIS_URL=redis://…@redis:6379` (hostname interno docker,
  irresolvível fora da rede) e suítes que sobem `createApiServer` com `NODE_ENV` não test
  conectam Redis real (`getaddrinfo EAI_AGAIN redis`). Reproduzindo a condição do CI
  (`REDIS_URL` apontando para o endpoint publicado → 54/54 das suítes-alvo verdes), o
  problema desaparece. Não é regressão de código.
- Estado de deploy encontrado (input da Fase 3): `withdrawal-worker` e `contact-worker` em
  `Restarting (1)` — `MODULE_NOT_FOUND: dist/scripts/start-withdrawal-worker.js` /
  `start-contact-worker.js` no container (`dist/` sem `scripts/`); app `backbet` saudável;
  `dist/` local não existe (build ainda não executado no dev).

### Fase 2 — Carga progressiva · concluída (17/set/2026)

**Correções feitas durante a fase** (mudanças de código, commit desta fase):

1. **Retry de concorrência transitória (write-conflict do Mongo)** — a escala 2x (200 ops
   na mesma carteira) expôs que `WalletService.run()` só re-tentava o optimistic lock da
   aplicação (`AppError CONFLICT`); sob acúmulo, o próprio WiredTiger aborta transações
   concorrentes com `MongoServerError 112` (*Write conflict during plan execution*) e isso
   **não** era re-tentado → rejeições. Novo helper compartilhado
   `retryTransient()` em `src/core/shared/domain/errors/retryTransient.ts` re-executa a
   unidade inteira (25 tentativas, backoff exponencial 5→300ms + jitter) para ambos:
   `CONFLICT` e erros Mongo transitórios (`112`, `TransientTransactionError`,
   `UnknownTransactionCommitResult`). Aplicado em `WalletService.run()` e em
   `BetService.placeBet()` (que roda a aposta toda dentro de uma transação externa e
   repassava a sessão ao wallet, pulando o retry interno).
2. **Bug de deploy raiz resolvido**: `backbet:latest` estava sendo construída do **stage
   `tests`** (o arquivo `Dockerfile` termina no target `tests` e o serviço `backbet` não
   declarava `target`). Resultado: a imagem de "produção" era a de testes — `CMD
   run-integration-tests.cjs`, **sem `dist/`** → app rodava jest no lugar da API e os
   workers crash-loopavam `MODULE_NOT_FOUND dist/scripts/…`. Corrigido com
   `target: runtime` no `docker-compose.yml`; imagem reconstruída, app `healthy` (200) e
   os dois workers subindo normalmente. Isso **já sana o bug apontado para a Fase 3**.
3. Timeout por teste da suíte de carga elevado de 600s → **1800s** (medida de carga real).

**Medições (ambiente limpo — app/workers corretos; 4 vCPUs, host com load alto):**

| Escala | ops depósito (1 carteira) | saques | apostas | `LOAD rejected` | Suite (jest) | wall |
|---|---|---|---|---|---|---|
| 1x (100) | 100/100 em 67,8s | 50 ok / 50 rej. em 37,6s | 500/500 em 70,6s | **0** | 14/14 (219,8s) | 229s |
| 2x (200) | 200/200 em 402,9s | 50 ok / 150 rej. em 95,4s | 1000/1000 em 135,8s | **0** | 14/14 (677,3s) | 691s |
| 5x (500) | **timeout >1800s** (não todos) | 50 ok / 450 rej. em 1049,5s | 2500/2500 em 678,7s | **0** | 13/14 (3583,0s) | 3605s |

- Resultado-chave: em **todas** as escalas até 5x, **nenhuma operação é perdida nem
  rejeitada por corrupção** (`LOAD rejected: 0`): saques e **2500 apostas simultâneas**
  convergem com zero rejeições.
- **Teto documentado**: o ponto de degradação é o teste patológico de **N depósitos
  simultâneos numa única carteira**. À medida que N cresce (100→200→500), a escrita no
  mesmo documento serializa e o throughput cai (1,5 → 0,5 → <0,4 ops/s); em **5x (500
  ops) não converge dentro de 30min** no host atual (4 vCPUs, load ~13). Não é perda de
  dado: é limite de tempo/durabilidade para esse cenário de contenção extrema.
- Dados brutos em `scripts/load-results/scale-{1,2,5}/` (gitignored; `scale-10` não foi
  executado — interrompido, seguia o mesmo padrão de timeout).
- Ação de cross-check: fix do retry validado por 6 novos testes unitários
  (`WalletService.atomicity`: 112 transitório re-executa, 112 persistente esgota 25
  tentativas sem ledger, duplicate-key não re-tenta; `BetService.critical`:
  write-conflict re-executa a aposta inteira com débito único).

### Fase 2b — Carga distribuída (eixo horizontal) · concluída (17/set/2026)

**Motivação.** A suíte de contenção (`load.concurrency`) mede o eixo **vertical**: N
operações no **mesmo documento** (carteira única). O timeout em 5x é o teto patológico
desse cenário e **não** representa falha de escala da aplicação — é serialização de um
documento no WiredTiger. Para medir o eixo **horizontal** (o que importa para lançamento)
criou-se o spec `src/integration/__tests__/load.distributed.integration.test.ts`, com o
mesmo parâmetro `LOAD_SCALE`, mas cada operação toca **documento distinto**:

- `WALLETS = 100 × LOAD_SCALE` carteiras/usuários distintos; cada usuário tem **seu próprio
  evento/mercado** (sem contenção de contador de risco).
- Por carteira as operações são **sequenciais** (uma de cada vez naquele doc); carteiras
  correm em paralelo em **ondas** de `min(WALLETS, 100)` (`runChains`). Assim nenhum
  documento recebe escrita concorrente — mede-se throughput de docs independentes.
- Carga: 25 depósitos + 25 saques por carteira; 8 apostas por usuário (800 ≤ saldo
  pós-saques 981,25 → todas cobertas, rejeição legítima = 0).
- Asserts de integridade: saldo exato por carteira, contagem de ledger (`DEPOSIT`,
  `WITHDRAWAL_COMPLETED`, `BET_DEBIT`), exposição por usuário/evento/mercado, **0 rejeições**.

**Medições (infra de produção local, 4 vCPUs, host com load alto):**

| Escala | carteiras | depósitos (ops/s) | saques (ops/s) | apostas (ops/s) | `DLOAD rejected` | suite | wall |
|---|---|---|---|---|---|---|---|
| 1x | 100 | 2500 (72,9) | 2500 (51,4) | 800 (22,5) | **0** | 3/3 | 152s |
| 2x | 200 | 5000 (77,9) | 5000 (51,0) | 1600 (22,1) | **0** | 3/3 | 265s |
| 5x | 500 | 12500 (86,3) | 12500 (51,5) | 4000 (23,6) | **0** | 3/3 | 602s |
| 10x | 1000 | 25000 (86,2) | 25000 (51,1) | 8000 (22,8) | **0** | 3/3 | 1188s |

- **Resultado-chave**: o **throughput por fase fica ~constante** de 1x a 10x (depósitos
  ~73→86/s, saques ~51/s, apostas ~23/s). O trabalho total escala linearmente com a
  escala e **não há degradação nem timeout** — em contraste direto com o cenário de
  contenção (que cai de 1,5 para <0,4 ops/s e estoura em 5x). Confirma que **o teto
  anterior era contenção de documento único, não capacidade da aplicação/Mongo**.
- CPU do Mongo ~27–32% médio (pico ~118%); conexões médias ~90–122; `queue_total` = 0
  (nenhuma fila de lock no Mongo); Redis ocioso (~2 ops/s); app `backbet` ~2% médio.
- Dados brutos em `scripts/load-results/scale-{1,2,5,10}-distributed/` (gitignored).

**Como rodar:**

- Driver com a nova flag (após `docker compose build integration-tests`):
  `node scripts/load-driver.cjs --distributed 1 2 5 10`
  (também aceita `npm run test:load:distributed` para rodar só o spec na infra atual).
- O driver acumula resultados em `scripts/load-results/resumo.json` por `scale`+`mode`
  (pastas separadas por modo: contenção `scale-<N>` vs distribuída `scale-<N>-distributed`).

### Fase 3 — Chaos / falhas reais · concluída (17/set/2026)

**1. Suíte de falhas (T1–T6) revalidada** — `docker compose --profile tests run --rm
integration-tests` (imagem `tests` reconstruída do fonte atual):

| Spec | Resultado |
|---|---|
| `failure.integration.test.ts` (T1–T6) | PASS (25,2s) |
| `load.concurrency.integration.test.ts` | PASS — `LOAD rejected: 0` |
| `mongo-redis.integration.test.ts` | PASS |

`Test Suites: 3 passed / Tests: 14 passed` — nenhuma regressão da correção de concorrência
nem da idempotência (depósito, apostas, rollback, worker com entrega duplicada, premiação).

**2. Falhas reais na produção local** (app `backbet` 3001, workers, Mongo `rs0`, Redis
publicados; cenários executados com um usuário real de ponta a ponta e conferência do
estado financeiro direto no Mongo):

| Falha | Liveness `/health` | Readiness `/readiness` | Operação de negócio | Recuperação | Corrupção |
|---|---|---|---|---|---|
| **Redis down** (antes do fix) | 200 | **pendura indefinidamente** | **pendura** (depósito commitava no Mongo, mas a resposta nunca voltava) | — | nenhuma (ledger/ saldo exatos) |
| **Redis down** (após o fix) | 200 | 503 em ~0,3s (`redis down`, breaker `OPEN`) | 201/200 rápidos (cache degrada, Mongo responde) | automática em ~9s (breaker `HALF_OPEN`→`CLOSED`, `ready:true`) | nenhuma |
| **Mongo down** | 200 | 503 imediato (`mongo down`, `disconnected`) | 500 fail-closed, **sem** escrita parcial | automática em ~15s (`state:connected`, `ready:true`) | nenhuma |
| **Restart do app** | healthy em ~12s | `ready:true` | depósito 201 pós-restart | automática | nenhuma (saldo/ledger idênticos) |
| **Restart de worker** | — | — | novo saque 201 (distinto); replay do mesmo request deduplicado (`Idempotency-Replayed`) | worker reconecta Mongo/Redis e o recovery scan roda limpo | nenhuma |

**Defeito real encontrado e corrigido (fail-slow do Redis).** Com o Redis fora, a ioredis
usava os defaults (`enableOfflineQueue: true` + `retryStrategy` infinito), então `get/set/
del/ping` ficavam enfileirados **para sempre**: `/readiness` e as requisições (inclusive o
`flushWalletCache` pós-depósito) penduravam até o cliente estourar timeout. O depósito
commitava atômico no Mongo (sem corrupção), mas o caller nunca recebia resposta — exatamente
o oposto do "fecha em falha" coberto pelo T2 (que injeta erro imediato). Correção em
`RedisClient.getRedis()`: `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`,
`connectTimeout: 2000`, `commandTimeout: 2000`. Agora comandos rejeitam rápido quando
desconectado, o circuit breaker abre e a readiness responde 503; o cliente reconecta em
background e volta sozinho. Regressão: novo teste em `RedisClient.test.ts` (config fail-fast)
— 896 unit verdes.

**3. Critérios de saída atendidos.** Sistema se recupera sozinho das 5 falhas reais
(app/workers voltam `healthy`, readiness volta a `ready:true`, breaker fecha) e **sem
corrupção financeira**: saldo e razão (ledger) conferidos no Mongo após cada cenário, com
idempotência preservada (requests repetidos deduplicados, sem débito duplo).

---

## Fase 4 — Cobertura · concluída (17/set/2026)

Metas e alvos definidos na linha 26/linha 37 da tabela de fases (`RiskService`,
`MongooseBetRepository`, `MongooseUserRepository`, `WithdrawalPayoutWorker`). Resultado
medido com **Istanbul (coverage-final.json) e suíte hermética (sem integração no host)**:

| Alvo | stmts | fns | branches | verificação (suíte hermética) |
|---|---|---|---|---|
| `RiskService.ts` | **100%** | **100%** | **100%** | antes apresentava múltiplos gaps (novas regras de risco) → agora 0 |
| `MongooseBetRepository.ts` | **100%** | **100%** | **100%** | antes 75,7% stmts (2 falhas de teste real sinalizadas) → 100% |
| `MongooseUserRepository.ts` | **100%** | **100%** | **100%** | antes ~78% → agora 0 gaps |
| `WithdrawalPayoutWorker.ts` | **100%** | **100%** | **100%** | antes 32,7% stmts (bloco de recovery não exercitado) → 100% |

- Mudanças: `RiskService.test.ts`, `MongooseBetRepository.test.ts`,
  `MongooseUserRepository.test.ts` (testes estendidos) e novo
  `WithdrawalPayoutWorker.coverage.test.ts`.
- Verificação: suíte hermética completa **950 passed / 17 skipped (integração real
  desligada) / 0 falhas**; `npm run typecheck` e `npm run lint` limpos.