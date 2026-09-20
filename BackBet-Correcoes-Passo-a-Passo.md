# BackBet — Plano de Correções e Validação

## Objetivo

Este documento transforma a análise técnica atual em um roteiro executável.

A ordem foi definida por risco:

1. bugs reais de persistência/autenticação;
2. consistência financeira e concorrência;
3. efeitos externos e workers;
4. CI/integração;
5. escalabilidade;
6. limpeza e documentação.

> Regra: não avançar para a próxima etapa enquanto os testes de aceitação da etapa atual não estiverem verdes, salvo quando a etapa seguinte for explicitamente independente.

---

# 0. Preparação

## 0.1 Criar uma branch de correções

```bash
git checkout -b fix/critical-consistency
```

## 0.2 Registrar o estado atual

```bash
git status --short
git log -1 --oneline
```

Salvar o estado atual antes das alterações.

## 0.3 Rodar a validação disponível

No `server01`:

```bash
docker compose ps
docker compose config
docker compose exec backbet npm run test
docker compose exec backbet npm run typecheck
docker compose exec backbet npm run lint
```

Rodar também os testes de integração que já fazem parte do projeto.

### Critério

O baseline deve ficar registrado antes das correções.

---

# P0 — BLOQUEADORES

# 1. Corrigir persistência de senha e password recovery

## Problema

`User` possui:

- `passwordHash`;
- `passwordRecovery`;

mas o `MongooseUserRepository.update()` não persiste esses campos corretamente.

Além disso, `UserSchema` não possui toda a estrutura necessária para `passwordRecovery`.

Isso pode fazer o fluxo funcionar em memória/testes unitários e falhar após reiniciar o processo.

---

## 1.1 Atualizar o schema Mongo

Arquivo provável:

```text
src/infrastructure/persistence/mongoose/schemas/UserSchema.ts
```

Adicionar a estrutura persistente correspondente a:

```text
passwordRecovery
```

Preservar:

- token/hash necessário;
- expiração;
- estado necessário para invalidação/reuso.

Evitar persistir segredo em texto puro quando o design atual permitir hash.

---

## 1.2 Atualizar o tipo/documento Mongo

Arquivo provável:

```text
src/infrastructure/persistence/mongoose/repositories/MongooseUserRepository.ts
```

Garantir que `IUserDocument` contenha:

```text
passwordHash
passwordRecovery
```

---

## 1.3 Corrigir `save()`

Garantir persistência de:

```text
passwordHash
passwordRecovery
```

---

## 1.4 Corrigir `update()`

O update deve incluir:

```text
passwordHash
passwordRecovery
```

sem apagar os campos quando uma operação não relacionada atualizar o usuário.

---

## 1.5 Corrigir `mapToDomain()`

A reconstrução Mongo → domínio deve recuperar:

```text
passwordHash
passwordRecovery
```

---

## 1.6 Criar testes de integração Mongo real

### Teste A — mudança de senha

```text
criar usuário
↓
login com senha antiga
↓
change password
↓
encerrar sessão
↓
novo processo/request
↓
login com senha nova
↓
senha antiga deve falhar
```

### Teste B — password recovery

```text
criar usuário
↓
request recovery
↓
persistir
↓
novo processo/request
↓
reset password
↓
login com senha nova
```

### Critério de aceite

O fluxo deve continuar correto após:

```text
process restart
```

e não apenas dentro do mesmo objeto em memória.

---

# 2. Corrigir transições concorrentes de WithdrawalRequest

## Problema

O update atual permite alterar uma withdrawal sem condicionar a transição ao estado anterior.

Isso permite uma race:

```text
A lê REQUESTED
B lê REQUESTED

A → APPROVED
B → REJECTED
```

ou outras transições inválidas.

---

## 2.1 Definir a máquina de estados formal

```text
REQUESTED
    ↓
VALIDATING
    ├──→ APPROVED
    └──→ REJECTED

APPROVED
    ↓
PROCESSING
    ├──→ COMPLETED
    └──→ FAILED

FAILED
    ↓
PROCESSING
```

Documentar quais transições são legais.

---

## 2.2 Adicionar controle otimista

Adicionar `version` ou mecanismo equivalente.

Exemplo conceitual:

```text
WHERE:
requestId = X
status = VALIDATING
version = N

SET:
status = APPROVED
version = N + 1
```

Se `modifiedCount === 0`:

```text
→ conflito de concorrência
→ não executar efeito adicional
→ registrar métrica/log
```

---

## 2.3 Impedir transições arbitrárias

Não permitir diretamente:

```text
REQUESTED → COMPLETED
REJECTED → COMPLETED
COMPLETED → PROCESSING
```

fora das regras do domínio.

---

## 2.4 Colocar rejeição financeira na mesma transação

Hoje o risco é:

```text
unlock wallet
↓
update withdrawal
```

