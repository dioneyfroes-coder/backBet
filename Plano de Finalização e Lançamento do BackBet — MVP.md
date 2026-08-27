# Plano de Finalização e Lançamento do BackBet — MVP

## 1. Objetivo

Este documento define o caminho para levar o **BackBet** do estado atual até uma versão que possa ser considerada:

1. **MVP tecnicamente lançável**;
2. **financeiramente consistente**, evitando criação/perda de saldo por falhas, concorrência ou duplicidade;
3. **operacionalmente administrável**;
4. **apresentável como projeto de portfólio profissional**;
5. tecnicamente preparada para ser usada como **software B2B por um operador autorizado**, caso essa seja a direção comercial.

Há uma distinção importante:

> **"Pronto para lançar" tecnicamente não significa "autorizado para operar apostas".**

No Brasil, desde 1º de janeiro de 2025, apenas empresas autorizadas pela Secretaria de Prêmios e Apostas do Ministério da Fazenda podem operar nacionalmente apostas de quota fixa. A autorização envolve requisitos jurídicos, fiscais, econômico-financeiros, técnicos e de idoneidade.

Portanto, o BackBet pode ser finalizado como **produto tecnológico/MVP**, mas não deve ser colocado para aceitar dinheiro real de apostadores brasileiros sem que a estrutura jurídica, regulatória, certificação e operação correspondente estejam resolvidas.

---

# 2. Estado atual do BackBet

A versão atual já possui uma base consideravelmente acima de um CRUD convencional.

Há:

- TypeScript;
- Express;
- MongoDB/Mongoose;
- Redis;
- JWT/Passport;
- Zod;
- rate limiting;
- Helmet;
- Jest;
- Supertest;
- CI;
- OpenTelemetry;
- Prometheus;
- Swagger/OpenAPI;
- workers;
- idempotência;
- carteira;
- apostas;
- risco;
- treasury;
- pagamentos/Pix através de ports/adapters;
- recuperação de senha;
- documentação extensa;
- separação de domínio, aplicação e infraestrutura.

A evolução mais importante recente foi na parte financeira:

```text
Money
  ↓
centavos internos
  ↓
controle de versão da carteira
  ↓
transações MongoDB
  ↓
idempotência
  ↓
workers de saque
```

Isso é uma base adequada para continuar.

Entretanto, há **quatro problemas prioritários que ainda impedem considerar o sistema financeiramente fechado**:

```text
1. Mongo ainda persiste dinheiro como Number/decimal de aplicação.
2. RiskService faz verificação antes da transação e não reserva exposição atomicamente.
3. Liability ainda usa cálculos independentes com number.
4. O projeto ainda não possui Docker/ambiente reproduzível no ZIP atual.
```

---

# 3. Regra geral para finalizar o projeto

A partir deste ponto, o objetivo não deve ser adicionar funcionalidades indiscriminadamente.

A regra deve ser:

> **corrigir, testar, tornar observável e documentar o que já existe.**

O BackBet já tem funcionalidades suficientes para um MVP.

Não adicionar novos jogos, novos tipos de aposta, novos métodos de pagamento ou novas abstrações antes de fechar as partes abaixo.

---

# 4. Fase 0 — Congelar o escopo do MVP

Antes de escrever código, definir exatamente o que será considerado "v1".

## Escopo recomendado

### Usuário

- cadastro;
- login;
- autenticação;
- recuperação de senha;
- atualização cadastral;
- gerenciamento de Pix;
- bloqueio/desbloqueio;
- encerramento de conta.

### Carteira

- depósito;
- saldo disponível;
- saldo bloqueado;
- saque;
- histórico;
- idempotência;
- auditoria.

### Apostas

- listar eventos;
- listar mercados;
- consultar odds;
- realizar aposta;
- cancelar quando permitido;
- resolver aposta;
- pagamento de prêmio;
- histórico.

### Risco

- limite por aposta;
- limite de exposição;
- limite por evento;
- limite por mercado;
- velocidade;
- blacklist;
- whitelist;
- exposição atual.

### Operação

- health check;
- readiness;
- logs;
- métricas;
- tracing;
- workers;
- recuperação de falha;
- backups.

