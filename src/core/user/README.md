# Módulo User

## Descrição
O módulo User é responsável pelo gerenciamento de usuários da plataforma de apostas. Ele implementa padrões de Domain-Driven Design (DDD) e Clean Architecture para manter o código organizado e flexível.

## Estrutura

```
src/core/user/
├── application/
│   └── use-cases/
│       └── RegisterUser.ts
├── domain/
│   ├── entities/
│   │   └── User.ts
│   ├── repositories/
│   │   └── IUserRepository.ts
│   ├── services/
│   │   └── UserService.ts
│   └── value-objects/
│       └── Email.ts
└── types/
    └── user.types.ts
```

## Componentes Principais

### Entidades

#### User
Representa um usuário da plataforma.

Atributos:
- `id`: Identificador único do usuário
- `email`: Email do usuário (Value Object)
- `username`: Nome de usuário
- `status`: Status do usuário (ACTIVE, SUSPENDED, PENDING_VERIFICATION)
- `createdAt`: Data de criação
- `updatedAt`: Data da última atualização

Métodos:
- `canOperate()`: Verifica se o usuário pode realizar operações
- `suspend()`: Suspende o usuário
- `activate()`: Ativa o usuário
- `toDTO()`: Converte a entidade para um objeto de transferência de dados

### Value Objects

#### Email
Encapsula a lógica de validação de email.

Métodos:
- `constructor(value: string)`: Valida e cria um novo email
- `toString()`: Retorna o valor do email como string

### Services

#### UserService
Implementa a lógica de negócio relacionada aos usuários.

Métodos:
- `registerUser(input: ICreateUserDTO)`: Registra um novo usuário
- `suspendUser(userId: string)`: Suspende um usuário existente

### Use Cases

#### RegisterUser
Implementa o fluxo de registro de um novo usuário.

Métodos:
- `execute(input: ICreateUserDTO)`: Executa o registro do usuário e cria uma carteira associada

### Types

#### UserStatus
```typescript
type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
```

#### IUserDTO
```typescript
interface IUserDTO {
  id: string;
  email: string;
  username: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

#### ICreateUserDTO
```typescript
interface ICreateUserDTO {
  email: string;
  username: string;
  currency?: string;
}
```

#### IUserResponseDTO
```typescript
interface IUserResponseDTO {
  user: IUserDTO;
  wallet: IWalletDTO;
}
```

## Exemplos de Uso

### Registrando um Novo Usuário

```typescript
const registerUser = new RegisterUser(userService, walletService);

const result = await registerUser.execute({
  email: "user@example.com",
  username: "user123",
  currency: "BRL"
});
```

### Suspendendo um Usuário

```typescript
await userService.suspendUser(userId);
```

## Validações

- Email deve ser válido e único
- Username é obrigatório
- Status deve ser um dos valores definidos em UserStatus
- Operações só podem ser realizadas por usuários ativos

## Integração com Outros Módulos

- **Finance**: O módulo User se integra com o módulo Finance para criar e gerenciar carteiras de usuários
- **Auth**: (Futuro) Integrará com o módulo de autenticação para gerenciamento de credenciais