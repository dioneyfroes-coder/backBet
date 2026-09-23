# ADR-0001 — Persistência transacional (MongoDB replica set + transações multi-documento)

- **Status**: Aceito (implementado e validado)
- **Data**: 22/09/2026
- **Título**: Persistência transacional para wallet/ledger/bet

## Contexto

O BackBet movimenta dinheiro real (lab) entre wallet, ledger, bets e tesouraria.
Em um único fluxo (depósito → crédito → aposta → liquidação) várias escritas em
documentos diferentes precisam acontecer **como uma unidade atômica** — ou todas
persistem, ou nenhuma. Sem isso, um crash entre as operações deixa o estado
inconsistente (ex.: débito feito sem crédito, ou a `wallet` divergindo do `ledger`).

Alternativas consideradas:

- **SQL tradicional (Postgres/MySQL) com transações ACID já prontas**: forte, mas
  exigiria uma coluna/complexidade de schema rígido e migração massiva de um
  codebase já inteiramente Mongo (modelos `*Model` + repositórios).
- **Documento único gigante (uma collection "tudo")**: evita transações, mas cria
  lock de documento gigante — estrangulamento de concorrência justamente na carteira
  quente que medimos (baseline: contenção @500 → 18 jobs/min).
- **Transações nativas do Mongo (replica set)**: resolve a atomicidade multi-doc sem
  trocar de banco, mantendo o schema atual.

## Decisão

Usar **MongoDB em replica set + transações multi-documento nativas** para todos os
fluxos financeiros: depósito, aposta, liquidação/settlement, saque (payout) e
reconciliação de tesouraria. Cada operação que toca ≥2 documentos (ex.: wallet +
ledger + bet) roda dentro de uma transação `withTransaction`, garantindo ACID.

Evidências no repositório:

- `scripts/run-integration-tests.cjs` valida `replicaset`/`directConnection` (URI de
  transação via IP estático do lab, `192.168.22.250:27018`).
- Suítes de integração usam MongoDB real em replica set (job de integração do CI
  publica o array `replicaset`); transações multi-doc exercitadas nos fluxos
  deposit/bet/settlement/withdrawal.

## Consequências

- **Positivas**: atomicidade multi-doc garantida em todos os fluxos financeiros;
  sem migração de banco; footprint novo zero no deploy (mesmo servidor Mongo).
- **Negativas**: transações exigem **replica set** (não standalone) — `mongod`
  precisa rodar com `--replSet`; `directConnection=true` na URI local; workers que
  usam transação precisam da mesma URI de cluster.
- **Custo**: maior latência por operação transacional vs write único (aceitável:
  baseline wallet@100 p99 104ms, distribído @500 ~81 ops/s — atendem o DoD).
- **Pendência conhecida**: **transações com `directConnection=true`** não cobertas
  por teste automatizado no CI — validadas manualmente no lab (bench PM2).

Relacionado: `docs/ESTADO-DO-PROJETO.mdx` §2 (transações Mongo) e
`docs/PERFORMANCE-BASELINE.mdx`.
