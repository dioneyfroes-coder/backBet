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
2. executar baseline específico no server01
3. resolver vulnerabilidades HIGH principais
4. migrar Bull → BullMQ
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