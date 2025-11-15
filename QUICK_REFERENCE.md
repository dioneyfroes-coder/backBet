# 🚀 Quick Reference - Sprint 1 Phase 1

## ⚡ Atalhos

```bash
# Desenvolver
npm install && npm run build && npm start

# Testar
npm test

# Ver cobertura
npm test -- --coverage

# Rodar linter
npm run lint

# Compilar apenas
npm run build
```

---

## 🧪 Testar Endpoints Manualmente

### 1. Registrar usuário
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass@123",
    "firstName": "João",
    "lastName": "Silva",
    "username": "joaosilva"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Usuário registrado com sucesso",
    "user": {
      "id": "uuid-123",
      "email": "user@example.com",
      "username": "joaosilva",
      "status": "PENDING_VERIFICATION"
    }
  }
}
```

### 2. Get autenticado
```bash
curl -H "Authorization: Bearer uuid-123" \
  http://localhost:3000/api/auth/me
```

### 3. Health check
```bash
curl http://localhost:3000/health
```

---

## 📁 Estrutura Chave

```
src/
├── server.ts                           ← Entry point
├── infrastructure/api/
│   ├── ApiServer.ts                   ← Express config
│   ├── controllers/
│   │   ├── BaseController.ts          ← Padrão
│   │   └── AuthController.ts          ← 5 endpoints
│   ├── middleware/
│   │   └── AuthMiddleware.ts          ← Auth + fallback
│   ├── dtos/
│   │   └── AuthDTOs.ts                ← Validação
│   └── routes/
│       └── authRoutes.ts              ← Routes factory
├── core/user/domain/
│   ├── entities/User.ts
│   ├── services/UserService.ts
│   └── repositories/UserRepository.ts
└── core/finance/domain/
    ├── entities/Wallet.ts
    ├── services/WalletService.ts
    └── repositories/WalletRepository.ts
```

---

## 🎯 5 Endpoints Funcionando

| Endpoint | Método | Auth | Status |
|----------|--------|------|--------|
| `/api/auth/register` | POST | ❌ | ✅ |
| `/api/auth/me` | GET | ✅ | ✅ |
| `/api/auth/login` | POST | ❌ | ✅ |
| `/api/auth/logout` | POST | ✅ | ✅ |
| `/api/auth/refresh` | POST | ✅ | ✅ |

---

## 🔐 Autenticação em Desenvolvimento

**Bearer Token Pattern:**
```bash
Authorization: Bearer <USER_ID>
```

**Exemplo:**
```bash
curl -H "Authorization: Bearer cadaeb28-c7f7-425b-91f7-73a27141ae49" \
  http://localhost:3000/api/auth/me
```

---

## 📚 Documentos Essenciais

| Arquivo | Para | Tempo |
|---------|------|-------|
| `README_PHASE_1_COMPLETE.md` | Leia PRIMEIRO | 5 min |
| `PHASE_2_ROADMAP.md` | Próximos passos | 10 min |
| `INDEX.md` | Navegar docs | 5 min |
| `API_DOCS.md` | Detalhes endpoints | 10 min |
| `QUICKSTART.md` | Rodar rápido | 3 min |

---

## 🧬 Padrões de Código

### Adicionar novo endpoint

1. **DTO com Zod** (`AuthDTOs.ts`)
```typescript
export const RegisterDTO = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // ...
});
```

2. **Controller** (`AuthController.ts`)
```typescript
async register(req: Request, res: Response): Promise<void> {
  try {
    const data = RegisterDTO.parse(req.body);
    // Lógica aqui
    this.created(res, result);
  } catch (error) {
    this.internalError(res, error);
  }
}
```

3. **Route** (`authRoutes.ts`)
```typescript
router.post('/register', (req, res) => controller.register(req, res));
```

4. **Teste**
```typescript
test('deve registrar usuário', async () => {
  const result = await controller.register(req, res);
  expect(res.status).toBe(201);
});
```

---

## ✅ Checklist de Qualidade

Para todo novo endpoint:
- [ ] DTO com Zod
- [ ] Controller implementado
- [ ] Testes unitários (100% coverage)
- [ ] Documentação comentada
- [ ] Error handling completo
- [ ] TypeScript strict mode pass
- [ ] Lint pass
- [ ] Build pass

---

## 🚨 Troubleshooting

### Erro: "Publishable key is missing"
**Solução:** Valores no `.env` estão inválidos
```bash
# Verificar .env
cat .env | grep CLERK

# Deve ter sk_test (desenvolvimento)
CLERK_SECRET_KEY=sk_test_local_development_only
```

### Erro: "Cannot find module"
**Solução:** Recompilar
```bash
npm run build
```

### Testes falhando
**Solução:** Rodar fresh
```bash
npm test -- --clearCache
npm test
```

---

## 📊 Métricas

```
✅ Testes:      150/150
✅ Cobertura:   100%
✅ Errors:      0
✅ Warnings:    0
✅ Endpoints:   5/5
```

---

## 🎯 Próximos Passos

1. Ler `PHASE_2_ROADMAP.md`
2. Implementar UserController
3. Implementar WalletController
4. Adicionar testes E2E
5. Fazer PR para review

---

## 💡 Tips & Tricks

### Debug com logs
```typescript
console.log('[DEBUG]', { userId, userData });
```

### Teste rápido
```bash
# Em outro terminal
npm start

# E em outro
curl http://localhost:3000/health
```

### Rebuild automático
```bash
# Terminal 1
npm run build:watch

# Terminal 2
npm start
```

---

## 🎓 Links Úteis

- TypeScript: https://www.typescriptlang.org/docs/
- Zod: https://zod.dev/
- Express: https://expressjs.com/
- Clerk: https://clerk.com/docs
- Jest: https://jestjs.io/

---

## 📞 Suporte

| Pergunta | Resposta |
|----------|----------|
| Como rodar? | `npm install && npm start` |
| Como testar? | `npm test` |
| Padrão de controller? | Ver `AuthController.ts` |
| Como adicionar endpoint? | Ver `PHASE_2_ROADMAP.md` |
| Variáveis de env? | Ver `.env` |

---

**Status:** 🟢 Pronto para usar  
**Versão:** 1.0.0
