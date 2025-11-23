Fase 1 – Revisão da Postura de Segurança

Data: 2025-11-22

Autenticação & Autorização

Segredo JWT padrão: appConfig.jwt.secret recai para backbet-secret (veja src/shared/config/appConfig.ts). O servidor inicia mesmo sem JWT_SECRET, permitindo que deploys em produção rodem com uma chave conhecida.

Bypass de token em desenvolvimento: protectedRoute em src/infrastructure/api/middleware/AuthMiddleware.ts aceita qualquer bearer string como user ID quando NODE_ENV === 'development'. Não há feature flag para desabilitar isso em staging, arriscando rotas desprotegidas se houver promoção acidental.

Logs verbosos de token: o middleware imprime a estrutura do token (console.log('protectedRoute token parts', ...)), podendo expor tokens sensíveis em logs compartilhados.

Middleware de auth opcional: optionalAuth engole erros e nunca verifica tokens; rotas que dependem de auth “best effort” nunca recebem identidades decodificadas.

Gerenciamento de sessão: refresh tokens usam o mesmo campo sessionId, mas não existe lista de revogação no servidor. Tokens comprometidos permanecem válidos até expirar.

Validação de Entrada & Rate Limiting

Controllers delegam a validação para DTOs, mas BaseController.validateSchema só retorna null ou payload; clientes não recebem erros detalhados, dificultando diagnósticos de segurança.

Limites padrão (RATE_LIMIT_MAX=5000) são permissivos. Rotas de auth usam rate limiter compartilhado; não há throttling por IP ou bloqueio de conta após repetidas falhas.

Segredos & Configuração

.gitignore antes excluía lockfiles; agora corrigido, mas ainda falta validação para garantir que segredos obrigatórios (CLERK_SECRET_KEY, JWT_SECRET, credenciais de banco) existam antes do boot. env.ts apenas lê process.env sem schema.

ClerkService desativa-se silenciosamente quando a chave contém sk_test, devolvendo a responsabilidade de login ao fluxo interno de JWT sem alerta.

Proteção de Dados

A entidade User expõe passwordHash publicamente, facilitando vazamento acidental via controllers/DTOs.

Transações da wallet ficam só em memória; não há persistência para auditoria nem proteção contra adulteração.

Transporte & Headers

ApiServer usa helmet, mas não força HTTPS nem configura HSTS/CSP conforme ambiente.

Recomendações

Exigir segredos críticos no startup (falhar rápido se JWT_SECRET/CLERK_SECRET_KEY estiverem ausentes).

Remover o bypass de token de desenvolvimento ou protegê-lo com flag explícita ALLOW_INSECURE_AUTH=false.

Substituir logs sensíveis por logs estruturados com redaction.

Reforçar rate limiting (por IP + por usuário) e aplicar backoff/bloqueio após falhas repetidas de login.

Introduzir revogação de tokens (armazenar hashes de refresh tokens em Redis/Mongo e invalidar em logout/reset).

Fortalecer validação de DTOs com erros detalhados e mensagens sanitizadas.

Persistir transações da wallet e logs de atividade do usuário para auditoria e conformidade.