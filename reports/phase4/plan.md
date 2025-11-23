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
- [x] **Enriquecer `/readiness`** com checagens de Redis/Mongo usando `redisClient.ping()` e `mongoose.connection.readyState`. _(Concluído em 23/11/2025 via `ApiServer.readinessHandler`, coberto por `observabilityEndpoints.test.ts`.)_
- [x] **Documentar rotas e respostas** em `docs/OBSERVABILITY.mdx`, incluindo exemplos de payload e troubleshooting por status. _(Inclui sessão sobre métricas HTTP/dependências e instruções CI para Mongo.)_

### 2. Tracing & Logging
- [x] **Propagar contexto** com `AsyncLocalStorage` (`src/shared/observability/requestContext.ts`) + middleware `requestId` na `ApiServer`.
- [x] **Estruturar logs de request/error** (`ApiServer.registerErrorHandler`) com `requestId`, `userId`, IP, duração e métricas.
- [x] **Emitir métricas de latência por rota** no Prometheus usando `httpRequestLatency` diferenciando `status`.<br>
  _Status atual_: histograma em ms+segundos + `http_in_flight` e `http_errors_total` já exportados e documentados; ajustar buckets se métricas reais indicarem necessidade._
- [x] **Planejar integração OpenTelemetry** (Node tracer + exporter OTLP) para mapear chamadas a Redis/Mongo.
  _Status_: `src/infrastructure/observability/tracing.ts` inicializa o NodeSDK com auto-instrumentations (HTTP/Express/ioredis/Mongoose) e é habilitado por `TRACING_ENABLED`. `docs/OBSERVABILITY.mdx` documenta variáveis e passos para ativação.

### 3. Dashboards & Alertas
- [x] **Adicionar snippets PromQL** e playbooks iniciais em `docs/OBSERVABILITY.mdx` (alerta de latência, erros 5xx, cache misses).
- [x] **Criar painel Grafana** com seções HTTP, Cache e Recursos (documentar arquivo JSON em `reports/phase4/dashboard.json`). _(Dashboard `BackBet - Observability` pronto e incluído no repo.)_
- [x] **Definir alertas operacionais** em formato YAML (`reports/phase4/alerts.yaml`) cobrindo:
  - Latência P95 > 1s por 5 min.
  - Taxa de erros 5xx > 2% por 10 min.
  - Cache errors > 0 em 5 min (indica problema Redis).
- [ ] **Checklist de verificação** – Antes de encerrar a fase, executar `npm run test`, validar dashboards recebem dados mock e revisar documentação.
  _A fazer_: importar dashboard/alertas somente quando houver ambiente de observabilidade definitivo. Por enquanto, mantenha o checklist limitado a `npx jest` + `npm run build` e revisão dos docs atualizados.

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
| Dashboards/Alertas | ✅ | `reports/phase4/dashboard.json` e `reports/phase4/alerts.yaml` versionados + instruções em `docs/OBSERVABILITY.mdx` |
| Readiness real | ✅ | `/readiness` agora pinga Redis/Mongo, com métricas `backbet_dependency_health_*` + testes dedicados |

> Usar este plano como checklist vivo: atualizar cada subtarefa com ✅/⚠️ e referenciar commits, testes ou docs ao concluir.
