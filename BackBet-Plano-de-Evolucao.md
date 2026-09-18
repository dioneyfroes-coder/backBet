# Plano de Evolução do BackBet

## Contexto

O BackBet está em um estágio tecnicamente avançado para um backend financeiro/betting. A próxima etapa não deve ser uma grande reestruturação arquitetural, mas o fechamento das lacunas restantes de engenharia, testes, operação e, posteriormente, das integrações reais.

### Premissas atuais do ambiente

- `server01` é um notebook dedicado ao laboratório do BackBet.
- Ubuntu Server + Docker.
- Acesso administrativo via SSH.
- O servidor está disponível na rede local para testes.
- O IP `192.168.22.250` foi configurado deliberadamente como IP estático e deve permanecer assim no ambiente de laboratório.
- MongoDB e Redis podem permanecer publicados nesse ambiente, desde que isso continue sendo uma decisão consciente de laboratório.
- Segredos no `.env.example` são uma dívida temporária enquanto o projeto permanecer privado e em desenvolvimento/testes. Antes de qualquer exposição pública ou produção real, devem ser removidos e rotacionados.

---

# Visão geral

```text
AGORA
│
├─ 1. Fechar Fase 4 — cobertura inteligente
├─ 2. Fechar lacunas financeiras e de persistência
├─ 3. Fortalecer workers e recuperação
├─ 4. Consolidar observabilidade e operações
├─ 5. Limpar arquitetura/dívida técnica
│
├─ 6. Validar performance e limites conhecidos
├─ 7. Melhorar CI/CD
│
└─ 8. Integrações reais / operação real
       ├─ PSP
       ├─ KYC
       ├─ geolocalização/device
       └─ SIGAP
```

---

# Fase 4 — Cobertura inteligente

A próxima tarefa imediata é aumentar a cobertura dos caminhos de maior risco, e não simplesmente perseguir um percentual arbitrário de coverage.

## 4.1 RiskService

Cobrir:

- reserva de exposição;
- liberação;
- atualização concorrente;
- limite por usuário;
- limite por evento;
- limite por mercado;
- exposição inexistente;
- rollback;
- repetição da mesma operação;
- conflito Mongo;
- falha no meio da transação.

### Critério

```text
mesma aposta simultânea
→ nunca ultrapassa limite
→ nunca deixa exposição fantasma
→ retry não duplica exposição
```

## 4.2 MongooseBetRepository

Testar Mongo real para:

- create;
- findById;
- findByUser;
- findByStatus;
- update;
- resolução;
- cancelamento;
- timestamps;
- conversão Mongo → domínio;
- conversão domínio → Mongo;
- documento inexistente;
- dados antigos/incompletos.

## 4.3 MongooseUserRepository

Cobrir:

- criação;
- lookup;
- atualização;
- status;
- preferências;
- Pix;
- paginação/filtros;
- índices;
- documento inexistente;
- concorrência de update.

## 4.4 WithdrawalPayoutWorker

Cobertura máxima para:

```text
PENDING
   ↓
PROCESSING
   ↓
COMPLETED

PENDING
   ↓
PROCESSING
   ↓
FAILED
   ↓
RETRY
```

Testar:

- crash durante processamento;
- restart;
- retry;
- webhook duplicado;
- timeout do PSP;
- PSP responde depois;
- worker processando mesma operação duas vezes;
- idempotência;
- payout duplicado;
- ledger duplicado;
- saldo bloqueado/liberado corretamente.

## Saída esperada

| Componente | Unit | Mongo real | Failure | Concurrency |
|---|---:|---:|---:|---:|
| RiskService | ✓ | ✓ | ✓ | ✓ |
| BetRepository | ✓ | ✓ | — | ✓ |
| UserRepository | ✓ | ✓ | — | — |
| WithdrawalWorker | ✓ | ✓ | ✓ | ✓ |

---

# Fase 5 — Financeiro: fechar invariantes

