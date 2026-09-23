# ADR-0004 — Entrega como plataforma B2B + congelamento (release v1.0.0 e freeze)

- **Status**: Aceito (decisão comercial registrada; execução = Etapas 3–5 do plano)
- **Data**: 22/09/2026

## Contexto

O MVP está tecnicamente pronto (1173 testes, 18/18 specs de integração em infra
real, cobertura ≥65% branches, baseline de desempenho validado). O que resta é
uma **decisão comercial** de como entregar o produto e **congelar o repositório**.
Duas opções divergentes estavam sobre a mesa, com impacto regulatório diferente.

## Alternativas consideradas

- **Operar uma bet própria (B2C)**: exige autorização SPA, capital regulatório,
  KYC/AML real, certificação SIGAP, PSP próprio e pagamentos — um **projeto de
  compliance separado** (decisão P2 adiada), não uma etapa de código.
- **Vender como plataforma/backend B2B para operadores autorizados** (escolhido):
  o BackBet **já é** esse produto — API `/api/v1` estável, cascata de provedores
  plugáveis (pagamento/KYC/SIGAP/geolocalização/device scaling). O operador arca
  com as obrigações regulatórias (SPA/certificação). Nenhuma feature nova
  necessária do lado do código.

## Decisão

1. **Entrega**: vender o BackBet como **plataforma de gestão de apostas B2B**
   a operadores autorizados — **não** operar B2C próprio. Evidência no
   `docs/ESTADO-DO-PROJETO.mdx` §6 (decisão comercial na main).
2. **Congelamento (freeze)**: marcar a entrega com tag **`v1.0.0`** e **congelar
   o repositório** — sem novas features após a tag; apenas bug-fix/segurança
   (manutenção). Claim de paridade: `docs/ESTADO-DO-PROJETO.mdx` (baseline
   consistente com clone limpo + Docker — Etapa 4).

## Consequências

- **Positivas**: projeto termina com um **produto vendável** (B2B) sem dívida
  regulatória pendente no repositório; freeze dá **garantia de estabilidade**
  para o operador (baseline imutável); evidência reprodutível (go/no-go
  documentado).
- **Negativas / tradeoffs**: receita só via venda/operação B2B (sem B2C);
  P2 regulatório (KYC/SIGAP/PSP reais) fica **adiado** e **fora do repositório**
  — qualquer adoção real é decisão comercial futura, não código.
- **Risco residual**: dependência de parceiro operador autorizado (mercado B2B);
  mitigação: produto entregue como backend plugável, permitindo onboarding por
  operador sem reescrever a stack.

## Referências

- ADR-0001 (persistência transacional) — base para o encerramento comercial
- ADR-0002 (concorrência financeira) — idempotência/CAS validadas sob carga
- ADR-0003 (filas/worker BullMQ + PM2) — baseline de workers para o operador
- `docs/ESTADO-DO-PROJETO.mdx` §6 (decisão comercial B2B) e §10 (release/freeze)
- `docs/ADRs-EM-ENUMERACAO.md` → migration destes 4 ADRs para `docs/adr/`
