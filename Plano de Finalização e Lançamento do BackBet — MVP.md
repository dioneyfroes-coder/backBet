3. Código da aplicação

Precisamos eliminar a duplicação de endpoints.

src/shared/config/env.ts

Verificar se a configuração aceita:

MONGODB_URI
REDIS_URL

sem assumir:

localhost

Os defaults de localhost são problemáticos para o ambiente Docker.

Idealmente:

MONGODB_URI → obrigatório
REDIS_URL → obrigatório

em produção/teste.

Assim, um erro de configuração aparece imediatamente em vez de tentar conectar em localhost.

src/infrastructure/persistence/mongoose/config.ts

Hoje existe algo equivalente a:

process.env.MONGODB_URI || 'mongodb://localhost:27017'

Precisamos remover esse fallback ou deixá-lo exclusivamente para um ambiente explicitamente local.

A aplicação deve receber a URI pelo ambiente.

Configuração Redis

Precisamos verificar se algum código ainda possui:

redis://localhost:6379

como fallback.

O objetivo é:

REDIS_URL
   ↓
redis://:${password}@redis:6379

para todos os containers.

4. run-integration-tests.cjs

Essa é uma das principais mudanças.

Hoje ele está fazendo algo como:

env.MONGODB_URI = shift(
  process.env.MONGODB_URI,
  'mongodb://192.168.22.250:27018/backbet-test?...'
);

env.REDIS_URL = shift(
  process.env.REDIS_URL,
  'redis://192.168.22.250:6379'
);

Isso precisa desaparecer.

O script não deve mais conhecer:

192.168.22.250
27018
6379

Ele deve simplesmente executar Jest usando o ambiente recebido pelo container.

Por exemplo, conceitualmente:

Docker Compose
      ↓
MONGODB_TEST_URI
REDIS_URL
      ↓
integration-tests
      ↓
run-integration-tests.cjs
      ↓
Jest
5. Testes

Precisamos verificar os testes para procurar:

Endpoints hardcoded
localhost
127.0.0.1
192.168.22.250
27018
6379
mongodb://
redis://
Bancos hardcoded
backbet-test
backbet-dev
backbet
Limpeza

Os testes atualmente fazem coisas como:

deleteMany()

Precisamos garantir que:

Mongo → backbet-test
Redis → namespace/keys de teste

e nunca o banco usado pelo runtime normal.

6. Infraestrutura Mongo

Também precisamos decidir a autenticação do banco de testes.

Minha recomendação:

Mongo
├── backbet
│   └── usuário backbet
│
└── backbet-test
    └── usuário backbet-test

No .env:

MONGODB_APP_USER=backbet
MONGODB_APP_PASSWORD=...

MONGODB_TEST_USER=backbet-test
MONGODB_TEST_PASSWORD=...

E o script de inicialização cria os dois usuários.

Isso deixa:

backbet container
    ↓
backbet DB

integration-tests
    ↓
backbet-test DB

sem risco de os testes apagarem dados do ambiente principal.

Checklist completo
Docker
 Corrigir REDIS_URL para redis
 Criar integration-tests
 Colocar testes na mesma network
 Usar mongodb:27017
 Usar redis:6379
 Manter mongo-rs-init como dependência
 Garantir readiness antes dos testes
.env
 MONGODB_URI → endpoint interno
 REDIS_URL → endpoint interno
 Criar MONGODB_TEST_URI
 Criar credencial do usuário de teste
 Não colocar IP do servidor nas URLs internas
Código
 Remover fallbacks localhost problemáticos
 Centralizar MONGODB_URI
 Centralizar REDIS_URL
 Não deixar código saber IP/porta Docker publicada
Test runner
 Remover 192.168.22.250
 Remover 27018
 Remover localhost
 Remover 6379 hardcoded
 Receber configuração do ambiente
Testes
 Verificar Mongo URI
 Verificar Redis URI
 Verificar banco backbet-test
 Verificar limpeza
 Verificar isolamento
 Garantir que nenhum teste atinge backbet
Mongo
 Criar usuário específico backbet-test
 Dar readWrite somente em backbet-test
 Manter rs0 anunciando mongodb:27017