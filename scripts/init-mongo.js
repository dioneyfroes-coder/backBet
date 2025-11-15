// Script de inicialização do MongoDB
// Executado apenas na primeira vez que o container é criado

db = db.getSiblingDB('backbet-dev');

// Criar índices para a collection 'users'
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });

// Criar índices para a collection 'wallets'
db.wallets.createIndex({ userId: 1 }, { unique: true });
db.wallets.createIndex({ createdAt: 1 });

// Criar índices para a collection 'bets'
db.bets.createIndex({ userId: 1 });
db.bets.createIndex({ eventId: 1 });
db.bets.createIndex({ status: 1 });
db.bets.createIndex({ createdAt: 1 });
db.bets.createIndex({ userId: 1, status: 1 }); // Índice composto para queries frequentes

print('✓ MongoDB initialized with indexes and collections');