### Remover do MVP operacional

O **CoinFlip deve permanecer desligado por padrão** na primeira versão comercial.

Ele adiciona:

- outro domínio de jogo;
- regras matemáticas;
- auditoria adicional;
- necessidade de certificação caso seja oferecido como jogo online;
- mais superfície de fraude;
- mais complexidade operacional.

A regulamentação brasileira estabelece exigências específicas para jogos online e certificação.

O MVP deve começar com **apostas esportivas de quota fixa**, não com uma plataforma de cassino completa.

---

# 5. Fase 1 — Fechar definitivamente o modelo monetário

Esta é a etapa mais importante.

## 5.1 Escolher uma representação única

A recomendação para o BackBet é:

```text
MongoDB
    ↓
inteiro em centavos

Domain
    ↓
Money

API
    ↓
valor decimal
```

Exemplo:

```text
R$ 157,83

Mongo:
15783

Domain:
Money(157.83, BRL)

API:
{
  "amount": 157.83,
  "currency": "BRL"
}
```

Não deve haver lugares diferentes utilizando:

```text
number
float
decimal
string monetária
centavos
```

sem uma regra clara.

## 5.2 Alterar schemas

Migrar:

```text
Wallet.balance
Wallet.lockedBalance
Transaction.amount
Bet.amount
Bet.potentialReturn
RiskProfile.exposure
RiskProfile.maxExposure
Treasury values
```

para representação inteira em centavos.

Exemplo:

```ts
balanceCents: number
lockedBalanceCents: number
```

ou manter os nomes atuais, desde que fique explicitamente documentado que o valor armazenado é inteiro em centavos.

## 5.3 Criar Money completo

O `Money` atual está melhor, mas ainda aceita:

```ts
new Money(10.999, 'BRL')
```

e arredonda.

Para dinheiro real, o comportamento deve ser decidido explicitamente.

Minha recomendação:

```text
10.00 → válido
10.99 → válido
10.999 → rejeitar
```

O arredondamento deve acontecer somente em operações matemáticas nas quais a regra do domínio determinar arredondamento.

## 5.4 Unificar `Money` e `BetAmount`

Hoje existe lógica monetária duplicada entre:

```text
Money
BetAmount
```

Remover essa duplicação.

Idealmente:

```text
Money
  ↓
BetAmount apenas como regra específica de aposta
```

e não como outra implementação paralela de dinheiro.

---

# 6. Fase 2 — Tornar liability matematicamente consistente

Criar uma operação de domínio única para:

```text
stake × (odds - 1)
```

Em vez de espalhar:

```ts
Math.round(...)
Number(...toFixed(2))
```

por diferentes serviços.

Criar algo conceitualmente equivalente a:

```text
calculateLiability(
    Money stake,
    Odds odds
): Money
```

Então:

```text
Bet
Risk
Treasury
Reports
```

passam a usar exatamente a mesma fórmula.

Isso evita que:

```text
BetService
```

calcule um valor enquanto:

```text
RiskService
```

calcula outro.

## Testes obrigatórios

Testar:

```text
R$ 10,00 @ 1.01
R$ 10,00 @ 1.10
R$ 10,00 @ 2.00
R$ 100,00 @ 10.00
valores mínimos
valores máximos
casas decimais
```

---

# 7. Fase 3 — Transformar a carteira em um pequeno ledger confiável

O saldo não deve ser tratado apenas como um número mutável.

A arquitetura recomendada:

```text
Ledger / Transactions
        ↓
saldo derivado ou conciliável
        ↓
Wallet
```

Cada movimento financeiro deve possuir:

```text
transactionId
userId
type
amount
currency
referenceId
source
status
createdAt
metadata
```

Exemplos:

```text
DEPOSIT
BET_DEBIT
BET_REFUND
BET_WIN
WITHDRAWAL_HOLD
WITHDRAWAL_COMPLETED
WITHDRAWAL_REVERSED
```

## Regra

Nenhuma operação deve simplesmente:

```text
saldo -= X
```

sem deixar uma representação auditável do motivo.

---

# 8. Fase 4 — Fechar concorrência da carteira