Fazer uma auditoria deliberada dos invariantes financeiros.

A regra geral deve continuar sendo:

```text
saldo inicial
+ créditos
- débitos
= saldo final
```

E:

```text
wallet balance
+
locked balance
=
valor financeiro esperado
```

## Matriz de operações

Validar:

- depósito;
- compra de créditos;
- aposta;
- cancelamento;
- settlement ganho;
- settlement perdido;
- saque;
- falha de saque;
- reversão;
- replay;
- retry;
- concorrência.

Cada cenário deve verificar simultaneamente:

```text
Wallet
Ledger
Risk
Bet
Withdrawal
Audit
```

O objetivo é detectar uma operação financeiramente inválida mesmo quando a resposta HTTP parece correta.

---

# Fase 6 — Persistência Mongo

## 6.1 Auditoria de índices

Revisar:

- users;
- wallets;
- bets;
- ledger;
- withdrawals;
- idempotency;
- audit;
- risk;
- SIGAP.

Para cada query importante:

```text
query
→ índice existente?
→ seletividade?
→ ordenação suportada?
→ risco de collection scan?
```

Depois executar `explain()` nas consultas críticas.

## 6.2 Auditoria de transações

Mapear todas as transações Mongo:

```text
transaction start
    ↓
read
    ↓
business logic
    ↓
write
    ↓
commit
```

Garantir que efeitos externos não ocorram dentro da transação.

Exemplo de padrão a evitar:

```text
Mongo transaction
    ↓
chamada HTTP PSP
```

---

# Fase 7 — Workers e processamento assíncrono

Formalizar a máquina de estados dos jobs:

```text
PENDING
  ↓
PROCESSING
  ├──→ COMPLETED
  ├──→ RETRY
  └──→ FAILED
```

Cada estado deve definir:

- pode ser processado?
- pode ser repetido?
- pode voltar?
- pode receber webhook?
- pode gerar ledger?
- pode gerar pagamento?

## Recovery

Implementar e testar recuperação após reinício:

```text
server iniciou
   ↓
worker iniciou
   ↓
scan PENDING / PROCESSING expirados
   ↓
reencaminhar jobs recuperáveis
```

Teste obrigatório:

```text
kill -9 worker
→ restart
→ recovery
```

---

# Fase 8 — Idempotência

A idempotência já é uma parte forte do projeto. Agora deve ser padronizada para todas as operações financeiras.

Fluxo:

```text
Idempotency-Key
      ↓
operation fingerprint
      ↓
existing?
 ├─ sim → replay
 └─ não → execute
```

## Casos obrigatórios

Testar:

```text
mesma chave
+
payload igual
→ replay seguro
```

e:

```text
mesma chave
+
payload diferente
→ rejeitar
```

Exemplo:

```text
KEY abc
deposit 100

KEY abc
deposit 500
```

Não pode virar uma operação diferente válida.

Também testar:

```text
mesma operação
+
dois workers
+
mesma chave
+
Mongo restart
+
Redis restart
```

---

# Fase 9 — API e autenticação

Fazer um security pass específico.

## JWT

Verificar:

- access token;
- refresh token;
- expiração;
- rotação;
- revogação;
- reutilização de refresh token;
- mudança de senha;
- logout;
- usuário suspenso;
- token emitido antes da suspensão.

## Autorização

Criar uma matriz explícita de endpoints:

| Endpoint | User | Admin | Finance | System |
|---|---:|---:|---:|---:|
| wallet | ✓ | — | — | — |
| bet | ✓ | — | — | — |
| withdrawal | ✓ | — | — | ✓ |
| settlement | — | ✓ | ✓ | — |
| treasury | — | ✓ | ✓ | — |
| audit | — | ✓ | — | — |

A meta é evitar que novos endpoints sejam adicionados sem autorização adequada.

---

# Fase 10 — Observabilidade

Não adicionar ferramentas apenas por adicionar. Fechar o ciclo:

