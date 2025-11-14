# 🚀 Como Rodar o BackBet - Guia Rápido

## ⚡ Quickstart (5 minutos)

### 1. Clonar e Instalar
```bash
git clone https://github.com/dioneyfroes-coder/backBet.git
cd backBet
npm install
```

### 2. Configurar Clerk (Autenticação)
```bash
# Copiar exemplo
cp .env.example .env

# Editar .env com suas credenciais do Clerk:
# - Acesse https://dashboard.clerk.com
# - Vá em "API Keys"
# - Copie CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_API_KEY
# - Cole no arquivo .env
```

### 3. Compilar e Rodar
```bash
# Build
npm run build

# Rodar servidor
npm start
```

Servidor estará disponível em **http://localhost:3000** 🎉

---

## 📚 Desenvolvimento

### Scripts Disponíveis

```bash
# Compilar TypeScript
npm run build

# Rodar servidor (precisa compilar antes)
npm start

# Desenvolvimento (compila + roda)
npm run dev

# Executar testes
npm test

# Testes em watch mode
npm test:watch

# Testes com cobertura
npm test:coverage

# Verificar lint
npm run lint

# Corrigir lint automaticamente
npm run lint:fix

# Formatar código
npm run format
```

### Fluxo de Desenvolvimento

```bash
# 1. Compilar inicial
npm run build

# 2. Em outro terminal, rodar servidor
npm start

# 3. Em outro terminal, rodar testes em watch mode
npm test:watch

# 4. Desenvolver normalmente
# - Editar arquivos TypeScript
# - Testes recompilam automaticamente
# - Ao salvar, testes passam/falham

# 5. Quando terminar, fazer rebuild
npm run build
```

---

## 🔌 Testar Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### Registrar Usuário
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "password": "Senha123!",
    "username": "usuario_teste",
    "firstName": "João",
    "lastName": "Silva"
  }'
```

### Obter Perfil (com autenticação)
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer seu_token_aqui"
```

---

## 🗂️ Estrutura do Projeto

```
BackBet/
├── src/
│   ├── server.ts                    # Entry point
│   ├── core/                        # Domínios principais
│   │   ├── user/                   # Núcleo de usuários
│   │   ├── finance/                # Núcleo de finanças
│   │   ├── betting/                # Núcleo de apostas
│   │   └── shared/                 # Código compartilhado
│   └── infrastructure/              # Implementações
│       └── api/                     # Express routes e controllers
├── dist/                            # Build compilado (gerado)
├── package.json                     # Dependências
├── tsconfig.json                    # Configuração TypeScript
├── jest.config.js                   # Configuração de testes
├── .env.example                     # Variáveis de exemplo
└── .env                             # Variáveis locais (não commitar)
```

---

## 🐛 Troubleshooting

### Erro: "Cannot find module"
```bash
# Limpar e recompilar
rm -rf dist/
npm run build
npm start
```

### Erro: "ERR_UNKNOWN_FILE_EXTENSION"
- ✓ Já foi corrigido
- Se persistir, verificar se package.json NÃO tem `"type": "module"`

### Erro: "CLERK_PUBLISHABLE_KEY is missing"
- Verificar se `.env` foi criado
- Verificar se as variáveis Clerk foram adicionadas
- Usar `.env.example` como referência

### Testes falhando
```bash
# Limpar cache e rodar
npm test -- --clearCache
npm test
```

### Porta 3000 já está em uso
```bash
# Mudar porta no .env
PORT=3001

# Ou matar processo
lsof -i :3000
kill -9 <PID>
```

---

## 📖 Documentação

- **[CLERK_SETUP.md](./CLERK_SETUP.md)** - Configuração de autenticação
- **[API_DOCS.md](./API_DOCS.md)** - Documentação de endpoints
- **[PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md)** - Plano de produção
- **[SPRINT_1_STATUS.md](./SPRINT_1_STATUS.md)** - Status atual do sprint
- **[src/core/ARCHITECTURE.md](./src/core/ARCHITECTURE.md)** - Arquitetura DDD

---

## ✅ Checklist Antes de Fazer Push

```bash
# 1. Compilar sem erros
npm run build

# 2. Testes passando
npm test

# 3. Sem warnings de lint
npm run lint

# 4. Formatar código
npm run format

# 5. Verificar status
git status

# 6. Fazer commit
git add -A
git commit -m "tipo: descrição da mudança"

# 7. Push
git push origin main
```

---

## 🎯 Próximos Passos

1. **Completar Sprint 1 (Semana 2)**
   - Controllers de usuário
   - Controllers de finanças
   - Testes E2E

2. **Sprint 2 - Banco de Dados**
   - Configurar PostgreSQL
   - Implementar migrations
   - Trocar repositórios em memória

3. **Sprint 3 - Expandir API**
   - Eventos e apostas
   - Testes de integração

---

## 📞 Precisa de Ajuda?

1. Verificar [CLERK_SETUP.md](./CLERK_SETUP.md) para questões de autenticação
2. Verificar [API_DOCS.md](./API_DOCS.md) para endpoints
3. Consultar [SPRINT_1_STATUS.md](./SPRINT_1_STATUS.md) para status
4. Abrir issue no repositório

---

**Última atualização:** 14 de Novembro de 2025

Boa sorte! 🚀
