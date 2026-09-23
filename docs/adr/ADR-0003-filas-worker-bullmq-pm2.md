# ADR-0003 — Filas de worker (BullMQ + PM2) para processamento assíncrono

- **Status**: Aceito (implementado e validado)
- **Data**: 22/09/2026

## Contexto

Fluxos assíncronos (payout, KYC/SIGAP, notificação de contato, auditoria) não
podem bloquear o request HTTP nem depender do processo do app. Eles precisam de
**durabilidade** (job não some se o worker cair), **entrega exatamente-1/uma-vez**
e **paralelismo controlado**. O lab validou o cenário real: **crash do worker
mid-flight → 100/100 jobs concluídos**; PM2 com 4 instâncias → speedup ~3,4x
(fila 400 jobs: 1x ≈31 jobs/min → 4x ≈100+ jobs/min).

## Alternativas consideradas

- **Lote em memória + setTimeout (pilha caseira)**: perde tudo no crash — descartado.
- **Redis pub/sub direto**: melhora latência mas não dá **durabilidade/ack**;
  um consumidor que cai entre `PUBLISH` e `DELIVER` perde o job — descartado.
- **BullMQ (Bull → BullMQ, BullMQ v6) + PM2**: job persistido no Redis com
  estado (`waiting/active/completed/failed`), **ack explícito** via worker
  BullMQ, **retry** e **reprocessamento**; roda sob PM2 com N instâncias sem
  duplicar (um worker faz `claim` CAS do job).

## Decisão

- Adotar **BullMQ** (sucessor do Bull) como camada de filas, com Redis como
  broker; workers BullMQ são processos separados (node) orquestrados por **PM2**,
  consumindo a mesma fila.
- **Exatamente-1 por job, não por worker**: o worker que **obtém o job**
  (via claim atômico do BullMQ) é o único responsável por ele; os demais
  workers veem outro job. Crash → BullMQ devolve o job para retry/backlog.
- **Idempotência financeira fica na camada de domínio** (ADR-0002): mesmo que um
  payout seja re-executado após crash, a idempotencyKey garante execução única
  no PSP.

## Consequências

- **Positivas**: jobs duráveis (sobrevivem a crash/restart), paralelismo com PM2
  (4 instâncias, speedup real validado), backpressure via `concurrency`,
  `clean`/`obliterate` para filas tóxicas, evidência automatizada:
  `multi-worker.integration.test.ts`, `crash.integration.test.ts`,
  `run-pm2-bench`.
- **Negativas/tradeoffs**: depende de Redis disponível (SPOF mitigado por
  fallback in-memory em dev + alertas); BullMQ não é "mensageria transacional"
  (se um job falhar após efeito parcial, o domínio precisa lidar — aceito via
  idempotência, ADR-0002); TTL/config de retry precisam ser explícitos
  (padrões documentados em `docs/TESTING-ENV.mdx` e `docs/PERFORMANCE-BASELINE.mdx`).
- **Risco residual**: com fila saturada, o consumo pode cair abaixo do necessário;
  mitigado por monitoramento de `failed`/`delayed` e alertas.

## Referências

- ADR-0001 (persistência transacional — workers escrevem via transação)
- ADR-0002 (idempotência/CAS — segurança de re-execução)
- `docs/ESTADO-DO-PROJETO.mdx` §2/§4 (PM2 bench, 5 cenários, evidências)
- `scripts/run-pm2-bench` (rodar o bench PM2)
