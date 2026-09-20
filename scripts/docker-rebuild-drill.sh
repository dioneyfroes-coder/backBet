#!/usr/bin/env bash
# =============================================================================
# BackBet — Drill de reconstrução limpa (Fase 17 — Docker e ambiente)
#
# Executa o ciclo completo descrito no plano de evolução:
#
#   docker compose down -v
#   docker compose build --no-cache
#   docker compose up -d
#   docker compose ps
#   curl /health
#   curl /readiness
#
# e valida que, a partir de um estado totalmente limpo, API, MongoDB, Redis e
# os workers voltam a funcionar. Falha (exit != 0) se qualquer serviço não
# ficar healthy, se o /health não responder "healthy" ou se o /readiness não
# reportar ready=true com mongo/redis up.
#
# AVISO: `docker compose down -v` destrói os volumes nomeados (mongodb_data,
# redis_data, backbet_logs, backbet_uploads). Por isso, quando este drill roda
# num ambiente com volumes já existentes, pede confirmação (ou use --yes).
#
# Uso:
#   bash scripts/docker-rebuild-drill.sh [--yes] [--cache] [--down] [--base-url URL]
#
#   --yes       pula a confirmação de destruição de volumes (CI/não-interativo)
#   --cache     build com cache (default: --no-cache, como o plano manda)
#   --down      derruba a stack ao final (CI) — default mantém de pé
#   --base-url  URL da API para os curls (default http://127.0.0.1:${BACKBET_PORT:-3000})
#
# Variáveis:
#   LAB_BIND_IP  IP onde Mongo/Redis publicam porta. Default 192.168.22.250
#                (IP estático deliberado do laboratório — mantido como default).
#                Em CI sem esse IP, use LAB_BIND_IP=127.0.0.1.
#   BACKBET_PORT Porta HTTP publicada da API (default 3000).
# =============================================================================
set -euo pipefail

# --- configuração ------------------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose"
LAB_BIND_IP="${LAB_BIND_IP:-192.168.22.250}"
BACKBET_PORT="${BACKBET_PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${BACKBET_PORT}}"
BUILD_FLAGS="--no-cache"
CONFIRMED=0
DOWN_AT_END=0
KEYFILE="deploy/mongo/mongodb-keyfile"

PASS=0
FAIL=0
declare -a REPORT=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) CONFIRMED=1 ;;
    --cache) BUILD_FLAGS="" ;;
    --down) DOWN_AT_END=1 ;;
    --base-url) BASE_URL="$2"; EXPLICIT_BASE_URL=1; shift ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done

info() { printf '\n[rebuild-drill] %s\n' "$*"; }
die() { printf '\n[rebuild-drill] ERRO: %s\n' "$*" >&2; exit 1; }
check() { # check <rótulo> <exit-code> <detalhe>
  if [[ "$2" -eq 0 ]]; then
    PASS=$((PASS + 1)); REPORT+=("✓ $1  $3"); printf '   ✓ %s  %s\n' "$1" "$3"
  else
    FAIL=$((FAIL + 1)); REPORT+=("✖ $1  $3"); printf '   ✖ %s  %s\n' "$1" "$3" >&2
  fi
}

# --- pré-requisitos ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker não encontrado no PATH."
docker compose version >/dev/null 2>&1 || die "docker compose (v2) não disponível."
[[ -f .env ]] || die ".env ausente. Copie .env.example e preencha as credenciais (cp .env.example .env)."
[[ -f "$KEYFILE" ]] || {
  info "keyfile do MongoDB ausente; gerando em $KEYFILE (requisito do replica set autenticado)."
  openssl rand -base64 756 > "$KEYFILE"
  chmod 400 "$KEYFILE"
}

info "Ambiente: LAB_BIND_IP=$LAB_BIND_IP BACKBET_PORT=$BACKBET_PORT API=$BASE_URL"
echo "Vai executar: $COMPOSE down -v  →  build ($BUILD_FLAGS)  →  up -d  →  validação"
echo "AVISO: 'down -v' apaga os volumes nomeados deste projeto (dados inclusos)."
if [[ "$CONFIRMED" -ne 1 ]]; then
  read -r -p "Continuar? [s/N] " ans
  [[ "$ans" =~ ^[sSyY]$ ]] || die "abortado pelo usuário."
fi

# --- 1. limpeza total -------------------------------------------------------
info "Passo 1/5 — docker compose down -v (limpeza total)"
set +e
$COMPOSE down -v
check "down -v" $? "stack derrubada com volumes"

# --- 2. build sem cache -----------------------------------------------------
info "Passo 2/5 — docker compose build $BUILD_FLAGS"
$COMPOSE build $BUILD_FLAGS
check "build da imagem" $? "imagem construída do zero"

# --- 3. subir tudo ----------------------------------------------------------
info "Passo 3/5 — docker compose up -d"
$COMPOSE up -d
check "up -d" $? "containers iniciados"
set -e

# Porta efetivamente publicada (o .env pode usar BACKBET_PORT != 3000).
# Só sobrescreve BASE_URL se o usuário não passou --base-url explicitamente.
PUBLISHED="$($COMPOSE port backbet 3000 2>/dev/null | head -1 || true)"
if [[ -n "$PUBLISHED" && -z "${EXPLICIT_BASE_URL:-}" ]]; then
  PUBLISHED_PORT="${PUBLISHED##*:}"
  BASE_URL="http://127.0.0.1:${PUBLISHED_PORT}"
  info "API publicada em ${PUBLISHED} -> BASE_URL=${BASE_URL}"
fi

# --- 4. estado dos containers ------------------------------------------------
info "Passo 4/5 — docker compose ps (aguardando health)"
$COMPOSE ps

