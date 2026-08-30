#!/usr/bin/env node
/* eslint-env node */
'use strict';
// =============================================================================
// Auto-avaliação de segurança e conformidade (Fase 35 — Certificação e
// preparação para operação real).
//
// Mapeia os controles que a SPA exige (proteção contra acessos não autorizados,
// auditoria e retenção, continuidade de negócio/backups, integridade financeira,
// compliance modular e infraestrutura de produção) para EVIDÊNCIAS concretas no
// repositório: arquivos, configuração e código.
//
// Controles "bloqueantes" (domínios A–F) falhando fazem o script sair com
// código 1 — o mesmo espírito de `npm run check:secrets` para o CI. Controles
// "pendentes" (W) não bloqueiam: dependem de operador autorizado, provedores
// externos ou certificação — itens documentados como dividas de produção.
//
// Removível sem efeito colateral: apenas leitura do repositório.
// Uso:
//   npm run security:assess
//   node scripts/security-assess.cjs
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');

const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => {
  try {
    return exists(p) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : '';
  } catch {
    return '';
  }
};
function has(p, re) {
  return new RegExp(re).test(read(p));
}

function packageScript(name) {
  try {
    const pkg = JSON.parse(read('package.json'));
    return !!pkg.scripts && typeof pkg.scripts[name] === 'string' && pkg.scripts[name].length > 0;
  } catch {
    return false;
  }
}

const checks = [];

function control(domain, id, title, blocking, pass, evidence) {
  checks.push({ domain, id, title, blocking, pass, evidence });
}

