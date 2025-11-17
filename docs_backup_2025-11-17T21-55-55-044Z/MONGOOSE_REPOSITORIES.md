# Mongoose Repositories Integration Guide

Este guia explica como integrar os repositórios Mongoose à sua aplicação BackBet.

## Arquitetura

Os repositórios Mongoose implementam as mesmas interfaces que os repositórios em memória, facilitando a substituição:

```
Domain Layer (Interfaces)
  ↓
Infrastructure Layer (Mongoose Implementation)
  ↓
Persistence Layer (MongoDB)
```

## Repositórios Disponíveis

### 1. MongooseUserRepository

Implementa `IUserRepository` para persistência de usuários.

**Métodos:**
- `save(user: User): Promise<void>` - Criar ou atualizar usuário
- `findById(id: string): Promise<User | null>` - Buscar por ID
- `findByEmail(email: string): Promise<User | null>` - Buscar por email
- `update(user: User): Promise<void>` - Atualizar usuário existente

**Exemplo:**

```typescript
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories';
import { User } from '@/core/user/domain/entities/User';
import { Email } from '@/core/user/domain/value-objects/Email';

const userRepository = new MongooseUserRepository();

// Criar usuário
const user = new User({
  email: new Email('user@example.com'),
  username: 'john_doe',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
}, 'user-id-123');

await userRepository.save(user);

// Buscar usuário
const foundUser = await userRepository.findById('user-id-123');
```

### 2. MongooseWalletRepository

Implementa `IWalletRepository` para persistência de carteiras e transações.

**Métodos:**
- `save(wallet: Wallet): Promise<Wallet>` - Criar carteira
- `findByUserId(userId: string): Promise<Wallet | null>` - Buscar carteira de usuário
- `update(wallet: Wallet): Promise<Wallet>` - Atualizar saldo
- `delete(userId: string): Promise<void>` - Deletar carteira
- `getHistory(userId: string, limit?: number, offset?: number): Promise<{...}>` - Histórico de transações

**Exemplo:**

```typescript
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories';
import { Wallet } from '@/core/finance/domain/entities/Wallet';

const walletRepository = new MongooseWalletRepository();

// Criar carteira
const wallet = new Wallet('user-id-123', 'BRL');
wallet.deposit(1000);
await walletRepository.save(wallet);

// Buscar carteira
const userWallet = await walletRepository.findByUserId('user-id-123');

// Histórico de transações
const { transactions, total } = await walletRepository.getHistory('user-id-123', 10, 0);
console.log(`Total de transações: ${total}`);
console.log(`Primeiras 10: ${transactions.length}`);
```

### 3. MongooseBetRepository

Implementa `IBetRepository` para persistência de apostas.

**Métodos:**
- `create(bet: Bet): Promise<void>` - Criar aposta
- `update(bet: Bet): Promise<void>` - Atualizar aposta
- `findById(id: string): Promise<Bet | null>` - Buscar por ID
- `findByUserId(userId: string): Promise<Bet[]>` - Apostas do usuário
- `findByEventId(eventId: string): Promise<Bet[]>` - Apostas do evento
- `findByStatus(status: BetStatus): Promise<Bet[]>` - Apostas por status
- `findAll(filter?: {...}): Promise<Bet[]>` - Listar com filtros
- `exists(id: string): Promise<boolean>` - Verificar existência
- `delete(id: string): Promise<boolean>` - Deletar aposta

**Exemplo:**

```typescript
import { MongooseBetRepository } from '@/infrastructure/persistence/mongoose/repositories';

const betRepository = new MongooseBetRepository();

// Buscar apostas pendentes
const pendingBets = await betRepository.findByStatus('PENDING');

// Buscar apostas de um usuário
const userBets = await betRepository.findByUserId('user-id-123');

// Buscar com múltiplos filtros
const filteredBets = await betRepository.findAll({
  userId: 'user-id-123',
  status: 'WON',
});
```

## Integração com Dependency Injection

Se usar um padrão de DI, configure os repositórios da seguinte forma:

```typescript
// src/infrastructure/config/container.ts
import { Container } from 'awilix';
import { MongooseUserRepository } from '@/infrastructure/persistence/mongoose/repositories';
import { MongooseWalletRepository } from '@/infrastructure/persistence/mongoose/repositories';
import { MongooseBetRepository } from '@/infrastructure/persistence/mongoose/repositories';

export function configureContainer(container: Container) {
  // Registrar repositórios
  container.register({
    userRepository: container.asClass(MongooseUserRepository).singleton(),
    walletRepository: container.asClass(MongooseWalletRepository).singleton(),
    betRepository: container.asClass(MongooseBetRepository).singleton(),
  });
}
```

## Factory Pattern para Persistência

Crie uma factory que escolha entre em-memória e Mongoose baseado em variável de ambiente:

