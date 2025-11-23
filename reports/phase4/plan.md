# Fase 4 – Observabilidade & Performance (Plano)
_Data: 2025-11-22_

## Objetivos Macro
1. **Endpoints de Saúde & Métricas** – Garantir que `/metrics`, `/health`, `/health/cache` e `/readiness` reflitam o estado real das dependências e sejam cobertos por testes automatizados.
2. **Tracing & Logging Estruturado** – Propagar `requestId`/`userId`, emitir logs JSON e capturar erros de ponta a ponta (Express → domínio).
3. **Dashboards & Alertas** – Publicar painéis Grafana/Alertmanager alinhados com os novos métricos e documentar o runbook de observabilidade.

## Quebra em Tarefas Menores
### 1. Endpoints de Saúde & Métricas
- [x] **Auditar contratos atuais** (`src/infrastructure/api/ApiServer.ts`) para confirmar payloads esperados.
- [x] **Adicionar testes automatizados** cobrindo `/metrics`, `/health`, `/health/cache` (`src/infrastructure/api/__tests__/observabilityEndpoints.test.ts`).
- [ ] **Enriquecer `/readiness`** com checagens de Redis/Mongo usando `redisClient.ping()` e `mongoose.connection.readyState`.
- [ ] **Documentar rotas e respostas** em `docs/OBSERVABILITY.mdx`, incluindo exemplos de payload e troubleshooting por status.

### 2. Tracing & Logging
- [x] **Propagar contexto** com `AsyncLocalStorage` (`src/shared/observability/requestContext.ts`) + middleware `requestId` na `ApiServer`.
- [x] **Estruturar logs de request/error** (`ApiServer.registerErrorHandler`) com `requestId`, `userId`, IP, duração e métricas.
- [ ] **Emitir métricas de latência por rota** no Prometheus usando `httpRequestLatency` diferenciando `status`.<br>
  _Status atual_: histograma já existe, mas falta validar buckets ideais e exportar métricas de erro por rota.
- [ ] **Planejar integração OpenTelemetry** (Node tracer + exporter OTLP) para mapear chamadas a Redis/Mongo.

### 3. Dashboards & Alertas
- [x] **Adicionar snippets PromQL** e playbooks iniciais em `docs/OBSERVABILITY.mdx` (alerta de latência, erros 5xx, cache misses).
- [ ] **Criar painel Grafana** com seções HTTP, Cache e Recursos (documentar arquivo JSON em `reports/phase4/dashboard.json`).
- [ ] **Definir alertas operacionais** em formato YAML (`reports/phase4/alerts.yaml`) cobrindo:
  - Latência P95 > 1s por 5 min.
  - Taxa de erros 5xx > 2% por 10 min.
  - Cache errors > 0 em 5 min (indica problema Redis).
- [ ] **Checklist de verificação** – Antes de encerrar a fase, executar `npm run test`, validar dashboards recebem dados mock e revisar documentação.

## Sequência Recomendada
1. Implementar checagens reais em `/readiness` e atualizar documentação → reexecutar `npm run test`.
2. Ajustar métricas (latência, contadores de erro) e instrumentar pontos críticos (Redis/Mongo) → validar via `curl localhost:3000/metrics`.
3. Gerar arquivos do painel/alertas em `reports/phase4/` e incluir instruções de deploy em `docs/OBSERVABILITY.mdx`.
4. Fechar a fase rodando testes completos + checklist de observabilidade.

## Evidências Atuai​s
| Item | Status | Evidência |
| --- | --- | --- |
| Testes de observabilidade | ✅ | `npm run test` executado em 22/11/2025 23:51 UTC, cobrindo `/health`, `/health/cache`, `/metrics` |
| Logging estruturado | ✅ | Middleware `loggingMiddleware` + `registerErrorHandler` em `ApiServer` geram JSON com `requestId`, `durationMs`, `userId` |
| Documentação | ✅ | `docs/OBSERVABILITY.mdx` atualizado com contexto, request IDs e PromQL |
| Dashboards/Alertas | ⚠️ Pendente | Arquivos e deploy ainda não versionados |
| Readiness real | ⚠️ Pendente | Endpoint ainda retorna `{ ready: true }` sem validar dependências |

> Usar este plano como checklist vivo: atualizar cada subtarefa com ✅/⚠️ e referenciar commits, testes ou docs ao concluir.