A versão atual já possui controle de versão.

Manter isso.

Mas escrever testes que simulem:

```text
100 requisições simultâneas
```

para:

```text
deposit
withdraw
lock
unlock
bet
```

Exemplo:

```text
saldo inicial: R$ 100,00

100 × saque de R$ 2,00
```

O resultado esperado:

```text
50 operações aprovadas
50 rejeitadas
saldo = R$ 0,00
```

Nunca:

```text
saldo negativo
saldo incorreto
perda silenciosa
duplicação
```

---

# 9. Fase 5 — Corrigir a concorrência do RiskService

Este é atualmente o problema arquitetural financeiro mais importante que ainda existe.

Hoje o fluxo é aproximadamente:

```text
canPlaceBet()
      ↓
consulta exposição
      ↓
permite
      ↓
transaction
      ├── withdraw
      ├── create bet
      └── register exposure
```

Duas apostas simultâneas podem passar na mesma verificação.

## Solução

A reserva de exposição precisa ser atômica.

Conceitualmente:

```text
UPDATE risk_profile
SET exposure = exposure + liability
WHERE userId = X
AND exposure + liability <= maxExposure
```

Se a alteração não ocorrer:

```text
RISK_LIMIT_EXCEEDED
```

A operação deve falhar.

O mesmo princípio deve ser aplicado a:

```text
limite por usuário
limite por evento
limite por mercado
```

## Resultado esperado

Dois requests concorrentes não podem juntos ultrapassar:

```text
MAX_EXPOSURE_PER_USER
MAX_EXPOSURE_PER_EVENT
MAX_EXPOSURE_PER_MARKET
```

---

# 10. Fase 6 — Não calcular exposição inteira a partir de todas as apostas em cada request

O `RiskService` atualmente consulta apostas pendentes e recalcula exposição.

Isso pode servir para:

```text
reconciliação
```

mas não deve ser o caminho crítico de cada aposta.

Usar:

```text
RiskProfile.exposure
```

como estado operacional.

E manter um processo de reconciliação:

```text
RiskProfile
     ↓
exposição atual

Bet history
     ↓
fonte para auditoria/reconciliação
```

Criar um job administrativo:

```text
recalculateRiskExposure(userId)
```

para verificar divergências.

---

# 11. Fase 7 — Fechar idempotência

A implementação atual de idempotência é uma boa evolução, mas precisa ser validada em cenários reais.

Testar:

```text
request A
request A repetido
request A concorrente
request A após timeout
request A depois de resposta perdida
request A com payload diferente
```

Especialmente:

```text
deposit
withdrawal
bet
bet cancellation
bet settlement
Pix confirmation
payout
```

## Regra

A mesma operação financeira nunca pode produzir:

```text
2 débitos
2 créditos
2 apostas
2 saques
2 pagamentos
```

por causa de retry.

---

# 12. Fase 8 — Separar claramente estados financeiros

Evitar estados genéricos.

Uma retirada deveria possuir ciclo semelhante a:

```text
REQUESTED
   ↓
VALIDATING
   ↓
APPROVED
   ↓
PROCESSING
   ↓
COMPLETED
```

ou:

```text
FAILED
CANCELED
REVERSED
```

O dinheiro não deve desaparecer durante:

```text
PROCESSING
```

Ele deve estar representado como:

```text
available balance
locked balance
```

ou equivalente no ledger.

---

# 13. Fase 9 — Fechar pagamento/Pix

O código atual possui:

```text
MockPixProvider
MockPaymentAdapter
TestPaymentAdapter
```

Isso é correto para desenvolvimento.

Mas **não é integração de produção**.

Para lançar dinheiro real será necessário escolher um PSP/instituição autorizada e implementar:

```text
create charge
webhook
verify signature
payment confirmation
duplicate notification
timeout
refund
payout
failure
reconciliation
```

Nunca aceitar:

```text
POST /payment/confirm
```

como prova suficiente de pagamento.

A confirmação deverá vir do provedor por mecanismo autenticado/verificável.

A regulamentação brasileira possui regras específicas para transações de pagamento de operadores autorizados.

---

# 14. Fase 10 — Criar reconciliação financeira

