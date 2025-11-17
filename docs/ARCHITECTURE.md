# Domínio de Negócio - Arquitetura e Integração

## Visão Geral

A aplicação é estruturada em torno de **3 cores de negócio principais** (bounded contexts) que funcionam de forma integrada:

1. **User Core** - Gerencia usuários e autenticação
2. **Finance Core** - Gerencia carteiras e operações financeiras
3. **Betting Core** - Gerencia apostas e eventos

Todos compartilham abstrações comuns no **Shared Domain**.

## Cores de Negócio

### 1. User Core (`src/core/user/`)
**Responsabilidades:**
- Criar e gerenciar usuários
- Autenticação e verificação de identidade
- Gerenciar status do usuário (ACTIVE, SUSPENDED, PENDING_VERIFICATION)

**Entidades:**
- `User` - agregado raiz com email, username, status

**Serviços:**
- `UserService` - orquestra criação, ativação, suspensão

**Repositórios:**
- `IUserRepository` - contrato de persistência

**Integração com outros cores:**
- Cria `Wallet` automaticamente ao registrar novo usuário
- Consulta carteira ao processar operações financeiras

---

### 2. Finance Core (`src/core/finance/`)
**Responsabilidades:**
- Gerenciar carteiras de usuários
- Realizar depósitos e saques
- Bloquear fundos (lock/unlock) para reservas

**Entidades:**
- `Wallet` - agregado raiz com balance, lockedBalance, currency

**Value Objects:**
- `CurrencyValueObject` - valida moedas suportadas (BRL, USD, EUR)
- `Money` (em shared) - valor monetário com operações

**Serviços:**
- `WalletService` - orquestra operações financeiras

**Repositórios:**
- `IWalletRepository` - contrato de persistência

**Integração com outros cores:**
- Consultado por `BetService` ao colocar apostas
- Consultado por `BetService` ao resolver apostas
- Enriquecido com domínio de pagamentos futuro

---

### 3. Betting Core (`src/core/betting/`)
**Responsabilidades:**
- Gerenciar apostas de usuários
- Criar e gerenciar eventos esportivos
- Definir mercados e odds
- Resolver apostas

**Entidades:**
- `Bet` - agregado raiz de uma aposta (status: PENDING, WON, LOST, CANCELED)
- `Event` - agregado raiz de um evento esportivo
- `Market` - entidade dentro do agregado Event

**Value Objects:**
- `Odds` - cotação de uma aposta

### Tipos Compartilhados
- `SupportedCurrency` - 'BRL' | 'USD' | 'EUR'
- `ResourceStatus` - status genérico de recursos
- `DomainError` - estrutura de erros
- `Result` - padrão Result para retorno de operações
- `PaginatedDTO` - resposta paginada padrão
- `FilterDTO` - filtros genéricos

---

## Fluxo de Integração

### Fluxo 1: Registrar Novo Usuário
```
1. UserService.registerUser(email, username, currency)
   ├─ Valida email e username
   ├─ Cria User
   └─ Cria Wallet (BRL por padrão ou currency especificada)

2. Ambos persistem em seus repositórios respectivos
3. Eventos: UserCreated, WalletCreated (para auditoria futura)
```

### Fluxo 2: Colocar Aposta
```
1. BetService.placeBet({ userId, eventId, marketId, oddId, amount })
   ├─ Valida se User exists e está ACTIVE
   ├─ Valida se Event está SCHEDULED
   ├─ Valida se Market está OPEN
   ├─ Consulta WalletService.withdraw(userId, amount)
   │  └─ WalletService verifica balance >= amount
   │  └─ Reduz balance (ou move para lockedBalance)
   ├─ Cria Bet com status PENDING
   └─ Persiste Bet

2. Eventos: BetPlaced, FundsWithdrawn (para auditoria futura)
```

### Fluxo 3: Resolver Aposta
```
1. BetService.resolveBet({ betId, result })
   ├─ Localiza Bet
   ├─ Valida status PENDING
   ├─ Atualiza status (WON ou LOST)
   ├─ Se WON:
   │  └─ WalletService.deposit(userId, potentialReturn)
   │     └─ Aumenta balance
   └─ Persiste resultado

2. Eventos: BetResolved, FundsDeposited (para auditoria futura)
```