```text
erro
 ↓
log estruturado
 ↓
métrica
 ↓
alerta
 ↓
diagnóstico
```

## Métricas financeiras

- depósitos/min;
- saques/min;
- apostas/min;
- settlements/min;
- payout failure;
- replay;
- rollback;
- conflitos Mongo.

## Métricas de infraestrutura

- Mongo latency;
- Mongo connections;
- Redis latency;
- Redis failures;
- queue depth;
- worker retry;
- worker processing time.

## Métricas de negócio

- volume financeiro;
- exposição;
- saldo total;
- saques pendentes;
- payouts atrasados.

---

# Fase 11 — Limpeza arquitetural

O principal ponto arquitetural restante é o vazamento de infraestrutura para camadas centrais.

Objetivo:

```text
core/domain
      ↓
      ports
      ↑
infrastructure
```

Principalmente para:

- metrics;
- mailer;
- observabilidade;
- outros adapters externos.

## Ordem

```text
domain → interface
        ↓
infrastructure → implementação
        ↓
injeção no application layer
```

Não fazer uma grande refatoração antes de fechar os testes financeiros.

---

# Fase 12 — Dívida técnica menor

## Consolidar AppError

Existem múltiplas abstrações relacionadas a erros.

Definir claramente uma hierarquia consistente, por exemplo:

```text
DomainError
ApplicationError
InfrastructureError
AppError
```

ou uma estrutura menor, se isso se mostrar suficiente.

## Reduzir `any`

Fazer gradualmente:

```text
~45
 ↓
<20
```

Priorizar:

- controllers;
- adapters;
- workers;
- integrações externas.

Isso é qualidade incremental, não bloqueador imediato.

---

# Fase 13 — Performance

Os testes distribuídos já mostraram comportamento útil:

```text
1x → 10x
throughput ≈ constante
```

O gargalo conhecido está relacionado à contenção quando muitas operações atingem o mesmo documento/wallet.

Não otimizar prematuramente.

## Próximo benchmark

Executar:

```text
50
100
150
200
300
500 concorrentes
```

Medir:

- p50;
- p95;
- p99;
- conflitos;
- retries;
- tempo de transação.

Objetivo:

> descobrir o limite operacional real do modelo atual.

---

# Fase 14 — Crash testing

Testar `docker kill` durante:

- depósito;
- aposta;
- settlement;
- saque;
- payout.

E verificar o estado do Mongo depois.

Testar também:

```text
kill durante transaction
kill após commit
kill antes da resposta
kill durante retry
kill durante payout
```

Objetivo:

> nenhuma interrupção do processo pode criar uma transação financeira impossível de reconciliar.

---

# Fase 15 — Backup e Disaster Recovery

Mesmo como laboratório, vale fechar tecnicamente o ciclo:

```text
backup
 ↓
checksum
 ↓
restore
 ↓
count comparison
 ↓
financial reconciliation
```

Restaurar um ambiente contendo:

- users;
- wallets;
- ledger;
- bets;
- withdrawals.

Depois executar reconciliação e comparar com o ambiente original.

Backup externo pode ficar para uma etapa posterior.

---

# Fase 16 — CI/CD

O CI atual já cobre uma boa parte do fluxo.

Adicionar:

```text
PR
├─ secrets
├─ typecheck
├─ lint
├─ unit
├─ coverage
├─ build
├─ audit critical
└─ integration
```

Separar cargas pesadas:

```text
Nightly
├─ distributed 1x
├─ distributed 5x
└─ distributed 10x
```

E testes manuais/agendados:

```text
Chaos
Load
Backup drill
```

Não é necessário colocar carga pesada em todo PR.

---

# Fase 17 — Docker e ambiente

Fazer um teste de reconstrução limpa:

```bash
docker compose down -v

docker compose build --no-cache

docker compose up -d

docker compose ps

curl /health
curl /readiness
```

Validar:

```text
API
Mongo
Redis
workers
```

todos funcionando a partir de uma reconstrução limpa.