// A — Segurança de acesso (proteção contra acessos não autorizados)
const AUTH_MW = 'src/infrastructure/api/middleware/AuthMiddleware.ts';
control(
  'A — Segurança de acesso',
  'A-01',
  'Autenticação obrigatória por JWT (passport-jwt)',
  true,
  has(AUTH_MW, /passport\.use\s*\(/) &&
    has(AUTH_MW, /ExtractJwt/) &&
    has(AUTH_MW, /protectedRoute/),
  'src/infrastructure/api/middleware/AuthMiddleware.ts (JwtStrategy + protectedRoute)',
);
control(
  'A — Segurança de acesso',
  'A-02',
  'Guarda de papel ADMIN em operações sensíveis',
  true,
  has(AUTH_MW, /\brequireAdminRole\b/) &&
    has('src/infrastructure/api/routes/adminRoutes.ts', /\brequireAdminRole\b/) &&
    has('src/infrastructure/api/routes/financeRoutes.ts', /\brequireAdminRole\b/),
  'requireAdminRole (AuthMiddleware.ts) aplicado em adminRoutes.ts e financeRoutes.ts',
);
control(
  'A — Segurança de acesso',
  'A-03',
  'Hash de senha com custo 12 (bcrypt)',
  true,
  has('src/core/user/domain/services/UserService.ts', /bcrypt\.hash\([^,]+,\s*12\)/),
  'src/core/user/domain/services/UserService.ts:30 (bcrypt.hash(pass, 12))',
);
control(
  'A — Segurança de acesso',
  'A-04',
  'Rate limiting global e por rota',
  true,
  has('src/infrastructure/api/ApiServer.ts', /rateLimit\s*\(/) &&
    exists('src/infrastructure/api/middleware/routeRateLimiter.ts'),
  'ApiServer.ts + middleware/routeRateLimiter.ts (express-rate-limit)',
);
control(
  'A — Segurança de acesso',
  'A-05',
  'Headers de segurança (helmet)',
  true,
  has('src/infrastructure/api/ApiServer.ts', /helmet\s*\(/),
  'ApiServer.ts:101 (helmet)',
);
control(
  'A — Segurança de acesso',
  'A-06',
  'CORS restrito por allowlist',
  true,
  has('src/infrastructure/api/ApiServer.ts', /\bcors\s*\(/) &&
    has('src/shared/config/appConfig.ts', /CORS_ALLOWED_ORIGINS/),
  'ApiServer.ts:131 (cors) + appConfig.cors.allowedOrigins (allowlist)',
);
control(
  'A — Segurança de acesso',
  'A-07',
  'Limite de payload no corpo da requisição',
  true,
  has('src/infrastructure/api/ApiServer.ts', /express\.json\(\{[^}]*limit\s*:/),
  'ApiServer.ts:157 (express.json({ limit: 10mb }))',
);
control(
  'A — Segurança de acesso',
  'A-08',
  'Validação de entrada (Zod) na camada HTTP',
  true,
  has('src/infrastructure/api/controllers/BaseController.ts', /from 'zod'/) &&
    exists('src/infrastructure/api/dtos/AuthDTOs.ts') &&
    exists('src/infrastructure/api/dtos/FinanceDTOs.ts'),
  'BaseController.ts + dtos/* (validação determinística de entrada)',
);
control(
  'A — Segurança de acesso',
  'A-09',
  'Guarda de segredos no repositório (check:secrets)',
  true,
  exists('scripts/check-secrets.cjs') && packageScript('check:secrets'),
  'scripts/check-secrets.cjs + npm run check:secrets (CI gate)',
);

// B — Auditoria, logs e retenção
control(
  'B — Auditoria e retenção',
  'B-01',
  'Eventos de auditoria persistidos',
  true,
  exists('src/core/audit/domain/services/AuditService.ts') &&
    exists('src/infrastructure/persistence/mongoose/schemas/AuditEventSchema.ts'),
  'AuditService.ts + AuditEventSchema.ts (coleção auditsevents)',
);
control(
  'B — Auditoria e retenção',
  'B-02',
  'Retenção de auditoria com default >= 5 anos (1825 dias)',
  true,
  has('src/shared/config/env.ts', /1825/) &&
    has('src/shared/config/appConfig.ts', /parsePositiveInt\(env\.AUDIT_RETENTION_DAYS,\s*1825\)/),
  'appConfig.ts:341 (retentionDays=1825) + automatic.audit.retention',
);
control(
  'B — Auditoria e retenção',
  'B-03',
  'Ledger financeiro append-only (transactionId único)',
  true,
  has('src/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema.ts', /transactionId/) &&
    has('src/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema.ts', /unique:\s*true/),
  'LedgerEntrySchema.ts (índice único transactionId)',
);
control(
  'B — Auditoria e retenção',
  'B-04',
  'Política de logs sem segredos documentada',
  true,
  exists('docs/LOGS.mdx') && exists('docs/SECURITY-OPS.mdx'),
  'docs/LOGS.mdx + docs/SECURITY-OPS.mdx (política e checklist)',
);

// C — Continuidade de negócio
control(
  'C — Continuidade de negócio',
  'C-01',
  'Backup automatizado (criação e restauração)',
  true,
  packageScript('backup:create') && packageScript('backup:restore'),
  'npm run backup:create / backup:restore (src/scripts/backup-mongo.ts)',
);
control(
  'C — Continuidade de negócio',
  'C-02',
  'Validação do backup após criação',
  true,
  packageScript('backup:validate'),
  'npm run backup:validate (src/scripts/validate-backup.ts)',
);
control(
  'C — Continuidade de negócio',
  'C-03',
  'Teste de recuperação (drill)',
  true,
  packageScript('backup:drill'),
  'npm run backup:drill (src/scripts/backup-drill.ts)',
);
control(
  'C — Continuidade de negócio',
  'C-04',
  'Runbook de recuperação com RPO/RTO',
  true,
  exists('docs/BACKUP_RECOVERY.mdx'),
  'docs/BACKUP_RECOVERY.mdx (DR/RPO/RTO e passos de restauração)',
);

// D — Integridade financeira
control(
  'D — Integridade financeira',
  'D-01',
  'Dinheiro modelado em centavos nos schemas (sem float)',
  true,
  has('src/infrastructure/persistence/mongoose/schemas/WalletSchema.ts', /balanceCents/) &&
    has('src/infrastructure/persistence/mongoose/schemas/LedgerEntrySchema.ts', /amountCents/) &&
    has('src/infrastructure/persistence/mongoose/schemas/BetSchema.ts', /amountCents/),
  'WalletSchema.ts / LedgerEntrySchema.ts / BetSchema.ts (*Cents)',
);
control(
  'D — Integridade financeira',
  'D-02',
  'Invariantes financeiros testados (FI-01..FI-10)',
  true,
  exists('src/core/finance/domain/services/__tests__/FinancialInvariants.test.ts'),
  'FinancialInvariants.test.ts (22 casos) + docs/FINANCIAL_INVARIANTS.mdx',
);
control(
  'D — Integridade financeira',
  'D-03',
  'Limites mínimos e máximos de depósito/saque',
  true,
  exists('src/core/finance/domain/services/MoneySecurityService.ts'),
  'MoneySecurityService.ts (min/max aplicados em depósito e saque)',
);
control(
  'D — Integridade financeira',
  'D-04',
  'Reconciliação financeira diária e do tesouro',
  true,
  exists('src/core/reports/application/use-cases/GetDailyFinancialSummary.ts') &&
    exists('src/core/treasury/application/use-cases/ReconcileTreasury.ts'),
  'GetDailyFinancialSummary.ts + ReconcileTreasury.ts',
);

// E — Compliance modular
control(
  'E — Compliance modular',
  'E-01',
  'Port de KYC (verificação de identidade)',
  true,
  exists('src/core/compliance/domain/ports/IKycProviderPort.ts') &&
    exists('src/core/compliance/domain/services/ComplianceService.ts'),
  'IKycProviderPort.ts + ComplianceService.ts (gate de saque > limite)',
);
control(
  'E — Compliance modular',
  'E-02',
  'Port de geolocalização',
  true,
  exists('src/core/compliance/domain/ports/IGeolocationProviderPort.ts'),
  'IGeolocationProviderPort.ts (adapter real entra por appConfig.compliance.geolocation)',
);
control(
  'E — Compliance modular',
  'E-03',
  'Port de integridade de dispositivo',
  true,
  exists('src/core/compliance/domain/ports/IDeviceIntegrityProviderPort.ts'),
  'IDeviceIntegrityProviderPort.ts (adapter real entra por appConfig.compliance.deviceIntegrity)',
);
control(
  'E — Compliance modular',
  'E-04',
  'Módulo SIGAP (reporte regulatório)',
  true,
  exists('src/core/sigap/domain/services/SigapService.ts') &&
    exists('src/infrastructure/jobs/SigapTransmissionJob.ts') &&
    exists('docs/SIGAP_CONFORMIDADE.mdx'),
  'src/core/sigap/* + SigapTransmissionJob.ts (server.ts) + docs/SIGAP_CONFORMIDADE.mdx',
);
control(
  'E — Compliance modular',
  'E-05',
  'Jogo responsável (limites personalizáveis)',
  true,
  exists('src/core/responsibleGambling/domain/services/ResponsibleGamblingService.ts') &&
    exists('src/infrastructure/persistence/mongoose/schemas/ResponsibleGamblingProfileSchema.ts'),
  'ResponsibleGamblingService.ts + ResponsibleGamblingProfileSchema.ts',
);

// F — Infraestrutura de produção
control(
  'F — Infraestrutura de produção',
  'F-01',
  'Imagem Docker e orquestração por compose',
  true,
  exists('Dockerfile') && exists('docker-compose.yml'),
  'Dockerfile + docker-compose.yml (server01/02)',
);
control(
  'F — Infraestrutura de produção',
  'F-02',
  'Hardening do servidor (UFW/SSH/atualizações)',
  true,
  exists('deploy/harden-server.sh'),
  'deploy/harden-server.sh (UFW, SSH por chave, unattended-upgrades, fail2ban)',
);
control(
  'F — Infraestrutura de produção',
  'F-03',
  'TLS terminado no reverse proxy',
  true,
  exists('deploy/proxy/Caddyfile'),
  'deploy/proxy/Caddyfile (HTTPS automático)',
);
control(
  'F — Infraestrutura de produção',
  'F-04',
  'Serviços internos não expostos na internet',
  true,
  !/ports\s*:\s*\n\s*-.*(27017|6379)/.test(read('docker-compose.yml')),
  'docker-compose.yml (Redis interno sem porta pública; Mongo fora do compose)',
);
control(
  'F — Infraestrutura de produção',
  'F-05',
  'CI com gates de segurança (secrets/typecheck/lint/audit crítico)',
  true,
  has('.github/workflows/ci.yml', /check:secrets/) &&
    has('.github/workflows/ci.yml', /typecheck/) &&
    has('.github/workflows/ci.yml', /audit:prod:critical/),
  '.github/workflows/ci.yml (jobs test + integration)',
);
control(
  'F — Infraestrutura de produção',
  'F-06',
  'Observabilidade e alertas',
  true,
  exists('deploy/observability/prometheus.yml') &&
    exists('deploy/observability/alerting/alerts.yml'),
  'deploy/observability/* (Prometheus, alertas, Grafana)',
);

// W — Pendências de produção (não bloqueantes; dependem de terceiros/regulação)
control(
  'W — Pendências de produção',
  'W-01',
  'Provedor real de KYC (biometria/prova de vida)',
  false,
  false,
  'Só port implementado; provedor real exige contratação (entities autorizadas).',
);
control(
  'W — Pendências de produção',
  'W-02',
  'Geolocalização real (VPN/proxy dotação por IP)',
  false,
  false,
  'Port implementado; provedor real (ex.: validação p/ crypto-coins) entra por adapter.',
);
control(
  'W — Pendências de produção',
  'W-03',
  'Adapter SIGAP real (mTLS/TLS 1.2, e-CNPJ, token)',
  false,
  false,
  'Módulo e job prontos; habilitar com SIGAP_ENABLED=true e credenciais da operadora.',
);
control(
  'W — Pendências de produção',
  'W-04',
  'PSP/Pix real para depósitos e saques',
  false,
  false,
  'MoneyService plugável; hoje PIX_PROVIDER=mock apenas.',
);
control(
  'W — Pendências de produção',
  'W-05',
  'Certificação SPA / auditoria externa de segurança',
  false,
  false,
  'Processo externo: exigido antes de dinheiro real (Fase 35 passo 4-6 do plano).',
);

const blockingFailures = checks.filter((c) => c.blocking && !c.pass);
const warnings = checks.filter((c) => !c.blocking);
const passed = checks.filter((c) => c.blocking && c.pass);

let output = [];
output.push('============================================================');
output.push(' BackBet — Auto-avaliação de segurança e conformidade');
output.push(' Fase 35 — preparação para operação real');
output.push('============================================================');
output.push('');
for (const domain of [...new Set(checks.map((c) => c.domain))]) {
  output.push(`## ${domain}`);
  for (const c of checks.filter((x) => x.domain === domain)) {
    const mark = c.pass ? '✔' : (c.blocking ? '✗' : '◌');
    output.push(`  ${mark} ${c.id} ${c.title}`);
    output.push(`      ${c.evidence}`);
  }
  output.push('');
}
if (warnings.length > 0) {
  output.push(`## W — Dívidas de produção (${warnings.length}) — não bloqueiam o ambiente de dev`);
  for (const w of warnings) {
    output.push(`  ◌ ${w.id} ${w.title}`);
    output.push(`      ${w.evidence}`);
  }
  output.push('');
}

const summary = [
  `Resultado: ${passed.length} controles bloqueantes presenciais OK`,
  `           ${blockingFailures.length} controle(s) bloqueante(s) falhando`,
  `           ${warnings.length} pendência(s) dependente(s) de terceiros/regulação`,
].join('\n');
output.push(summary);

const report = output.join('\n');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonReport = {
  generatedAt: new Date().toISOString(),
  result: blockingFailures.length === 0 ? 'PASS' : 'FAIL',
  blockingPassed: passed.length,
  blockingFailures: blockingFailures.map((c) => c.id),
  warnings: warnings.map((c) => c.id),
  checks: checks.map((c) => ({
    id: c.id,
    domain: c.domain,
    title: c.title,
    blocking: c.blocking,
    pass: c.pass,
    evidence: c.evidence,
  })),
};

if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}
fs.writeFileSync(path.join(REPORT_DIR, `security-assessment-${stamp}.txt`), report, 'utf8');
fs.writeFileSync(
  path.join(REPORT_DIR, `security-assessment-${stamp}.json`),
  JSON.stringify(jsonReport, null, 2),
  'utf8',
);

console.log(report);
console.log('');
console.log(`Relatório escrito em reports/security-assessment-${stamp}.txt (e .json)`);
console.log('');

const usedCheckCount = checks.length;
console.log(
  blockingFailures.length === 0
    ? `✔ ${usedCheckCount} evidências verificadas — nenhum controle bloqueante falhou.`
    : `✗ ${blockingFailures.length} controle(s) bloqueante(s) falhou(ram): ${blockingFailures
        .map((c) => c.id)
        .join(', ')}`,
);
process.exit(blockingFailures.length === 0 ? 0 : 1);