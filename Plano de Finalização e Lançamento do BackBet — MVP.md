# BackBet — ToDo para retomar o trabalho

> Última execução completa (suíte real, Mongo/Redis Docker, 902 testes):
> **901 passando, 1 falhando.** As 3 falhas de integração (T4 rollback, T4 corrida
> de exposição, T5 worker, T6 resultado WON) estão CORRIGIDAS e passando.

## ⏳ Parado em / próximo passo

### 🎯 Única falha restante — config de cache
- [ ] `src/shared/config/__tests__/configParsing.test.ts`
  - "derives cache configuration defaults": esperava `cacheConfig.defaultTTLSeconds === 120` e `enabled === true`
- [ ] Causa suspeita: `BACKBET_RUNTIME_ENV=test` injetado pelo runner/container → `cacheEnabled` deriva p/ `false`
- [ ] Verificar como `run-integration-tests.cjs` / compose setam `BACKBET_RUNTIME_ENV` e `NODE_ENV` antes do Jest
- [ ] Decidir: teste unitário deve re-setar `BACKBET_RUNTIME_ENV` (isolamento) OU runner não deve setá-lo
- [ ] Rodar suíte completa até **0 falhas**

### Pendências abertas do plano (#TODO adiados para o MVP pós-pipeline)
- [ ] `env.ts`: remover fallbacks `localhost` p/ `MONGODB_URI` e `REDIS_URL`; tornar obrigatórios em prod/teste
- [ ] `run-integration-tests.cjs`: remover `192.168.22.250`, `27018`, `6379`, `localhost` (script só deve receber env do container)
- [ ] Docker compose: `integration-tests` na mesma network; `mongodb:27017`/`redis:6379` internos; `REDIS_URL=redis`
- [ ] Mongo: usuario `backbet-test` com `readWrite` só em `backbet-test`; nunca apagar dados de `backbet`
- [ ] .env: criar `MONGODB_TEST_URI` + usuário de teste; nunca colocar IP do host nas URIs
- [ ] Redis: garantir fallback `redis://localhost:6379` nenhum; `REDIS_URL` em todos containers

## ✅ Feito (esta rodada — não repetir)
- [x] T4 rollback/raça: `MongooseBetRepository` — `create([...], { session })` (array obrigatório no Mongoose 8)
- [x] T4 corrida de exposição: manutencao de estado via `includeResultMetadata`
- [x] T5 worker/reentrega duplicada: array-create com session + `includeResultMetadata`
- [x] T6 resultado WON reentregue: idempotência preserva `status` via `toJSON()`/`serialize` no round-trip Mongo Mixed
```