## IP do laboratório

O IP:

```text
192.168.22.250
```

é deliberadamente estático.

Essa informação deve ser documentada para evitar que alguém interprete as portas publicadas como uma configuração acidental.

---

# Fase 18 — Integrações reais

Depois de fechar a engenharia interna, começar as integrações reais.

## Pix / PSP

Estrutura:

```text
PixProviderPort
       ↓
MockPixProvider
       ↓
RealPixProvider
```

Implementar:

- create charge;
- QR Code;
- webhook;
- expiration;
- confirmation;
- refund;
- signature validation;
- idempotency.

## KYC

Criar adapter real mantendo o domínio independente do provedor.

## Geolocalização

Fluxo:

```text
request
 ↓
location provider
 ↓
jurisdiction
 ↓
allowed / blocked
```

## Device / fraude

Posteriormente:

```text
user
+
device
+
IP
+
behavior
```

---

# Fase 19 — SIGAP

A implementação real deve depender da documentação e do ambiente de homologação disponíveis.

Estrutura esperada:

```text
SigapService
     ↓
adapter real
     ↓
transmission
     ↓
ACK / REJECT
     ↓
retry
     ↓
audit
```

Evitar implementar detalhes especulativos antes de possuir o contrato real da integração.

---

# Fase 20 — Documentação

A documentação deve ser atualizada depois de fechar as mudanças de código.

Arquivos principais:

1. `README`
2. `ARCHITECTURE`
3. `DEFINITION_OF_DONE`
4. `GO_NOGO_FINAL`
5. `todo.txt`

Eliminar:

- números antigos de testes;
- descrições que já não correspondem ao código;
- etapas concluídas que ainda aparecem como pendentes.

Adicionar:

- estado atual;
- resultados dos testes;
- baseline de performance;
- limites conhecidos;
- IP estático do laboratório;
- configuração específica do ambiente de desenvolvimento/testes.

O projeto deve possuir uma única fonte de verdade para o status técnico.

---

# Ordem recomendada

```text
[1] Commit/freeze da Fase 3
        ↓
[2] Fase 4 — cobertura dos 4 módulos críticos
        ↓
[3] auditoria Financial Invariants
        ↓
[4] idempotência completa
        ↓
[5] Withdrawal Worker state/recovery
        ↓
[6] Mongo indexes + explain
        ↓
[7] crash testing agressivo
        ↓
[8] auth/authorization pass
        ↓
[9] observabilidade operacional
        ↓
[10] remover dívida arquitetural
        ↓
[11] teste Docker clean rebuild
        ↓
[12] CI final
        ↓
[13] documentação final
        ↓
[14] baseline de performance
        ↓
[15] PSP/KYC/geolocation/SIGAP
```

---

# O que não priorizar agora

Não é necessário, neste estágio:

- trocar MongoDB;
- trocar Redis;
- trocar Express;
- trocar Docker;
- refazer toda a arquitetura;
- Kubernetes;
- microserviços;
- AWS;
- remover o IP fixo do laboratório;
- tratar os segredos do `.env.example` como bloqueador enquanto o projeto permanecer privado;
- perseguir 95–100% de coverage;
- otimizar prematuramente o gargalo de uma única wallet.

---

# Meta de encerramento da engenharia

Considerar a infraestrutura do MVP praticamente fechada quando:

```text
Financeiro             ✅
Concorrência           ✅
Idempotência           ✅
Workers                ✅
Recovery               ✅
Mongo                  ✅
Observabilidade        ✅
Segurança              ✅
CI                     ✅
Docker                 ✅
Backup/restore         ✅
Coverage crítica       ✅
Crash testing          ✅
Documentação           ✅
```

Depois disso, parar de polir a infraestrutura indefinidamente e iniciar as integrações reais.

A partir desse ponto o BackBet deixa de ser principalmente um backend financeiro simulado e começa a depender das complexidades reais de PSP, KYC, geolocalização, fraude e SIGAP.