Se o segundo passo falhar, o estado fica inconsistente.

Corrigir para:

```text
Mongo transaction
├── unlock wallet
└── withdrawal → REJECTED
```

---

## 2.5 Teste de concorrência

Criar teste:

```text
100 tentativas simultâneas
```

para a mesma withdrawal.

Esperado:

```text
1 transição válida
99 conflitos/rejeições
```

Nunca:

```text
wallet desbloqueada duas vezes
ledger duplicado
estado impossível
```

---

# 3. Tornar o claim `APPROVED → PROCESSING` atômico e obrigatório

## Problema

O worker pode continuar para o PSP mesmo se o sistema não conseguiu confirmar a mudança para `PROCESSING`.

Atualmente a falha de `markProcessingBestEffort()` é tratada de forma permissiva.

Isso não é seguro para uma operação financeira.

---

## 3.1 Criar método de claim atômico

Preferencialmente:

```text
claimForProcessing(requestId)
```

Condição:

```text
status = APPROVED
```

Atualização:

```text
status = PROCESSING
version++
processingAt = now
```

A operação deve ser atômica.

---

## 3.2 Alterar o worker

Fluxo obrigatório:

```text
APPROVED
   ↓
atomic claim
   ↓
sucesso?
 ├─ NÃO → não chama PSP
 └─ SIM → chama PSP
```

Eliminar semântica:

```text
markProcessingBestEffort()
```

para esse ponto crítico.

---

## 3.3 Testar falha Mongo

Simular:

```text
Mongo indisponível no claim
```

Esperado:

```text
PSP NÃO é chamado
```

---

## 3.4 Testar corrida entre workers

Executar dois workers contra a mesma withdrawal.

Esperado:

```text
worker A → PROCESSING
worker B → claim falha
```

Apenas A pode chamar o PSP.

---

# 4. Tornar idempotência uma garantia do limite do PSP

## Problema

O sistema pode:

```text
PSP recebeu pagamento
↓
resposta perdida
↓
worker reinicia
↓
retry
```

A solução precisa existir também no limite externo.

---

## 4.1 Definir contrato do adapter

O `requestId`/identificador da operação deve ser a chave idempotente externa.

Contrato conceitual:

```text
same requestId
+
same payout
=
same external operation
```

Repetir a chamada não pode criar outro payout.

---

## 4.2 Implementar no mock

O mock deve se comportar como um PSP correto:

```text
requestId A
→ payout 1

requestId A
→ retorna payout 1
```

Não:

```text
requestId A
→ payout 1

requestId A
→ payout 2
```

---

## 4.3 Implementar consulta de status

Usar o método equivalente a:

```text
getWithdrawalStatus(requestId)
```

para resolver ambiguidade:

```text
timeout
response perdida
worker reiniciado
```

---

## 4.4 Teste

Simular:

```text
payWithdrawal()
→ PSP executa
→ resposta é perdida
→ worker morre
→ recovery
→ getWithdrawalStatus()
```

Esperado:

```text
1 payout externo
1 ledger
1 withdrawal COMPLETED
```

---

# P1 — CONSISTÊNCIA E CONCORRÊNCIA

# 5. Corrigir refresh token rotation

## Problema

O fluxo:

```text
find session
↓
valida jwtId
↓
gera novo jwtId
↓
update
```

permite race entre duas requisições com o mesmo refresh token.

---

## 5.1 Implementar compare-and-set

Atualização conceitual:

```text
WHERE:
sessionId = X
AND jwtId = OLD_JTI
AND status = ACTIVE

SET:
jwtId = NEW_JTI
```

Somente uma requisição pode vencer.

---

## 5.2 Teste concorrente

Enviar o mesmo refresh token simultaneamente:

```text
request A
request B
```

Esperado:

```text
1 sucesso
1 rejeição
```

---

# 6. Fechar race entre Event/Market e colocação da aposta

## Problema

A aposta verifica:

```text
event = SCHEDULED
market = OPEN
```

e só depois executa a operação financeira.

Outro processo pode mudar o evento/mercado nesse intervalo.

Exemplo:

```text
T1 → lê SCHEDULED
T2 → evento vira LIVE
T1 → aceita aposta
```

---

## 6.1 Definir a regra de aceitação

A aposta deve possuir uma condição atômica equivalente a:

```text
event status esperado
AND market status esperado
AND odd/version esperado
```

---

## 6.2 Adicionar versionamento/lock

Opções possíveis:

- version do market;
- version da odd;
- condição atômica de update;
- snapshot de preço/estado validado dentro da transação.

Escolher a abordagem mais consistente com a arquitetura atual.

---

## 6.3 Teste concorrente

Executar:

```text
request A → placeBet
request B → suspendMarket
```

simultaneamente em dezenas/centenas de execuções.