# Poll: aguarda /readiness pronto (backbet healthy) + workers Up/running.
# Timeout 180s.
WAITED=0
while [[ $WAITED -lt 180 ]]; do
  ps_lines="$($COMPOSE ps --format '{{.Service}}\t{{.State}}' 2>/dev/null)"
  ready_ok="$(curl -sf --max-time 3 "${BASE_URL}/readiness" >/dev/null 2>&1 && echo yes || echo no)"
  if [[ "$ready_ok" = yes ]] \
    && printf '%s\n' "$ps_lines" | grep -qE '^withdrawal-worker\t(running|Up)$' \
    && printf '%s\n' "$ps_lines" | grep -qE '^contact-worker\t(running|Up)$'; then
    break
  fi
  WAITED=$((WAITED + 5))
  sleep 5
done
if [[ "$ready_ok" != yes ]]; then
  info "Timeout ou health parcial — inspecione a seguir (docker compose ps / logs)."
fi
$COMPOSE ps

# --- 5. validações -----------------------------------------------------------
info "Passo 5/5 — validação de saúde (API, Mongo, Redis, workers)"

# 5.1 /health
HEALTH=$(curl -sf --max-time 10 "${BASE_URL}/health" 2>/dev/null || echo '{}')
check "GET /health (HTTP)" $? "status=$(printf '%s' "$HEALTH" | jq -r '.status // "n/a"' 2>/dev/null)"
if printf '%s' "$HEALTH" | jq -e '.status == "healthy"' >/dev/null 2>&1; then
  check "health = healthy" 0 "status=healthy"
else
  check "health = healthy" 1 "status=$(printf '%s' "$HEALTH" | jq -r '.status // "n/a"' 2>/dev/null) (esperado healthy)"
fi

# 5.2 /readiness (mongo + redis)
READY=$(curl -sf --max-time 10 "${BASE_URL}/readiness" 2>/dev/null || echo '{}')
check "GET /readiness (HTTP)" $? "ready=$(printf '%s' "$READY" | jq -r '.ready // "n/a"' 2>/dev/null)"
if printf '%s' "$READY" | jq -e '.ready == true' >/dev/null 2>&1; then
  check "readiness.ready = true" 0 ""
else
  check "readiness.ready = true" 1 "ready não é true"
fi

# 5.3 Mongo e Redis no /readiness
if printf '%s' "$READY" | jq -e '.checks.mongo.status == "up"' >/dev/null 2>&1; then
  check "mongo up (readiness)" 0 "latency=$(printf '%s' "$READY" | jq -r '.checks.mongo.latencyMs // "n/a"' 2>/dev/null)ms"
else
  check "mongo up (readiness)" 1 "checks.mongo=$(printf '%s' "$READY" | jq -c '.checks.mongo // {}' 2>/dev/null)"
fi
if printf '%s' "$READY" | jq -e '.checks.redis.status == "up"' >/dev/null 2>&1; then
  check "redis up (readiness)" 0 "latency=$(printf '%s' "$READY" | jq -r '.checks.redis.latencyMs // "n/a"' 2>/dev/null)ms"
else
  check "redis up (readiness)" 1 "checks.redis=$(printf '%s' "$READY" | jq -c '.checks.redis // {}' 2>/dev/null)"
fi

# 5.4 containers do compose (mongodb, redis, backbet healthy; workers Up)
ps_state="$($COMPOSE ps --format '{{.Service}}|{{.Health}}|{{.State}}' 2>/dev/null)"
for svc in mongodb redis backbet; do
  line="$(printf '%s\n' "$ps_state" | awk -F'|' -v s="$svc" '$1==s{print}')"
  if printf '%s\n' "$line" | grep -q '|healthy|'; then
    check "$svc healthy" 0 "$(printf '%s\n' "$line" | awk -F'|' '{print "health=" $2 " state=" $3}')"
  else
    check "$svc healthy" 1 "ps=${line:-sem linha}"
  fi
done
for svc in withdrawal-worker contact-worker; do
  line="$(printf '%s\n' "$ps_state" | awk -F'|' -v s="$svc" '$1==s{print}')"
  state="$(printf '%s\n' "$line" | awk -F'|' '{print $3}')"
  if [[ "$state" = "Up" || "$state" = "running" ]]; then
    check "$svc running" 0 "state=$state"
  else
    check "$svc running" 1 "ps=${line:-sem linha}"
  fi
done

# 5.5 workers: log de inicialização (o worker imprime "Starting ... worker..."
# só depois de conectar ao Mongo — aguarda o padrão com retry curto).
for svc in withdrawal-worker contact-worker; do
  boot_ok=0
  for _ in $(seq 1 6); do
    if $COMPOSE logs --no-color "$svc" 2>/dev/null | grep -q 'Starting .* worker'; then
      boot_ok=1
      break
    fi
    sleep 2
  done
  if [[ "$boot_ok" -eq 1 ]]; then
    check "$svc log de boot" 0 "mensagem de inicialização presente nos logs"
  else
    check "$svc log de boot" 1 "log de boot não encontrado (docker compose logs $svc)"
  fi
done

# --- resumo -----------------------------------------------------------------
echo
printf 'REBUILD DRILL: %d ok · %d falhas\n' "$PASS" "$FAIL"
for line in "${REPORT[@]}"; do printf '  %s\n' "$line"; done

if [[ $FAIL -gt 0 ]]; then
  info "Falhas detectadas — inspecione: docker compose ps && docker compose logs --tail=50 backbet"
fi

# --- teardown opcional (CI) --------------------------------------------------
if [[ "$DOWN_AT_END" -eq 1 ]]; then
  info "Encerrando stack (--down)..."
  $COMPOSE down
fi

[[ $FAIL -eq 0 ]] || exit 1