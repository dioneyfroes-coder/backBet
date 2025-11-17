# MongoDB Setup Guide

Este guia descreve como configurar o MongoDB para o projeto BackBet.

## Opções de Setup

### 1. MongoDB Local (Recomendado para Desenvolvimento)

#### Pré-requisitos
- MongoDB Community Server instalado ([download](https://www.mongodb.com/try/download/community))
- Ou usando Homebrew (macOS):
  ```bash


1. **Inicie o MongoDB:**
   ```bash

2. **Configure as variáveis de ambiente** (`.env`):
   ```env

3.
   ```bash

-

#### Configuração

1. **Crie um novo projeto no Atlas:**
   - Acesse [MongoDB Atlas](https://cloud.mongodb.com)
   - Clique em "Create a new project"
   - Defina um nome para o projeto

2. **Crie um cluster:**
   - Clique em "Build a Database"
   - Escolha o tier (Free M0 é grátis para desenvolvimento)
   - Selecione a região
   - Clique em "Create"

3. **Configure o acesso:**
   - Vá para "Security" > "Database Access"
   - Crie um novo usuário com senha forte
   - Vá para "Security" > "Network Access"
   - Adicione seu IP ou use `0.0.0.0/0` (menos seguro)

4. **Obtenha a connection string:**
   - Clique em "Connect"
   - Escolha "Drivers"
   - Copie a connection string
   - Substitua `` pela senha do usuário

5. **Configure as variáveis de ambiente** (`.env`):
   ```env

|
|----------|-----------|---------|
| `MONGODB_URI` | Connection string do MongoDB | `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | Nome do banco de dados | `backbet-dev` |
| `NODE_ENV` | Ambiente | `development`, `production`, `test` |

## Testando a Conexão

```typescript

const
await connectMongoDB(config);
console.log('✓ MongoDB conectado com sucesso');
```

## Criar Índices

Os índices são criados automaticamente através dos schemas Mongoose:

```bash
mongosh
> use backbet-dev
> db.users.getIndexes()
> db.wallets.getIndexes()
> db.bets.getIndexes()
```

## Backup e Restore

### Backup Local

```bash
mongodump

# Backup de uma collection
mongodump --db backbet-dev --collection users --out ./backup
```

### Restore Local

```bash
mongorestore

# Restaurar uma collection
mongorestore --db backbet-dev --collection users ./backup/backbet-dev/users.bson
```

### Backup MongoDB Atlas

- Use o serviço de backup automático do Atlas
- Configure snapshots automáticos na aba "Backup" do cluster
- Use `mongodump` com connection string do Atlas para backups manuais

## Troubleshooting

### Conexão Recusada

**Problema:** `ECONNREFUSED 127.0.0.1:27017`

**Solução:**
```bash
ps

# Inicie o MongoDB
mongod --dbpath /usr/local/var/mongodb

# Ou com Homebrew
brew services start mongodb-community
```

### Autenticação Falhou

**Problema:** `error: authentication failed`

**Solução:**
- Verifique se o usuário existe no MongoDB Atlas
- Valide a senha (sem caracteres especiais não escapados)
- Escape caracteres especiais: `password@123` → `password%40123`

### Connection Pool Esgotado

**Problema:** `MongoServerSelectionError: connect ECONNREFUSED`

**Solução:**
- Aumente o pool size na connection string: `?maxPoolSize=50`
- Verifique Network Access no MongoDB Atlas
- Aguarde a criação completa do cluster

## Próximos Passos

1.
2.  (se necessário)
3.

## Referências

- [MongoDB Documentation](https://docs.mongodb.com/)
- [Mongoose Documentation](https://mongoosejs.com/)
- [MongoDB Best Practices](https://docs.mongodb.com/manual/administration/production-checklist/)
