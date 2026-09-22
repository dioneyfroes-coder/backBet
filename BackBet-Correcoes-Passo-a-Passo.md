# BackBet — Passo a Passo (Fase de Encerramento)

> Substitui o plano anterior (P0/P1/P2). A otimização de performance foi concluída
> (baseline e lock distribuído avaliados e documentados em `docs/PERFORMANCE-BASELINE.mdx`);
> o que resta é **fechar e congelar o projeto** com os 5 passos abaixo.

## Ordem de execução

### 1. Corrigir `docs/ESTADO-DO-PROJETO.mdx`

- [ ] Atualizar a seção "Estado atual" para a data corrente (22/09/2026): **1173 testes
      passando, 41 skipped, 153/164 suítes**, cobertura global, gate `branch ≥ 65%`.
- [ ] Registrar a suíte de integração real validada no lab (18/18) e o fix do CI
      (`--coverage=false` no `run-integration-tests.cjs`).
- [ ] Registrar o bench PM2 (`e2e`, `perf500`: 500 jobs com/sem PM2; speedup ~3,4x;
      overhead ~25% de boot) e os caveats documentados em `docs/TESTING-ENV.mdx`.
- [ ] Deixar **condicionadas** as linhas que dependem dos passos 3 e 4 (ex.: "CI integration
      CLOSED", "Docker/CI concluído") até serem comprovadas nesta fase.
- [ ] Manter a matriz de riscos e o roadmap alinhados ao estado pós-freeze.
- **Critério de saída**: nenhuma afirmação sem evidência; datas/contagens corretas; este
  checklist linkado na seção de encerramento.

### 2. Criar os 4 ADRs

Criar `docs/adr/` com o template **Status / Contexto / Decisão / Consequências**:

- [ ] **ADR-0001 — Persistência transacional**: MongoDB em replica set + transações
      multi-documento para wallet/ledger/bet; por que não SQL nem documentos únicos gigantes.
- [ ] **ADR-0002 — Concorrência financeira**: idempotência + lock otimista (`version`/CAS) +
      retry transitório + claim atômico `APPROVED → PROCESSING`; alternativas avaliadas
      (lock distribuído Redis na carteira) e o porquê da decisão (evidências de baseline).
- [ ] **ADR-0003 — Filas de worker**: BullMQ (migração de Bull), padrão de conexão ioredis
      (`maxRetriesPerRequest: null`), `lockDuration`/`stalledInterval`, escalabilidade PM2
      via `PM2_WORKER_INSTANCES` e o requisito `USE_REDIS_QUEUE=true`.
- [ ] **ADR-0004 — Entrega e freeze (B2B)**: produto vendido como plataforma a operadores
      autorizados; pendências regulatórias (P2) adiadas; tag `v1.0.0` e congelamento.
- **Critério de saída**: 4 ADRs em `docs/adr/`, revisados e referenciados no
  `docs/ESTADO-DO-PROJETO.mdx`.

### 3. Confirmar o CI final

No commit de encerramento, rodar exatamente o que o CI roda:

- [ ] `npm run check` (secrets + lint + 1173 testes + cobertura ≥65% + build) e `npm run typecheck`.
- [ ] Job de integração reproduzido localmente: `docker compose -f docker-compose.test.yml build integration-tests`
      e `docker compose -f docker-compose.test.yml run --rm integration-tests` → 0 falhas.
- [ ] Push do commit e conferência dos jobs `test` + `integration` no GitHub Actions
      (sem alertas, sem `exit 1` por cobertura em specs parciais).
- **Critério de saída**: pipeline 100% verde no GitHub Actions no mesmo commit da tag.

### 4. Fazer um clone limpo + execução Docker

Prova de zero dependência de estado/cache local:

- [ ] `git clone` do branch de release em diretório novo (fora do workspace) em um Path neutro.
- [ ] `npm ci`, `.env` a partir do `.env.example` + credenciais, `docker compose up -d --build`.
- [ ] Aguardar containers `healthy`; validar `/health` e `/readiness` (mongo e redis `up`).
- [ ] (Opcional) smoke real via `src/scripts/bench-e2e.ts` apontando para a stack do clone.
- [ ] Registrar `runId`/saídas e anexar no release.
- **Critério de saída**: app sobe do zero com Docker, sem usar artefatos do workspace de
  desenvolvimento; evidências anexadas.

### 5. Criar release/tag e congelar o projeto

- [ ] Consolidar o commit final e criar a tag: `git tag -a v1.0.0 -m "BackBet v1.0.0 — GO condicionado B2B"`.
- [ ] `git push origin v1.0.0` e criar GitHub Release com links de evidência
      (docs, baseline, runIDs, resultado do CI).
- [ ] Congelar: branch protection (sem push direto; PRs só com revisão), repositório em modo
      manutenção — apenas bug-fix/segurança, nada de feature até a decisão comercial.
- **Critério de saída**: tag pública + Release publicado + política de manutenção aplicada.