Este é um item obrigatório antes de dinheiro real.

Criar um processo diário que compare:

```text
Wallet
vs
Ledger
vs
Bet
vs
Withdrawal
vs
Payment Provider
vs
Treasury
```

Exemplo:

```text
saldo do usuário
=
depósitos
- apostas
+ prêmios
- saques
+ estornos
```

Qualquer diferença deve gerar:

```text
RECONCILIATION_MISMATCH
```

e não ser corrigida silenciosamente.

Criar também relatório:

```text
total deposits
total withdrawals
total bets
total payouts
house revenue
pending funds
unreconciled funds
```

---

# 15. Fase 11 — Fechar Treasury

O módulo Treasury já existe.

Agora ele precisa ter uma propriedade importante:

> **O saldo da casa não pode ser simplesmente um número editável.**

Cada movimentação deve ter:

```text
entrada
saída
origem
referência
valor
data
saldo após operação
```

Criar:

```text
Treasury reconciliation
```

com periodicidade definida.

---

# 16. Fase 12 — Segurança da aplicação

Antes do deploy:

### Autenticação

Verificar:

- senha com hash forte;
- expiração de tokens;
- refresh/revogação;
- proteção contra brute force;
- recuperação de senha;
- enumeração de usuários;
- sessão;
- MFA quando necessário.

### Autorização

Testar explicitamente:

```text
user A → recurso de user B
user → endpoint administrativo
user → treasury
user → risk administration
```

Tudo deve retornar:

```text
403
```

quando apropriado.

### HTTP

Manter:

```text
Helmet
CORS restrito
rate limit
payload limit
validation
```

e verificar configuração de produção.

---

# 17. Fase 13 — Segurança específica de dinheiro

Adicionar limites independentes para:

```text
depósito por operação
depósito por dia
saque por operação
saque por dia
número de saques
número de depósitos
```

Adicionar mecanismos de detecção para:

```text
múltiplos saques rápidos
mudança de Pix seguida de saque
múltiplas contas
comportamento anômalo
tentativas repetitivas
```

Isso não precisa virar um sistema sofisticado de machine learning.

Regras determinísticas já são suficientes para o MVP.

---

# 18. Fase 14 — KYC, autenticação e jogo responsável

Para operação real no Brasil, esta área não pode ser deixada como "feature futura".

As regras atuais exigem mecanismos específicos de autenticação, inclusive reconhecimento facial em situações como retirada de valores, e nova autenticação após determinados períodos de inatividade. Também há exigências de verificação de localização.

O produto deverá ter integração com:

```text
KYC provider
biometria
prova de vida
CPF
verificação de identidade
geolocalização
device integrity
```

A localização não pode depender exclusivamente de IP; a regulamentação exige mecanismos capazes de determinar a localização física e prevê mecanismos antifraude relacionados a VPN/proxy e adulteração de dispositivo.

Também deverão ser implementadas as regras de jogo responsável e comunicação/publicidade aplicáveis.

---

# 19. Fase 15 — Auditoria e retenção de dados

Criar uma política formal de retenção.

Para operação regulada, os dados de apostadores e operações devem ser mantidos com backup por **no mínimo cinco anos**, com atualização pelo menos a cada 24 horas e testes de integridade/correspondência pelo menos a cada sete dias.

Implementar:

```text
audit events
immutable financial records
backup
restore test
retention policy
access logs
admin action logs
```

Nunca depender somente do log textual da aplicação para auditoria financeira.

---

# 20. Fase 16 — SIGAP e conformidade regulatória

Se o software for destinado a um operador brasileiro real, deve existir planejamento de integração com o **SIGAP**.

O Ministério da Fazenda mantém documentação técnica para integração, validação e transmissão de dados pelo SIGAP.

O sistema deverá ser capaz de fornecer os dados necessários sobre:

```text
apostadores
apostas
carteiras
operações
dados agregados
```

Além disso, os certificados de sistemas precisam considerar os requisitos das normas técnicas da SPA, incluindo segurança, pagamentos, prevenção à lavagem de dinheiro, jogo responsável e monitoramento.

---

# 21. Fase 17 — Docker

