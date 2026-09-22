P0 — corrigir imediatamente
1. Corrigir nightly.yml
Fazer cada chamada corresponder a um script existente.
Provavelmente criar:
test:load:distributed
test:crash
test:backup
docker:rebuild:ci
ou alterar o workflow para os comandos reais.
P1 — próxima fase
1. completar baseline 50/100/200/300/500 ✓ rodado em 22/09 (runId 302fc891; 0 rejeitadas em todos os níveis; contenção @500 p50≈449s, distribuído @500 ~81 ops/s)
2. executar baseline específico no server01 ✓ executado no host server01 com a stack de produção ativa (mesma rodada do item 1)
3. resolver vulnerabilidades HIGH principais ✓ audit --omit=dev: 0 críticas/0 altas (pm2@7, nodemailer@10, @opentelemetry/* major; fica só 1 moderada uuid via bull → BullMQ)
4. migrar Bull → BullMQ ✓ migrado em 22/09 (bullmq@6.3.8; produtores/workers BullMQ + helper de conexão; 0 vulnerabilidades em prod; 1094 testes verdes; smoke real contra Redis OK)
5. revisar branch coverage dos fluxos financeiros ✓ revisado em 22/09 e consolidado na 2ª/3ª passada: global branch 67,4%→70,22% / stmts 84→85,53% / fns 80,7→82,76%; +79 testes (1173). Log dos alvos: r1 restoreBet 89%, Withdraw 100%, transfers tesouraria 100%, RiskExposureUnderflowError 100%, BullWithdrawalQueue 67%; r2 EventCatalogService 0→93% br, PurchaseCreditPackage →100% br, CreditPackageRepository 0→100%, WithdrawalRequestService 63→100% br/90% st, financeReconciliation 54→96% br/100% st; r3 withdrawalQueueFactory 50→100% br, reconcileDbFinance coberto, FinancialReconciliationService 100%
6. corrigir pm2:start:prod ✓ corrigido em 22/09: script usava `--env development` (carregava `env_development` → NODE_ENV=development/CACHE_ENABLED=false em produção); agora `--env production` (perfil env base), mantendo `--no-daemon` (foreground/conda container)
P2 — preparação para produto
1. PSP real
2. KYC real
3. geolocalização real
4. device integrity
5. SIGAP real
6. certificação/homologação
E somente depois:
multi-tenant
onboarding B2B
white-label
isolamento por operador