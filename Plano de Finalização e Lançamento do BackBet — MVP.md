Fase 1 — Corrigir o que ainda foi identificado
1. Corrigir AppError no MongooseEventRepository

Prioridade: P0 — pequeno e direto

Problema:

new AppError(
    'Erro ao buscar evento',
    'INTERNAL_SERVER_ERROR',
    500
)

O construtor espera:

AppError(code, message, statusCode)
Fazer

Corrigir apenas as chamadas desse repository.

Não fazer
refatorar AppError;
alterar tratamento global de erros;
mudar controllers;
reorganizar repositories;
criar nova hierarquia de exceções.
Teste

Verificar que uma falha do repository retorna:

code = INTERNAL_SERVER_ERROR
message = mensagem correta
status = 500
Fase 2 — Verificar a janela de crash do Withdrawal

Prioridade: P0/P1

Cenário identificado:

Wallet lock
    ↓
processo morre
    ↓
WithdrawalRequest ainda não foi criado

Resultado potencial:

saldo bloqueado
+
withdrawal inexistente
Primeiro passo

Não implementar solução imediatamente.

Pedir à IA:

Analise exclusivamente o fluxo de criação de withdrawal e determine se existe
uma janela de inconsistência entre o bloqueio da wallet e a criação da
WithdrawalRequest em caso de crash abrupto do processo.

Não altere código.

Mostre:
1. sequência exata das operações;
2. estado possível da wallet;
3. estado possível do withdrawal;
4. se o mecanismo atual já permite recuperação;
5. testes existentes que cobrem o cenário.

Só depois decidir.

Se realmente existir uma lacuna

Implementar a menor solução possível, preferencialmente reaproveitando mecanismos já existentes.

Não criar uma nova arquitetura de recovery.

Teste obrigatório

Simular:

lock
↓
crash
↓
restart
↓
recovery

e verificar:

wallet
withdrawal
ledger
Fase 3 — Auditoria rápida de consistência financeira

Prioridade: P0

Não é para reescrever nada.

É uma auditoria.

Faça a IA procurar:

balance
balanceCents
amount
amountCents
payout
potentialReturn
odds
exposure

e também:

parseFloat
Number(...)
toFixed(...)
Objetivo

Encontrar somente situações onde:

dinheiro ou cálculo financeiro crítico esteja sendo tratado incorretamente como ponto flutuante.

Regra

Se encontrar algo suspeito:

NÃO CORRIGIR AUTOMATICAMENTE

gerar relatório:

arquivo
linha
problema
risco
correção mínima sugerida

Você decide depois.

Isso impede uma busca genérica da IA de virar uma refatoração em massa.

Fase 4 — Validar os quatro pilares que já foram corrigidos

Aqui não é para alterar código. É para provar que continuam funcionando.

A. Event persistence

Validar:

create
↓
Mongo
↓
restart/reconnect
↓
find

O evento precisa continuar existindo.

B. Settlement transacional

Forçar:

Bet update
↓
erro proposital

Resultado esperado:

Bet      rollback
Risk     rollback
Wallet   rollback
Ledger   rollback
C. Wallet + Ledger

Forçar:

Wallet mutation
↓
Ledger failure

Resultado:

Wallet rollback
Ledger rollback

Nunca:

Wallet alterada
Ledger ausente
D. Idempotência

Testar:

mesma request
× várias vezes

Resultado:

1 operação real
+
replays

E:

PROCESSING
↓
processo morto
↓
timeout
↓
recovery
Fase 5 — Testes locais completos

Depois das correções:

npm ci
npm run typecheck
npm test

Depois os testes de:

integration
failure
load
security

Use os scripts que realmente existem no package.json.

Regra para IA

Se um teste falhar:

NÃO corrigir imediatamente tudo que parece relacionado.

Primeiro:

1. reproduzir
2. identificar causa
3. corrigir mínimo
4. testar novamente
Fase 6 — Docker

Antes de Ubuntu:

docker compose config
docker compose build
docker compose up

Verificar:

API
Redis
Workers
Mongo connection
health
readiness

Não alterar Dockerfile ou compose simplesmente porque alguma IA acha que a configuração poderia ser "melhor".

Primeiro faça funcionar.

Depois, melhorias ficam para outro ciclo.

Fase 7 — Server 02: MongoDB

Seu notebook dedicado ao Mongo:

Ubuntu Server
    ↓
Docker
    ↓
MongoDB
    ↓
replica set
    ↓
PRIMARY

Testar do Server 01:

connection
authentication
replica set
transactions

O objetivo não é HA.

É provar:

o BackBet consegue usar transações Mongo remotamente no ambiente planejado.

Fase 8 — Server 01: BackBet

Subir:

BackBet API
Redis
Workers

Configurar:

Mongo URI → Server 02
Redis → Server 01

Validar:

health
readiness
logs
workers
database connection
Fase 9 — Teste end-to-end

Executar o fluxo:

Usuário
  ↓
Login
  ↓
Depósito
  ↓
Wallet
  ↓
Evento
  ↓
Aposta
  ↓
Risk
  ↓
Settlement
  ↓
Wallet
  ↓
Ledger
  ↓
Withdrawal
  ↓
Worker
  ↓
PSP Mock
  ↓
Ledger

Depois conferir diretamente no Mongo.

A regra é:

Wallet
Ledger
Bet
Risk
Withdrawal
Treasury

precisam contar a mesma história.

Fase 10 — Testes de desastre controlado

Aqui começa a parte realmente útil do ambiente separado.

API
processo reiniciado
container reiniciado
Worker
worker morto durante withdrawal
worker reiniciado
Mongo
Mongo parado
Mongo iniciado
Redis
Redis parado
Redis iniciado
Concorrência
100 apostas simultâneas
Idempotência
100 requests
mesma Idempotency-Key
Settlement
settle
settle
settle

Tudo isso sem modificar código inicialmente.

O objetivo é descobrir bugs reais, não bugs imaginados.

Fase 11 — Correção baseada nos testes

Depois dos testes, classifique cada falha:

Tipo	Ação
Bug real	Corrigir
Configuração	Corrigir configuração
Ambiente	Corrigir ambiente
Teste incorreto	Corrigir teste
Melhoria futura	Registrar
Refatoração estética	Ignorar

A IA só deve atuar nos dois primeiros, e mesmo assim com alterações pequenas.

Fase 12 — Congelar o MVP

Quando:

typecheck ✓
unit ✓
integration ✓
failure ✓
Docker ✓
Mongo remoto ✓
Redis ✓
E2E ✓
concurrency ✓
recovery ✓

faça:

git tag v1.0.0-mvp

e considere o núcleo congelado.

A partir daí, qualquer mudança deve responder a uma destas perguntas:

Existe bug?

Existe requisito faltando?

Existe risco comprovado?

Se a resposta for "não, mas poderia ficar mais bonito", não mexa.

Ordem final
P0
├── AppError EventRepository
├── verificar withdrawal crash window
└── auditoria de valores monetários

P0 — validação
├── Event persistence
├── Settlement transaction
├── Wallet + Ledger atomicity
└── Idempotency recovery

P1 — ambiente
├── typecheck/tests
├── Docker
├── Mongo Server 02
├── BackBet Server 01
└── conexão entre servidores

P1 — validação real
├── E2E financeiro
├── concorrência
├── restart
├── crash recovery
├── Mongo failure
└── Redis failure

FINAL
└── corrigir apenas falhas encontradas
    ↓
    v1.0.0-MVP
    ↓
    congelar