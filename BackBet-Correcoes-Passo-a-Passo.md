P0 — corrigir imediatamente
1. Corrigir nightly.yml
Fazer cada chamada corresponder a um script existente.
Provavelmente criar:
test:load:distributed
test:crash
test:backup
docker:rebuild:ci
ou alterar o workflow para os comandos reais.
2. Corrigir .env.example
Substituir todos os valores secretos por:
CHANGE_ME
example
TROQUE_AQUI
e criar um mecanismo separado para gerar ambiente CI.
Como os valores atuais estão em um repositório público, eu trataria qualquer credencial já utilizada como comprometida.
P1 — próxima fase
1. completar baseline 50/100/200/300/500
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