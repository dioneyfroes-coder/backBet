Fase 0 — Preparação

Antes de alterar código:

git checkout -b fix/production-integrity
npm ci
npm run typecheck
npm test

Se os testes atuais passarem, salve esse estado como referência.


Fase 1 — Persistência dos Events
Problema

Atualmente:

EventRepository
└── eventos em memória

enquanto:

Bet
└── eventId

fica persistido no Mongo.

Se reiniciar o container:

Bet continua existindo
Event desaparece
Objetivo

Criar:

MongooseEventRepository

seguindo o mesmo padrão dos outros repositories.

Passos

1. Criar schema Mongo

Algo conceitualmente semelhante a:

Event
├── id
├── name
├── sport
├── status
├── startsAt
├── markets[]
├── createdAt
└── updatedAt

Se o projeto já possui Market/Odd separados, respeitar a modelagem existente em vez de inventar outra.

2. Implementar interface

O novo repository deve implementar exatamente a interface usada pelo domínio:

findById()
findAll()
create()
update()
delete()
...

somente os métodos realmente necessários.

3. Alterar o factory

Onde hoje existe algo equivalente a:

new EventRepository()

quando:

USE_MONGOOSE_PERSISTENCE=true

usar:

MongooseEventRepository

4. Manter InMemoryEventRepository

Ele continua existindo para:

unit tests

Não substitua tudo por Mongo.

Testes obrigatórios
create event
→ Mongo

find event
→ Mongo

restart repository
→ event continua existindo

create bet
→ eventId aponta para event persistido
Critério de conclusão

Não pode existir mais este cenário:

USE_MONGOOSE_PERSISTENCE=true
+
EventRepository em memória
Fase 2 — Settlement administrativo transacional

Esse é um dos mais importantes.

Problema

Fluxo normal:

BetService
   ↓
transactionRunner
   ↓
Mongo transaction

Mas o admin cria outro BetService sem transaction runner.

Objetivo

Fazer:

POST /admin/bets/:id/settle

usar exatamente a mesma garantia transacional do fluxo normal.

Passos

1. Identificar a composição atual

Localizar:

adminRoutes
BetService
WalletService
RiskService
BetRepository
transactionRunner

2. Não criar um segundo mecanismo de transação.

Reutilizar o existente.

Algo conceitualmente:

const betService = new BetService(
    betRepository,
    eventRepository,
    walletService,
    riskService,
    transactionRunner
);

ou adaptar a factory/container que já existe.

3. Verificar o fluxo inteiro de settlement

Tem que ser:

BEGIN TRANSACTION

Bet → resolved
Risk → released
Wallet → credited
Ledger → appended

COMMIT

Se qualquer etapa falhar:

ROLLBACK
Teste crítico

Forçar falha artificial depois de alterar uma das entidades:

Bet atualizado
↓
erro proposital
↓
ROLLBACK

Depois verificar:

Bet = estado original
Wallet = estado original
Risk = estado original
Ledger = estado original

Esse teste vale mais que dez testes felizes.

Fase 3 — Wallet + Ledger atomicamente

Aqui eu faria uma pequena mudança arquitetural, mas sem refatoração geral.

Problema atual

Existe a possibilidade de:

Wallet UPDATE
↓
Ledger falha
↓
erro apenas registrado

Isso pode gerar:

Wallet ≠ Ledger

Em sistema financeiro, isso não é aceitável.

Solução

A operação financeira deve ser uma unidade:

Transaction
│
├── Wallet mutation
│
└── Ledger entry
Passo 1

Localizar todas as operações que modificam saldo:

deposit
bet
cancel
settlement
withdrawal
refund

Faça uma tabela durante a implementação:

Operação	Wallet	Ledger	Risk	Transaction
Deposit	✓	✓	-	✓
Bet	✓	✓	✓	✓
Cancel	✓	✓	✓	✓
Win	✓	✓	✓	✓
Withdrawal	✓	✓	-	✓

Não avance enquanto alguma operação financeira importante estiver fora desse mapa.

Passo 2

Fazer o appendLedger() participar da mesma sessão Mongo.

Conceitualmente:

session.withTransaction(async () => {
    await wallet.update(..., { session });
    await ledger.insert(..., { session });
});
Passo 3

Remover o comportamento:

catch(error) {
    log(error);
}

para operações que fazem parte da transação.

O correto é:

catch(error) {
    throw error;
}

A infraestrutura registra o erro, mas a operação financeira deve falhar.

Teste

Simular:

Wallet update
✓

Ledger insert
✗

Resultado:
Wallet rollback
Ledger rollback

Depois:

Wallet = original
Ledger = original
Fase 4 — Corrigir oddId

Esse é simples e deve ser feito junto com os anteriores.

No MongooseBetRepository.create() você encontrou:

oddId: bet.id

Isso aparentemente está incorreto.

Objetivo

Garantir:

Bet
├── eventId
├── marketId
├── oddId
└── odds

com:

oddId = ID da odd selecionada
Antes de alterar

Trace a origem:

API request
 ↓
BetService
 ↓
domain Bet
 ↓
repository

Confirme qual propriedade contém o oddId.

Depois corrija o mapping.

Teste

Criar uma aposta:

oddId = "odd-123"

Consultar Mongo:

oddId = "odd-123"

e não:

oddId = bet.id
Fase 5 — Idempotência Mongo

Isso não precisa bloquear seu primeiro boot, mas eu faria antes de chamar o sistema de "MVP fechado".