---

## Padrões de Design Utilizados

### 1. Domain-Driven Design (DDD)
- **Aggregate Roots**: User, Wallet, Bet, Event
- **Value Objects**: Email, Currency, Money, Odds, UniqueId
- **Bounded Contexts**: user, finance, betting cores
- **Ubiquitous Language**: termos consistentes em toda a aplicação

### 2. Repository Pattern
- Interfaces genéricas para abstrair persistência
- Mockáveis para testes
- Facilita troca de backend (em-memória → DB → Redis)

### 3. Service Layer
- Orquestra operações de negócio
- Coordena entre repositórios
- Centraliza validações

### 4. Value Objects
- Imutáveis
- Com validações
- Reutilizáveis entre cores

### 5. Dependency Injection (preparado para)
- Cores não são acoplados (usado via interfaces)
- Fácil de testar com mocks
- Pronto para integração com NestJS/Spring

---

## Próximos Passos

1. **Implementar Adaptadores de Persistência**
   - TypeORM/Prisma para PostgreSQL
   - Redis para cache
   - Implementar `IRepository`, `IBetRepository`, `IWalletRepository`, `IUserRepository`

2. **Adicionar Eventos de Domínio**
   - `UserCreated`, `WalletCreated`
   - `BetPlaced`, `BetResolved`
   - `FundsDeposited`, `FundsWithdrawn`
   - Event Bus para propagação

3. **Camada de Aplicação (Application Layer)**
   - Use Cases / Commands
   - DTOs de entrada/saída
   - Mapeamento de domínio ↔ API

4. **Camada de API (Infrastructure)**
   - Controllers REST
   - GraphQL (opcional)
   - WebSocket para updates em tempo real

5. **Testes de Integração**
   - Teste fluxos completos (user → betting → finance)
   - Teste transações e rollback
   - Teste eventos de domínio

6. **Auditoria e Compliance**
   - Event Sourcing (registrar todas as operações)
   - Logs estruturados
   - Rastreamento de transações

---

## Estrutura de Diretórios

```
src/core/
├── shared/                           # Abstrações e padrões compartilhados
│   ├── domain/
│   │   ├── entities/
│   │   │   └── AggregateRoot.ts      # Base para todos os agregados
│   │   ├── repositories/
│   │   │   └── IRepository.ts        # Interface genérica
│   │   └── value-objects/
│   │       ├── UniqueId.ts           # ID único
│   │       └── Money.ts              # Valor monetário
│   └── types/
│       └── domain.types.ts           # Tipos compartilhados
│
├── user/                             # Domínio de Usuários
│   ├── domain/
│   │   ├── entities/
│   │   │   └── User.ts
│   │   ├── services/
│   │   │   └── UserService.ts
│   │   ├── repositories/
│   │   │   └── IUserRepository.ts
│   │   └── value-objects/
│   │       └── Email.ts
│   └── types/
│       └── user.types.ts
│
├── finance/                          # Domínio Financeiro
│   ├── domain/
│   │   ├── entities/
│   │   │   └── Wallet.ts
│   │   ├── services/
│   │   │   ├── IWalletService.ts
│   │   │   └── WalletService.ts
│   │   ├── repositories/
│   │   │   └── IWalletRepository.ts
│   │   └── value-objects/
│   │       └── Currency.ts
│   └── types/
│       └── wallet.types.ts
│
└── betting/                          # Domínio de Apostas
    ├── domain/
    │   ├── entities/
    │   │   ├── Bet.ts
    │   │   └── Event.ts
    │   ├── services/
    │   │   └── BetService.ts
    │   ├── repositories/
    │   │   ├── IBetRepository.ts
    │   │   └── IEventRepository.ts
    │   └── value-objects/
    │       ├── Odds.ts
    │       └── BetAmount.ts
    └── types/
        └── bet.types.ts
```

---

## Conclusão

A arquitetura é **modular, testável e escalável**:
- Cada core é independente e pode ser testado isoladamente
- Abstrações em `shared` evitam duplicação
- Integração via interfaces bem definidas
- Preparada para crescimento e novas features