O ZIP atual **não contém Dockerfile nem docker-compose**.

Isso precisa ser resolvido.

Criar:

```text
Dockerfile
docker-compose.yml
.dockerignore
```

O ambiente local deverá subir:

```text
backbet
mongodb
redis
opcionalmente otel/observability
```

Exemplo:

```text
docker compose up -d
```

deve produzir um ambiente funcional sem configuração manual obscura.

## Dockerfile

Usar build multi-stage:

```text
builder
   ↓
npm ci
   ↓
npm run build
   ↓
runtime
   ↓
somente produção
```

Não colocar:

```text
node_modules
source desnecessário
.env
logs
```

na imagem final.

---

# 22. Fase 18 — Ambiente de testes reproduzível

Criar três ambientes conceituais:

```text
development
test
production
```

O teste não deve depender de:

```text
MongoDB pessoal
Redis pessoal
configuração da máquina
```

Preferência:

```text
docker compose
```

para infraestrutura de integração.

---

# 23. Fase 19 — Rodar o pipeline completo

Antes de considerar terminado:

```bash
npm ci
npm run lint
npm run test:coverage
npm run build
```

Depois:

```bash
docker compose build
docker compose up
```

e testar endpoints reais.

O `npm run check` existente deve se tornar o **gate obrigatório do projeto**.

Nenhum merge para `main` se:

```text
lint ❌
tests ❌
coverage ❌
build ❌
```

---

# 24. Fase 20 — Testes que realmente faltam

Não basta ter muitos testes unitários.

Criar uma matriz de cenários críticos.

## Carteira

```text
saldo zero
saldo insuficiente
saque concorrente
depósito concorrente
versão conflitante
rollback
```

## Aposta

```text
aposta normal
aposta simultânea
saldo insuficiente
evento encerrado
mercado encerrado
odd inválida
risco excedido
rollback da transação
```

## Settlement

```text
WIN
LOSS
CANCEL
duplicação de settlement
retry
```

## Withdrawal

```text
request
processing
success
failure
retry
duplicate worker
provider timeout
provider duplicate response
```

## Pix

```text
webhook duplicado
webhook inválido
pagamento atrasado
pagamento confirmado
pagamento cancelado
valor divergente
reference divergente
```

---

# 25. Fase 21 — Teste de carga

Antes do lançamento, executar pelo menos:

```text
100 usuários simultâneos
500 apostas simultâneas
100 saques concorrentes
100 depósitos concorrentes
```

O objetivo não é provar que a infraestrutura aguenta milhões de usuários.

O objetivo é provar que:

```text
concorrência ≠ corrupção financeira
```

Essa é uma propriedade muito mais importante para o MVP.

---

# 26. Fase 22 — Teste de falhas

Simular:

```text
Mongo cai
Redis cai
worker cai
processo Node morre
rede cai
payment provider demora
payment provider responde duas vezes
request expira
database transaction aborta
```

Pergunta para cada cenário:

> O sistema perde dinheiro, cria dinheiro, duplica uma operação ou deixa dinheiro preso?

Cada resposta deve possuir uma estratégia de recuperação.

---

# 27. Fase 23 — Observabilidade

O projeto já possui uma boa base.

Agora definir alertas úteis.

### Alertas críticos

```text
Mongo unavailable
Redis unavailable
transaction failures
wallet conflicts
payment failures
withdrawal queue backlog
reconciliation mismatch
risk inconsistencies
5xx spike
latency spike
```

### Métricas

```text
bets_total
bets_rejected
bets_won
bets_lost
deposits_total
withdrawals_total
payout_failures
wallet_conflicts
idempotency_conflicts
risk_rejections
reconciliation_mismatches
```

---

# 28. Fase 24 — Backup e recuperação

Não basta configurar backup.

Testar:

```text
backup
↓
destruir ambiente
↓
restore
↓
validar dados
```

Criar procedimento documentado para:

```text
RTO
RPO
restore
rollback
disaster recovery
```

Para um MVP pequeno, não precisa de uma arquitetura espacial da NASA.

Mas precisa saber responder:

> "O banco foi destruído às 3h da manhã. Como recuperamos?"

---