Problema 1 — TTL

Você documenta:

24h

mas precisa garantir isso no Mongo.

Criar índice TTL sobre:

createdAt

com:

expireAfterSeconds: 86400

ou valor configurável.

Problema 2 — PROCESSING preso

Cenário:

request
 ↓
PROCESSING
 ↓
container morre

Quando voltar:

PROCESSING

não pode ficar eterno.

Solução

Adicionar algo como:

processingAt

e considerar a operação abandonada após determinado período.

Por exemplo:

PROCESSING > 5 min

pode ser recuperado/reprocessado conforme a natureza da operação.

Não use automaticamente a mesma estratégia para todas as operações financeiras. Para operações críticas, a chave deve continuar vinculada a uma operação realmente idempotente.

Fase 6 — Withdrawal / PSP

Aqui eu não tentaria resolver tudo agora.

O objetivo do MVP é garantir que o adapter permita recuperação.

Fluxo ideal:

Withdrawal
   ↓
PSP request
   ↓
PSP idempotency key
   ↓
PROCESSING

Se o worker morrer:

PROCESSING
   ↓
consult PSP
   ↓
PAID / FAILED / UNKNOWN
Não faça
PROCESSING
↓
retry cego
↓
novo pagamento
Faça
PROCESSING
↓
consultar status externo
↓
decidir

O MockPaymentAdapter deve simular isso nos testes.

Fase 7 — Auditoria final de dinheiro

Depois das correções, faça uma busca no código por:

balance
amount
odds
return
payout
exposure

e procure operações usando:

number
float
parseFloat

Não precisa eliminar number do projeto inteiro.

A questão é:

nenhum valor monetário persistente ou cálculo financeiro crítico deve depender de floating point.

Fase 8 — Testes antes do Ubuntu

Depois dos patches:

npm ci
npm run typecheck
npm test
npm run test:integration
npm run test:failure
npm run test:load

Se algum script não existir, não invente outro imediatamente. Verifique os scripts reais do package.json.

Depois:

docker compose config
docker compose build

Se estiver tudo certo:

docker compose up
Fase 9 — Teste nos dois notebooks

Sua arquitetura:

Notebook 1
Ubuntu Server
Docker
│
├── BackBet API
├── Redis
├── Workers
└── observabilidade
        │
        │ LAN
        ▼
Notebook 2
Ubuntu Server
Docker
│
└── MongoDB replica set
Primeiro

Mongo isoladamente.

Depois

API conectando ao Mongo remoto.

Depois

Redis.

Depois

Workers.

Finalmente

Sistema inteiro.

Não coloque tudo para subir de uma vez e depois tentar descobrir qual container virou uma batata.

Fase 10 — Teste financeiro end-to-end

Execute exatamente:

Usuário
 ↓
deposit
 ↓
wallet
 ↓
event
 ↓
market
 ↓
odd
 ↓
bet
 ↓
risk
 ↓
settlement
 ↓
wallet
 ↓
ledger
 ↓
withdrawal
 ↓
worker
 ↓
PSP mock
 ↓
ledger

Depois consulte diretamente Mongo:

users
wallets
bets
events
risk/exposure
ledger
withdrawals
idempotency
audit
treasury

A regra é:

o estado de todas as entidades precisa contar a mesma história.

Fase 11 — Testes de falha

Depois do caminho feliz:

Aposta
request duplicado
request concorrente
Mongo indisponível
Redis indisponível
Settlement
settlement duplicado
falha depois do Bet update
falha depois do Wallet update
falha no Ledger
Withdrawal
worker morto
PSP timeout
PSP retorna UNKNOWN
request duplicado
Mongo
restart
connection loss
replica set restart
Fase 12 — Congelamento

Quando tudo passar:

v1.0-MVP

e não adicionar mais funcionalidades.

A partir daí:

BUG encontrado
   ↓
reproduzir
   ↓
teste
   ↓
corrigir
   ↓
teste

Não:

"Já que estamos aqui, vamos melhorar a arquitetura..."

Esse é o buraco negro clássico de projeto com IA.

Ordem exata que eu seguiria
01. MongooseEventRepository
        ↓
02. Settlement administrativo transacional
        ↓
03. Wallet + Ledger atomicidade
        ↓
04. Corrigir oddId
        ↓
05. Idempotência TTL
        ↓
06. Recuperação de PROCESSING
        ↓
07. Revisar withdrawal/PSP
        ↓
08. typecheck + unit tests
        ↓
09. integration tests
        ↓
10. Docker build
        ↓
11. Ubuntu Server #2 / Mongo
        ↓
12. Ubuntu Server #1 / BackBet
        ↓
13. E2E financeiro
        ↓
14. testes de concorrência
        ↓
15. testes de falha
        ↓
16. congelar MVP
Prioridade

P0 — fazer antes do servidor:

Event persistente
Settlement administrativo transacional
Wallet + Ledger atômicos
oddId

P1 — fazer antes de dinheiro real:

TTL/lease de idempotência
recuperação de withdrawals
testes de recuperação após crash
reconciliação financeira

P2 — depois do MVP:

PSP real
ingestão esportiva real
HA Mongo
escalabilidade horizontal
frontend administrativo completo
melhorias de observabilidade

O objetivo agora não é transformar o BackBet em uma Bet365 de garagem. É provar que o núcleo financeiro permanece consistente quando o sistema é executado de verdade.