O sistema não pode aceitar uma aposta contra um mercado já efetivamente suspenso pela regra de concorrência definida.

---

# 7. Remover histórico crescente da Wallet

## Problema

`Wallet` contém:

```text
balance
lockedBalance
transactions[]
```

enquanto o projeto já possui Ledger.

Isso cria:

- crescimento do documento;
- maior custo de escrita;
- mais contenção;
- risco futuro de limite de documento Mongo.

---

## 7.1 Redefinir responsabilidade

Wallet:

```text
balance
lockedBalance
version
metadata essencial
```

Ledger:

```text
histórico financeiro completo
```

---

## 7.2 Decidir se precisa manter histórico curto

Se alguma tela precisar das últimas transações, considerar:

```text
lastTransactions: N
```

ou consulta ao Ledger.

Nunca manter crescimento ilimitado.

---

## 7.3 Teste de regressão

Garantir que:

- saldo continua correto;
- ledger continua completo;
- APIs que exibem transações continuam funcionando.

---

# 8. Corrigir reclaim de idempotência Redis

## Problema

A implementação Redis faz:

```text
GET
↓
verifica stale
↓
SET
```

Isso não é atômico.

Dois workers podem assumir a mesma operação.

---

## 8.1 Substituir por operação atômica

Usar:

- Lua script;
- `SET ... NX`;
- compare-and-set;
- ou outro mecanismo transacional do Redis.

O comportamento desejado é:

```text
worker A → claim
worker B → rejeitado
```

---

## 8.2 Não engolir erro em operação crítica

O caminho financeiro não pode transformar:

```text
Redis error
```

em:

```text
success silencioso
```

Separar:

```text
cache opcional
```

de:

```text
critical idempotency state
```

---

# 9. Corrigir `decreaseExposure()`

## Problema

Atualmente, diminuir exposição e depois fazer:

```text
if exposure < 0
    exposure = 0
```

pode esconder inconsistência anterior.

---

## 9.1 Usar condição atômica

Garantir:

```text
exposure >= amount
```

antes da subtração.

Se falhar:

```text
→ detectar inconsistência
→ log estruturado
→ métrica
→ reconciliation path
→ erro
```

Não mascarar simplesmente com zero.

---

# P1 — CI E TESTES DE INTEGRAÇÃO

# 10. Corrigir o pipeline de integração do CI

## Problema

O workflow atual depende de `MONGODB_URI`/`REDIS_URL`, mas a infraestrutura do teste não está conectada de forma realmente reproduzível ao runner.

---

## 10.1 Criar serviço de teste dedicado

Preferencialmente:

```text
docker-compose.test.yml

mongodb
redis
integration-tests
```

O container de testes recebe:

```text
MONGODB_URI=mongodb://mongodb:27017/backbet-test?replicaSet=rs0
REDIS_URL=redis://redis:6379
```

---

## 10.2 Rodar testes dentro da rede Docker

Conceito:

```bash
docker compose -f docker-compose.test.yml up -d mongodb redis
docker compose -f docker-compose.test.yml run --rm integration-tests
```

Evitar depender de:

```text
localhost
127.0.0.1
IP do server01
```

para o CI.

---

## 10.3 Validar o workflow em ambiente limpo

Executar pelo GitHub Actions e confirmar:

```text
infra sobe
↓
healthcheck
↓
testes de integração
↓
cleanup
↓
exit 0
```

---

# 11. Ajustar `security:assess`

## Problema

O controle de exposição de serviços trata as portas publicadas como exposição indesejada, mesmo no laboratório privado.

---

## 11.1 Separar LAB e PROD

Adicionar contexto:

```text
LAB
PROD
```

### LAB

Permitir:

```text
192.168.22.250:27018
192.168.22.250:6379
```

quando explicitamente configurado.

### PROD

Bloquear:

```text
Mongo publicado
Redis publicado
```

---

## 11.2 O teste deve validar intenção

Não basta procurar `ports:`.

Verificar:

```text
bind address
environment
mode
```

e emitir o resultado de acordo com o contexto.

---

# P2 — PERFORMANCE

# 12. Corrigir `findByCategory()`

## Problema

Atualmente o padrão é próximo de:

```text
find({})
↓
sort
↓
filter(category)
```

Isso transfere trabalho ao Node.

---

## 12.1 Usar query Mongo

Fazer a busca diretamente por:

```text
{ category }
```

e deixar o Mongo utilizar índice.

---

## 12.2 Criar índice se necessário

Validar com:

```text
explain("executionStats")
```

---

# 13. Corrigir `LedgerRepository.sumByTypes()`

Evitar:

```text
buscar documentos
↓
somar no Node
```

Usar aggregation:

```text
$match
↓
$group
```

---

# 14. Baseline de performance

Depois das correções críticas, executar:

```text
50
100
150
200
300
500
```