# 29. Fase 25 — Deploy

Arquitetura inicial suficiente:

```text
Internet
   ↓
Cloudflare
   ↓
Load Balancer / Reverse Proxy
   ↓
BackBet API
   ├── MongoDB
   ├── Redis
   └── Workers
```

Separar:

```text
API
worker de saque
worker de e-mail
worker de contatos
```

quando necessário.

Não colocar MongoDB publicamente acessível.

Não deixar Redis publicamente acessível.

---

# 30. Fase 26 — Secrets

Nenhum segredo no Git.

Usar:

```text
JWT_SECRET
MONGO_URI
REDIS_URL
SMTP_PASSWORD
PAYMENT_PROVIDER_KEY
PIX_PROVIDER_KEY
OTEL credentials
```

via secret manager ou variáveis de ambiente protegidas.

Criar `.env.example`.

O `.env.example` deve conter:

```text
nome
descrição
exemplo seguro
obrigatoriedade
```

sem segredo real.

---

# 31. Fase 27 — Segurança operacional

Antes do primeiro deploy:

```text
HTTPS
firewall
SSH por chave
SSH root desabilitado
updates automáticos de segurança
Mongo privado
Redis privado
logs sem secrets
backups
monitoramento
```

Também fazer scan das dependências.

---

# 32. Fase 28 — Administração

O MVP precisa de uma forma controlada de operar o sistema.

Não necessariamente um frontend administrativo completo.

Inicialmente pode existir uma API/admin CLI para:

```text
consultar usuário
consultar carteira
consultar aposta
consultar saque
consultar depósito
bloquear usuário
resolver incidente
consultar treasury
consultar risco
consultar auditoria
```

Toda operação administrativa precisa registrar:

```text
quem
quando
o quê
antes
depois
motivo
```

---

# 33. Fase 29 — Interface mínima

O BackBet atual é principalmente backend.

Para transformá-lo em produto demonstrável, será necessário pelo menos um cliente mínimo:

```text
login
cadastro
saldo
eventos
aposta
histórico
depósito
saque
perfil
```

Não precisa ser bonito.

Para o primeiro MVP:

> funcional > bonito.

---

# 34. Fase 30 — Contrato da API

Fixar:

```text
OpenAPI
versionamento
HTTP status codes
error codes
pagination
authentication
idempotency
```

Exemplo:

```text
/api/v1/...
```

Nunca depender de mudanças arbitrárias nos contratos depois que clientes começarem a consumir a API.

---

# 35. Fase 31 — Documentação

O projeto já possui documentação demais para simplesmente adicionar mais documentos.

Agora é hora de **simplificar**.

O README principal deve responder em poucos minutos:

```text
O que é BackBet?
Qual problema resolve?
Arquitetura
Stack
Como executar
Como testar
Como usar a API
Como subir Docker
Como funciona o dinheiro
Como funciona a concorrência
Como contribuir
Status do projeto
```

Documentos históricos ou redundantes devem ser consolidados.

---

# 36. Fase 32 — Corrigir pequenas dívidas existentes

Corrigir:

```text
aplication → application
```

e inconsistências semelhantes.

Revisar também:

```text
scripts duplicados
configurações duplicadas
naming
imports
comentários obsoletos
documentação divergente
```

Não fazer refatoração gigantesca.

---

# 37. Fase 33 — Criar relatório financeiro interno

Criar endpoint/admin report:

```text
Daily Financial Summary
```

com:

```text
deposits
withdrawals
bets
gross gaming revenue
prizes
refunds
house balance
pending withdrawals
pending bets
exposure
```

Isso transforma o sistema de "API de apostas" em algo que começa a parecer produto operável.

---

# 38. Fase 34 — Definir invariantes financeiros

Documentar e testar formalmente regras como:

```text
saldo nunca < 0
lockedBalance nunca < 0
exposição nunca < 0
withdrawal nunca pode pagar duas vezes
bet nunca pode ser liquidada duas vezes
transactionId nunca é reutilizado
idempotency key não muda de operação
WIN gera exatamente um crédito
CANCEL gera exatamente um refund
LOSS não gera prêmio
```

