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
5. revisar branch coverage dos fluxos financeiros
6. corrigir pm2:start:prod
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