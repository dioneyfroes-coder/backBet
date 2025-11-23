Fase 1 – Avaliação do Repositório

Data: 2025-11-22

Mapa de Módulos & Riscos Atuais
Core / User (src/core/user)

domain/entities/User.ts mantém campos mutáveis (username, status, passwordHash) sem validação encapsulada; invariantes ausentes permitem usernames inválidos e mudanças de status sem trilha de auditoria.

Não há eventos de domínio ou guards para garantir normalização de Email; múltiplos serviços reescrevem lógica, aumentando duplicação.

Hash/comparação de senha ficam em UserService, mas as entidades expõem passwordHash publicamente, elevando risco de vazamento acidental.

Core / Finance (src/core/finance)

domain/entities/Wallet.ts manipula números crus; regras de conversão e arredondamento não são aplicadas, abrindo brechas para erros de precisão.

Wallet cria Transaction com crypto.randomUUID(), mas o arquivo não importa crypto do Node, podendo quebrar o build dependendo da config do TS.

Não existe integração de persistência além do repositório em memória; operações de locking/withdraw não persistem transações, causando perda de dados após restart.

Core / Betting (src/core/betting)

Entidades (Bet, Event) usam números primitivos para odds/valores em vez de value objects; validação duplicada entre serviços e casos de uso.

Testes existem apenas para entidades (domain/entities/__tests__), enquanto casos de uso e repositórios não têm cobertura e estão fora de __tests__.

Config (config/bet.ts) mistura defaults da aplicação com flags experimentais; precisa mover tudo para overrides dirigidos por ambiente.

Core / Shared (src/core/shared)

Value objects compartilhados (Money, UniqueId) existem, mas não são usados de forma consistente; vários módulos tratam números/strings diretamente.

shared/types/domain.types.ts expõe tipos amplos, porém controllers os ignoram, reduzindo segurança de tipos nas bordas.

Infrastructure / API (src/infrastructure/api)

ApiServer.ts conecta middleware corretamente, mas não diferencia routers públicos e privados; autenticação é aplicada manualmente por rota, sujeita a esquecimentos.

Controllers (AuthController, WalletController, etc.) validam schema, mas dependem de BaseController.validateSchema retornar null; erros não são descritivos e a lógica de validação não é centralizada.

Infrastructure / Middleware

AuthMiddleware.ts loga detalhes de tokens no stdout e aceita qualquer bearer token em desenvolvimento sem verificar assinatura, facilitando vazamentos acidentais.

optionalAuth apenas chama next() sem capturar erros; try/catch sobrando.

cacheMiddleware.ts sobrescreve res.json e não restaura em caso de erro; respostas não-JSON passam batido do cache.

Infrastructure / Observability

observability/metrics.ts expõe métricas de HTTP + cache, mas nada de operações de negócio (depósitos, apostas). Não há buckets de histogram ajustados por grupos de rotas.

Atualização de métricas roda a cada 3s mesmo com cache desativado; apesar de retornar cedo, ainda acorda o event loop.

Infrastructure / Persistence

Repositórios Mongo (infrastructure/persistence/mongoose) coexistem com repositórios em memória; fábricas não impõem uma estratégia única, permitindo mistura acidental de camadas.

Shared Config (src/shared/config)

appConfig.jwt.secret cai no default 'backbet-secret' se a env faltar — inseguro.

Rate-limits padrão são altíssimos (5k/10 min) até em produção; não há overrides por endpoint além das rotas de auth.

Lacunas Imediatas a Atacar nas Próximas Fases

Normalizar o uso de value objects (Money, Email) em todos os módulos de domínio.

Fortalecer o middleware de auth (remover logs, bloquear tokens sem assinatura salvo flag explícita).

Consolidar a estratégia de persistência e garantir que repositórios/testes usem uma única fonte de verdade.

Expandir cobertura de testes e mover specs para diretórios __tests__ previsíveis por módulo.

Trocar defaults mágicos (JWT secret, limites de rate) por exigências via ambiente + validação no startup.