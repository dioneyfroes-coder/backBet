# ADR-0002 — Concorrência financeira (idempotência + lock otimista + retry)

- **Status**: Aceito (implementado e validado em produção/lab)
- **Data**: 22/09/2026

## Contexto

A carteira (wallet) é o recurso mais disputado do sistema: múltiplos workers e
requisições concorrentes fazem débito/crédito, depósito, claim de aposta e
payouts ao mesmo tempo. Dois problemas clássicos precisam ser impossíveis:
**double-spending** (o mesmo saldo gasto duas vezes) e **duplicação de payout**
(dois workers pagam a mesma aposta). O baseline mostrou contenção real:
`wallet contention @500 → 18 jobs/min` e `@100 → p99 104ms` — sem trava isso se
torna incorreto, não apenas lento.

## Decisão

- **Idempotência por chave de negócio**: toda operação financeira carrega
  `idempotencyKey` (ex.: `deposit:<userId>:<ref>`); o PSP/worker vê a mesma chave
  e **executa no máximo 1 vez** (resultado reutilizado no retry). Evidência:
  `crash.integration.test.ts` C5/C7 + `multi-worker.integration.test.ts` (1
  chamada ao PSP por aposta, 1 débito).
- **Lock otimista (CAS/version)**: a wallet tem `version`; cada movimentação faz
  `findOneAndUpdate` **com condição `version: N`** — se outra transação já
  alterou (CAS falhou), a operação **falha e volta pro retry** (não bloqueia em
  lock pessimista). Evidência: `WalletConcurrency.test.ts` (100 saques
  concorrentes, 0 divergências).
- **Retry com backoff**: no lugar de `LOCK WAIT` (MySQL-style), tentativas
  espaçadas; se o CAS nunca passa, a operação **rejeita** o request (saldo/
  invariante) em vez de estacionar na fila para sempre.

Por que **não** lock pessimista global: órfão de deadlock/contenda desnecessária
(awkward para o perfil de 4 workers em PM2); idempotência + CAS dão o mesmo
resultado com menos latência de travamento.

## Consequências

- **Positivas**: exatamente-1-vencedor no claim (ADR-0002 + `WalletConcurrency`),
  zero double-spending, retry seguro, teste automatizado (1173 testes, 18/18
  specs de integração).
- **Negativas / tradeoffs**: CAS gera retries quando a contenção é alta
  (baseline @500 wallet: 18 jobs/min de throughput — aceitável, não trava);
  idempotencyKey precisa ser gerenciada pelo cliente/worker (não é automática);
  operações fora de transação (ex.: consulta) não ganham CAS — são csak reads
  na réplica.
- **Risco residual**: retries com backoff em picos podem empilhar jobs
  (mitigação: PM2 bench valida `interrupção 300/300`, `troca 200/200`,
  `crash+autorestart 100/100` — ver `docs/backBet-Otimizacao...` e
  `docs/TESTING-ENV.mdx`). [TODO: linkar `docs/ESTADO-DO-PROJETO.mdx` §4/§11]

## Referências

- ADR-0001 (persistência transacional — pré-requisito do lock no documento/collection)
- ADR-0003 (workers sob BullMQ + PM2 — quem consome e re-tenta conforme CAS)
- ADR-0004 (entrega B2B — freeze; CAS é D em produção, não B2C)
- `docs/ESTADO-DO-PROJETO.mdx` §2/§4/§11 (evidências de lab e baseline)