concorrentes.

Registrar:

- throughput;
- p50;
- p95;
- p99;
- conflitos;
- retries;
- tempo de transação;
- CPU;
- RAM;
- Mongo latency;
- Redis latency.

---

# P2 — CRASH E RECOVERY

# 15. Testar crash no pior momento

Executar `docker kill` durante:

- depósito;
- aposta;
- settlement;
- saque;
- payout.

Casos:

```text
kill durante transaction
kill após commit
kill antes da response
kill durante retry
kill durante payout
```

Após cada teste:

```text
wallet
ledger
bet
withdrawal
risk
audit
```

devem continuar reconciliáveis.

---

# 16. Testar múltiplos workers

Subir mais de um worker e disputar a mesma operação.

Validar:

```text
claim
idempotency
ledger
payout
state transition
```

Nenhum deve duplicar efeito financeiro.

---

# P2 — BACKUP / RESTORE

# 17. Fazer restore completo

Fluxo:

```text
backup
↓
checksum
↓
restore
↓
contagem
↓
reconciliation
```

Conferir:

- users;
- wallets;
- ledger;
- bets;
- withdrawals;
- risk.

---

# 18. Fazer teste de restart total

```bash
docker compose down
docker compose up -d
```

Depois validar:

```text
/health
/readiness
workers
Mongo
Redis
queues
```

---

# P3 — LIMPEZA TÉCNICA

# 19. Revisar controllers grandes

Candidatos:

```text
AdminController
ApiServer
Swagger
WithdrawalPayoutWorker
```

Não refatorar apenas por quantidade de linhas.

Separar somente quando existirem responsabilidades independentes reais.

---

# 20. Revisar documentação

Depois das correções:

```text
README
ARCHITECTURE
DEFINITION_OF_DONE
GO_NOGO_FINAL
ESTADO-DO-PROJETO
todo.txt
```

Remover:

- números antigos;
- pendências já concluídas;
- descrições divergentes;
- portas incorretas;
- referências a comportamentos antigos.

---

# 21. Atualizar a matriz de riscos

Criar/atualizar:

| Risco | Estado | Evidência |
|---|---|---|
| password persistence | OPEN/CLOSED | teste Mongo |
| withdrawal race | OPEN/CLOSED | teste concorrente |
| duplicate payout | OPEN/CLOSED | PSP/idempotência |
| refresh rotation race | OPEN/CLOSED | teste concorrente |
| bet vs market race | OPEN/CLOSED | teste concorrente |
| Redis idempotency race | OPEN/CLOSED | teste concorrente |
| wallet growth | OPEN/CLOSED | arquitetura |
| CI integration | OPEN/CLOSED | GitHub Actions |

---

# Ordem final de execução

```text
1. Password persistence
2. Withdrawal state machine
3. Atomic APPROVED → PROCESSING
4. PSP idempotency contract
5. Refresh token CAS
6. Event/Market/Bets concurrency
7. Wallet history vs Ledger
8. Redis atomic reclaim
9. Risk decrement consistency
10. CI integration
11. security-assess LAB/PROD
12. Mongo query optimization
13. performance baseline
14. crash testing
15. multi-worker testing
16. backup/restore
17. final documentation
```

---

# Critérios para considerar a etapa crítica encerrada

## Autenticação

```text
✓ senha persiste no Mongo
✓ password recovery persiste
✓ recovery sobrevive restart
✓ refresh rotation é atômico
```

## Wallet / Financeiro

```text
✓ nenhuma operação duplica ledger
✓ nenhuma operação duplica payout
✓ saldo continua reconciliável
✓ rollback não deixa estado impossível
✓ concorrência não quebra invariantes
```

## Withdrawal

```text
✓ transições condicionais
✓ claim PROCESSING atômico
✓ apenas um worker executa payout
✓ retry é seguro
✓ PSP possui idempotência
✓ recovery de PROCESSING funciona
```

## Betting

```text
✓ mercado/evento não pode sofrer race perigosa
✓ settlement é idempotente
✓ risk é concorrente e atomicamente seguro
```

## Infraestrutura

```text
✓ CI executa integração real
✓ Docker rebuild limpo
✓ health/readiness
✓ crash recovery
✓ backup restore
```

---

# Estado desejado após este plano

```text
                         BackBet
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       domínio          persistência       externo
          │                 │                 │
          ▼                 ▼                 ▼
    invariantes          Mongo/Redis         PSP
    concorrência         transactions       KYC
    idempotência         recovery            SIGAP
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                     comportamento
                       verificável
```

O objetivo final não é ter apenas muitos testes. É conseguir demonstrar que o sistema continua correto em quatro condições simultâneas:

```text
concorrência
+
retry
+
falha
+
efeito externo
```

Esse é o principal critério de maturidade para a próxima etapa do BackBet.