```typescript
// src/infrastructure/persistence/factory.ts
import { IUserRepository } from '@/core/user/domain/repositories/IUserRepository';
import { IWalletRepository } from '@/core/finance/domain/repositories/IWalletRepository';
import { IBetRepository } from '@/core/betting/domain/repositories/IBetRepository';
import { InMemoryUserRepository } from './in-memory/InMemoryUserRepository';
import { InMemoryWalletRepository } from './in-memory/InMemoryWalletRepository';
import { InMemoryBetRepository } from './in-memory/InMemoryBetRepository';
import { MongooseUserRepository } from './mongoose/repositories/MongooseUserRepository';
import { MongooseWalletRepository } from './mongoose/repositories/MongooseWalletRepository';
import { MongooseBetRepository } from './mongoose/repositories/MongooseBetRepository';

const USE_MONGOOSE = process.env.USE_MONGOOSE_PERSISTENCE === 'true';

export function createUserRepository(): IUserRepository {
  return USE_MONGOOSE 
    ? new MongooseUserRepository()
    : new InMemoryUserRepository();
}

export function createWalletRepository(): IWalletRepository {
  return USE_MONGOOSE
    ? new MongooseWalletRepository()
    : new InMemoryWalletRepository();
}

export function createBetRepository(): IBetRepository {
  return USE_MONGOOSE
    ? new MongooseBetRepository()
    : new InMemoryBetRepository();
}
```

Use na aplicação:

```typescript
// src/app.ts
import { createUserRepository, createWalletRepository, createBetRepository } from '@/infrastructure/persistence/factory';

const userRepository = createUserRepository();
const walletRepository = createWalletRepository();
const betRepository = createBetRepository();

// Usar normalmente - sem diferença de interface
```

## Esquemas MongoDB

Os seguintes esquemas estão disponíveis:

### User Schema

```typescript
{
  _id: ObjectId,
  email: string (unique),
  username: string (unique),
  firstName?: string,
  lastName?: string,
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED',
  createdAt: Date,
  updatedAt: Date
}
```

**Índices:**
- `email` (unique)
- `username` (unique)

### Wallet Schema

```typescript
{
  _id: ObjectId,
  userId: string (unique, indexed),
  balance: number (min: 0),
  lockedBalance: number (min: 0),
  currency: 'BRL' | 'USD' | 'EUR',
  transactions: [
    {
      id: string,
      type: 'DEPOSIT' | 'WITHDRAW' | 'LOCK' | 'UNLOCK',
      amount: number,
      description?: string,
      createdAt: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

**Índices:**
- `userId` (unique, indexed)
- `transactions.createdAt` (para queries rápidas de histórico)

### Bet Schema

```typescript
{
  _id: ObjectId,
  userId: string (indexed),
  eventId: string (indexed),
  marketId: string,
  oddId: string,
  amount: number (min: 0.01),
  odds: number (min: 1.0),
  potentialReturn: number,
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELED' (indexed),
  type: 'SINGLE' | 'MULTIPLE',
  currency: 'BRL' | 'USD' | 'EUR',
  resolvedAt?: Date,
  cancellationReason?: string,
  createdAt: Date,
  updatedAt: Date
}
```

**Índices:**
- `userId` (para queries por usuário)
- `eventId` (para queries por evento)
- `status` (para queries por status)
- `createdAt` (para ordenação por data)

## Tratamento de Erros

Todos os repositórios lançam `AppError` com códigos padronizados:

```typescript
try {
  const user = await userRepository.findById('invalid-id');
  if (!user) {
    // Não encontrado - retorna null, não lança erro
  }
} catch (error) {
  if (error instanceof AppError) {
    console.error(`[${error.code}] ${error.message}`);
    // INTERNAL_SERVER_ERROR: Erro na conexão MongoDB
    // NOT_FOUND: Recurso não encontrado
    // CONFLICT: Violação de constraints (email/username duplicado)
  }
}
```

## Performance e Boas Práticas

### 1. Índices

Garanta que os índices estão criados:

```bash
mongosh
> use backbet-dev
> db.users.getIndexes()
> db.wallets.getIndexes()
> db.bets.getIndexes()
```

### 2. Paginação

Para listas grandes, use pagination:

```typescript
// Implementar após adicionar campo 'page' e 'pageSize' aos métodos
const page = 1;
const pageSize = 20;
const skip = (page - 1) * pageSize;

const bets = await betRepository.findAll({ 
  userId: 'user-id-123',
  status: 'PENDING'
});
// Aplicar slice no cliente ou modify método com skip/limit
```

### 3. Lean Queries

Todas as queries usam `.lean()` para melhor performance em leitura:

```typescript
// lean() retorna objetos planos (28% mais rápido)
// Sem modificar a query de escrita
```

### 4. Transações (Futuro)

Para operações multi-documento:

```typescript
// TODO: Implementar session para transações ACID
// await session.startTransaction();
// try {
//   await userRepository.save(user);
//   await walletRepository.save(wallet);
//   await session.commitTransaction();
// } catch (error) {
//   await session.abortTransaction();
// }
```

## Troubleshooting

### Erro: "MongoDB connection failed"

Verifique:
1. MongoDB está rodando: `mongod --dbpath /usr/local/var/mongodb`
2. MONGODB_URI correto no `.env`
3. Network access no MongoDB Atlas

### Erro: "duplicate key error"

Significa violação de índice único. Verifique:
- Email/username já existe (IUserRepository)
- UserId já tem carteira (IWalletRepository)

Use `findByEmail()` antes de criar novo usuário.

### Erro: "The MongoClient instance has been closed"

A conexão foi fechada. Verifique se `disconnectMongoDB()` foi chamado antes do tempo.

## Referências

- [Mongoose Documentation](https://mongoosejs.com/)
- [MongoDB Best Practices](https://docs.mongodb.com/manual/administration/production-checklist/)
- [BackBet Architecture](../../../docs/ARCHITECTURE.md)
