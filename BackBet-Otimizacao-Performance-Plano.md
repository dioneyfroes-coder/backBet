# Plano de Encerramento e Congelamento do Projeto

> Este arquivo substitui o antigo *Fase de Otimização de Performance — Plano*. A fase de
> performance foi concluída (baseline validado, `docs/PERFORMANCE-BASELINE.mdx` e
> `docs/TESTING-ENV.mdx` atualizados; contenção @500 sem rejeitadas, distribuído ~81 ops/s) e
> a fase Bull→BullMQ encerrada. O novo trabalho é o **encerramento e freeze** do projeto,
> conforme as 5 etapas abaixo (espelho do checklist `BackBet-Correcoes-Passo-a-Passo.md`).

## Etapa 1 — Corrigir `docs/ESTADO-DO-PROJETO.mdx`

O doc é a fonte única de verdade de status e decisões e encontra-se defasado. Correções
obrigatórias antes de qualquer release:

1. Atualizar a seção "Estado atual" para 22/09/2026: **1173 testes passando / 41 skipped /
   153 de 164 suítes**; cobertura ~85,5% stmts / ~70,2% branches; gate `branches ≥ 65%`
   travado pelo `npm run check`.
2. Documentar a validação de integração no lab (18/18, via URIs publicadas com
   `directConnection=true`) e o fix de CI (`--coverage=false` no runner de integração).
3. Documentar o bench PM2 e a comparação **500 jobs com vs sem PM2** (speedup ~3,4x com 4
   instâncias; overhead ~25% de boot; zero falhas em todas as variantes).
4. **Condicionar** afirmações dependentes dos passos 3 e 4 (CI verde no GitHub, stack Docker
   do clone) — nada de "concluído" sem prova executada nesta fase.
5. Linkar os 4 ADRs (etapa 2) e esta fase de encerramento.

**Critério**: nenhuma claim sem evidência; datas/contagens exatas.

## Etapa 2 — Criar os 4 ADRs

Formato: `docs/adr/ADR-XXXX-<slug>.md` com **Status / Contexto / Decisão / Consequências**
(incluindo alternativas consideradas e evidências).

| ADR | Decisão congelada |
|-----|-------------------|
| ADR-0001 | **Persistência transacional**: MongoDB replica set + transações multi-documento (wallet/ledger/bet); documento de carteira enxuto com extrato via Ledger. |
| ADR-0002 | **Concorrência financeira**: idempotência + lock otimista (`version`/CAS) + retry transitório + claim atômico `APPROVED → PROCESSING`; concorrência paralela de workers disputando o mesmo payout com exatamente 1 vencedor. |
| ADR-0003 | **Filas de worker**: BullMQ (migração de Bull), conexão ioredis com `maxRetriesPerRequest: null`, `lockDuration`/`stalledInterval`, escalabilidade por `PM2_WORKER_INSTANCES` (cluster) e `USE_REDIS_QUEUE=true` obrigatório. |
| ADR-0004 | **Entrega B2B + freeze**: plataforma para operadores autorizados; P2 regulatório (KYC/PSP/SIGAP/certificação) adiado; tag `v1.0.0` e congelamento do repositório. |

**Critério**: 4 ADRs criados, revisados e referenciados no ESTADO-DO-PROJETO.

## Etapa 3 — Confirmar o CI final

Reproduzir localmente e confirmar no GitHub Actions, no **mesmo commit da tag**:

- `npm run check` → secrets + lint + 1173 testes + cobertura branch ≥65% + build, sem falhas.
- `npm run typecheck` → verde.
- Job de integração reproduzido: `docker compose -f docker-compose.test.yml build integration-tests`
  e `docker compose -f docker-compose.test.yml run --rm integration-tests` → 0 falhas, `exit 0`.
- Conferir ausência de alertas no Actions e que o fix `--coverage=false` impede o falso
  negativo de cobertura em specs parciais.

**Critério**: jobs `test` e `integration` verdes no GitHub Actions.

## Etapa 4 — Fazer um clone limpo + execução Docker

Provar que o repositório é autossuficiente (sem estado/cache do ambiente de dev):

1. `git clone` do branch de release em diretório novo e neutro.
2. `npm ci`; preparar `.env` a partir do `.env.example`.
3. `docker compose up -d --build`; aguardar `healthy` (mongo, redis e app) e `mongo-rs-init`.
4. Validar `/health` e `/readiness` (mongo e redis `up`).
5. Registrar `runId` e logs; anexar como evidência no release.

**Critério**: a stack sobe do zero em Docker; saúde/readiness respondem 200.

## Etapa 5 — Criar release/tag e congelar o projeto

1. Tag anotada no commit consolidado: `git tag -a v1.0.0 -m "BackBet v1.0.0 — GO condicionado B2B"`.
2. `git push origin v1.0.0` e publicação do GitHub Release com evidências (docs atualizados,
   baseline, runIDs, resultados do CI/docker).
3. Congelamento: branch protection (sem push direto), repo em manutenção — apenas
   bug-fix/segurança até a decisão comercial (B2B vs portfólio, ADR-0004).

**Critério**: tag e Release públicos; política de manutenção aplicada no repositório.