Esses testes são particularmente valiosos para o portfólio porque demonstram domínio do problema.

---

# 39. Fase 35 — Certificação e preparação para operação real

Para uma operação brasileira real, a aplicação precisará ser avaliada contra os requisitos regulatórios aplicáveis.

A SPA estabelece requisitos técnicos e de segurança para sistemas de apostas, incluindo proteção contra acessos não autorizados, backups, continuidade de negócios e outros controles.

Também existem requisitos de certificação de sistemas.

Portanto, antes do lançamento comercial:

```text
BackBet
   ↓
security assessment
   ↓
compliance assessment
   ↓
certificação aplicável
   ↓
integração regulatória
   ↓
operador autorizado
   ↓
produção
```

Não tentar "resolver isso depois" com o sistema já movimentando dinheiro.

---

# 40. Fase 36 — Estratégia comercial recomendada

Para você, existe uma diferença enorme entre:

### Modelo A — você operar uma Bet

Você precisaria lidar diretamente com:

```text
autorização
capital
compliance
certificação
pagamentos
KYC
AML
jogo responsável
segurança
regulação
marketing
atendimento
risco financeiro
```

É um negócio pesado.

### Modelo B — vender o BackBet como software B2B

Você pode posicioná-lo como:

> **plataforma/backend de gestão de apostas para operadores autorizados.**

Nesse cenário:

```text
Cliente autorizado
       ↓
BackBet
       ↓
API
       ↓
pagamento/KYC/SIGAP/etc.
```

O operador continua responsável pelas obrigações regulatórias que lhe cabem.

**Para seu objetivo, B2B é muito mais interessante como primeiro produto comercial.**

---

# 41. Definition of Done — BackBet MVP

O projeto só deve ser considerado "finalizado" quando todos os itens abaixo forem verdadeiros.

## Financeiro

- [ ] dinheiro armazenado de forma exata;
- [ ] Money centralizado;
- [ ] liability centralizada;
- [ ] carteira atomicamente consistente;
- [ ] exposição atomicamente consistente;
- [ ] transações financeiras auditáveis;
- [ ] idempotência funcionando;
- [ ] settlement idempotente;
- [ ] withdrawal idempotente;
- [ ] reconciliação implementada;
- [ ] testes de concorrência passando.

## Segurança

- [ ] autenticação endurecida;
- [ ] autorização revisada;
- [ ] rate limiting;
- [ ] headers;
- [ ] CORS;
- [ ] secrets fora do Git;
- [ ] logs sem dados sensíveis;
- [ ] auditoria administrativa;
- [ ] backup;
- [ ] restore testado.

## Infraestrutura

- [ ] Dockerfile;
- [ ] docker-compose;
- [ ] ambiente de teste;
- [ ] build reproduzível;
- [ ] deploy documentado;
- [ ] Mongo privado;
- [ ] Redis privado;
- [ ] HTTPS;
- [ ] monitoramento;
- [ ] alertas;
- [ ] workers funcionando.

## Qualidade

- [ ] lint passando;
- [ ] typecheck passando;
- [ ] testes passando;
- [ ] cobertura conhecida;
- [ ] integração passando;
- [ ] testes de concorrência passando;
- [ ] teste de falhas passando;
- [ ] build passando;
- [ ] Docker build passando;
- [ ] documentação atualizada.

## Produto

- [ ] fluxo completo de cadastro;
- [ ] login;
- [ ] carteira;
- [ ] depósito;
- [ ] aposta;
- [ ] settlement;
- [ ] saque;
- [ ] histórico;
- [ ] administração;
- [ ] API documentada.

---

# 42. Ordem exata de execução

Esta deve ser a sequência prática:

```text
01. Congelar escopo
        ↓
02. Money/centavos
        ↓
03. Liability
        ↓
04. Schemas Mongo
        ↓
05. Ledger financeiro
        ↓
06. Wallet concurrency
        ↓
07. Risk atomicidade
        ↓
08. Idempotência
        ↓
09. Settlement
        ↓
10. Withdrawal state machine
        ↓
11. Reconciliação
        ↓
12. Testes financeiros
        ↓
13. Testes concorrentes
        ↓
14. Testes de falha
        ↓
15. Docker
        ↓
16. CI/CD
        ↓
17. Segurança
        ↓
18. Observabilidade
        ↓
19. Backup/restore
        ↓
20. Admin
        ↓
21. API final
        ↓
22. Frontend mínimo
        ↓
23. README/documentação
        ↓
24. Security review
        ↓
25. Compliance/regulação
        ↓
26. Deploy de staging
        ↓
27. Teste completo em staging
        ↓
28. Go/No-Go
```

