# BackBet — Correções Passo a Passo (Fase de Encerramento)

> Substitui o plano anterior (P0/P1/P2). A fase de correções e consistência está
> **concluída** — 18/18 specs de integração verdes sobre infra real, 1173 testes
> passando, cobertura ≥65% branches. O que resta é **fechar e congelar o projeto**
> em 5 etapas. Executar na ordem abaixo, sobre a `main`.

## Ordem de execução

### 1. Corrigir `docs/ESTADO-DO-PROJETO.mdx`

- [ ] Atualizar a seção "Estado atual" para **22/09/2026**: **1173 testes passando, 0 falhas,
      153/164 suítes**, cobertura global **~85,5% stmts / ~70,2% branches / ~82,8% fns /
      ~86% lines**, e o gate `branch ≥ 65%` travado no `npm run check`.
- [ ] Registrar a validação de integração real do lab (22/09): **18/18 specs verdes**
      (mongo-redis, user-auth-persistence, event-category-query, load.concurrency,
      load.distributed, failure, multi-worker, crash, backup) com URIs publicadas
      (`192.168.22.250`, Mongo `27018`, Redis `6379`).
- [ ] Registrar o resultado do bench PM2 (22/09): com `PM2_WORKER_INSTANCES=4` a fila
      **400 jobs 1x≈31/s vs 4x≈100/s (speedup ≈ 3,2x)**; 500 jobs: 1 proc sem PM2 ≈31/s,
      4 procs sem PM2 ≈125/s, PM2 4 inst ≈100/s (overhead ≈ 25% de boot); zero falhas
      em todas as variantes.
- [ ] Registrar a pendência de CI: a suíte de integração roda com `--coverage=false`
      (threshold global de 65% branches não contempla rodada parcial de specs) — ver
      `docs/TESTING-ENV.mdx` e `scripts/run-integration-tests.cjs`.
- [ ] Marcar como **pendente de execução** (não "concluído") os itens que dependem do
      clone limpo + Docker deste plano (etapa 4) e da decisão comercial.

**Critério de saída**: ESTADO-DO-PROJETO.mdx consistente com a data/contagens do lab e
sem claims sem evidência.

### 2. Criar os 4 ADRs (registro de decisão de arquitetura)

Criar `docs/adr/` (4 ADRs, formato **Status / Contexto / Decisão / Consequências**),
documentando decisões já implementadas e a decisão comercial:

| ADR | Conteúdo |
|-----|----------|
| ADR-0001 | **Persistência transacional**: MongoDB replica set + transações multi-documento para wallet/ledger/bet (por que não arquitetura SQL ou doc único gigante). |
| ADR-0002 | **Concorrência financeira**: idempotência + lock otimista (version/CAS) + retry + claim atômico `APPROVED → PROCESSING` (por que não Redis lock distribuído na carteira). |
| ADR-0003 | **Filas de worker**: BullMQ + BullMQ (migração Bull→BullMQ), BullMQ v6 exige `connection` como cliente ioredis (não string), `PM2_WORKER_INSTANCES`/cluster PM2. |
| ADR-0004 | **Entrega B2B + freeze**: vender a plataforma a operadores autorizados B2B; P2 regulatório (KYC/PSP/SIGAP reais) adiado; tag `v1.0.0` e congelamento do repositório. |

**Critério de saída**: 4 ADRs em `docs/adr/`, linkados no ESTADO-DO-PROJETO e revisados
por pares (PR).

### 3. Confirmar o CI final

- [ ] `npm run check` verde: secrets + lint + **1173 testes** + cobertura **≥65% branches** + build.
- [ ] `npm run typecheck` verde.
- [ ] Reproduzir o job de integração **exatamente como o CI**:
      `docker compose -f docker-compose.test.yml build integration-tests` **e**
      `docker compose -f docker-compose.test.yml run --rm integration-tests` → **0 falhas, exit 0**.
- [ ] Conferir no GitHub Actions que **todos os jobs** (test, integration) estão verdes no
      mesmo commit.

**Critério de saída**: pipeline do CI 100% verde (sem alertas, jobs test+integration ok).

### 4. Fazer um clone limpo + execução Docker

- [ ] `git clone` da `main` em diretório neutro (fora do workspace do lab).
- [ ] `npm ci`; preparar `.env` a partir de `.env.example` com credenciais/dados do lab.
- [ ] `docker compose up -d --build`; aguardar containers `healthy` e validar `/health` e
      `/readiness` (mongo/redis `up`).
- [ ] Smoke de negócio: depósito → saque → payout via fila real (mínimo) e registrar saída.

**Critério de saída**: app sobe do zero com Docker (sem estado local), health/readiness 200,
evidências (logs) anexadas.

### 5. Criar uma release/tag e congelar o projeto

- [ ] `git tag -a v1.0.0 -m "v1.0.0"` no commit final da `main`; `git push --tags`.
- [ ] Criar GitHub Release com as evidências (docs atualizados, runIDs, resultados de CI).
- [ ] **Congelar**: branch protection (sem push direto, PRs revisados), repositório em modo
      manutenção — apenas bug-fix/segurança; sem nova feature até decisão comercial.

**Critério de saída**: tag `v1.0.0` pública + release publicado + freeze aplicado.