---

# 43. O que NÃO fazer

Até concluir o ciclo:

```text
NÃO adicionar outro jogo
NÃO criar microservices
NÃO trocar MongoDB por PostgreSQL só por preferência
NÃO reescrever a arquitetura
NÃO criar mais abstrações sem necessidade
NÃO adicionar IA
NÃO otimizar prematuramente
NÃO criar 40 endpoints administrativos
NÃO tentar suportar 12 moedas
```

O BackBet já tem complexidade suficiente.

O objetivo agora é **confiabilidade**, não tamanho.

---

# 44. Critério final para declarar o projeto concluído

O BackBet estará tecnicamente maduro para um MVP quando você conseguir executar este cenário:

```text
Usuário
  ↓
cadastro
  ↓
login
  ↓
depósito
  ↓
saldo atualizado
  ↓
aposta
  ↓
saldo debitado
  ↓
exposição registrada
  ↓
evento resolvido
  ↓
prêmio calculado
  ↓
saldo creditado
  ↓
saque
  ↓
worker processa
  ↓
pagamento confirmado
  ↓
ledger reconciliado
```

e, principalmente, quando o sistema sobreviver a:

```text
request duplicado
request concorrente
processo interrompido
worker reiniciado
Mongo temporariamente indisponível
Redis temporariamente indisponível
payment provider indisponível
webhook duplicado
retry
```

sem criar ou destruir dinheiro.

Esse é o verdadeiro **Definition of Done**.

---

# 45. Resultado esperado para o portfólio

Depois desse ciclo, o BackBet deixa de ser apresentado simplesmente como:

> "API de apostas feita com Node.js."

E passa a ser apresentado como:

> **Plataforma backend de apostas construída em TypeScript, com arquitetura modular, transações MongoDB, controle de concorrência otimista, idempotência, carteira financeira, gestão de exposição de risco, workers assíncronos, observabilidade, auditoria, testes de integração e infraestrutura containerizada.**

Isso é um projeto significativamente mais forte para portfólio.

E há um segundo benefício: cada decisão crítica pode virar material de entrevista:

```text
Como você evitou double-spending?
Como tratou concorrência?
Como funciona idempotência?
Por que usou Mongo transactions?
Como garante consistência entre wallet e bet?
Como recupera um saque que falhou?
Como detecta inconsistência financeira?
Como faria scaling?
Como faria disaster recovery?
```

Essas são perguntas que permitem demonstrar engenharia de backend de verdade.

---

# 46. Meta final

O objetivo não deve ser transformar o BackBet em uma "Bet perfeita".

O objetivo é chegar a:

```text
BackBet v1.0
────────────────────────────────────
Financeiro consistente
Concorrência controlada
Operações idempotentes
Auditoria
Testes
Docker
CI/CD
Observabilidade
Backup
Segurança
Documentação
MVP utilizável
────────────────────────────────────
```

Depois disso, **encerre o ciclo**.

A partir daí, qualquer funcionalidade nova deve ser avaliada como produto, não como desculpa para continuar expandindo o projeto.

Para seu caso, o caminho mais racional é terminar o BackBet até esse ponto e então decidir entre:

```text
BackBet como produto B2B
       OU
BackBet como projeto de portfólio
       +
Open Source de terceiros em paralelo
```

Não é necessário transformá-lo em uma operação de apostas real para ele cumprir sua função de portfólio. E, caso a intenção comercial seja real, a parte regulatória brasileira deve ser tratada como um **projeto separado de compliance**, não como uma simples etapa de programação. A operação nacional exige autorização prévia da SPA e o ecossistema regulado envolve SIGAP, requisitos de segurança, pagamentos, jogo responsável e certificação.