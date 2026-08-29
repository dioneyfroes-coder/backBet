#!/usr/bin/env bash
# =============================================================================
# BackBet — Endurecimento do servidor (Fase 27 — Segurança operacional)
#
# Aplica o checklist mínimo ANTES do primeiro deploy em um Ubuntu server:
#   - SSH apenas por chave (root desabilitado, senha desabilitada)
#   - firewall UFW (default deny; 22/80/443; 27017 só para o server01 em 'db')
#   - updates automáticos de segurança (unattended-upgrades)
#   - fail2ban (proteção extra ao SSH)
#
# Uso (como root ou sudo):
#   HOST_ROLE=web  bash deploy/harden-server.sh     # server01 (api + proxy)
#   HOST_ROLE=db   SERVER01_IP=192.168.0.10 bash deploy/harden-server.sh  # server02 (mongo)
#
# SEGURANÇA: o script só desabilita senha SSH se encontrar UMA chave pública
# instalada em algum usuário com shell. Se nenhuma chave existir, ele mostra
# o passo de instalação e NÃO aplica o bloqueio — evita travar o acesso.
# =============================================================================
set -euo pipefail

HOST_ROLE="${HOST_ROLE:-web}"                     # 'web' (server01) ou 'db' (server02)
SERVER01_IP="${SERVER01_IP:-}"                    # IP do server01 (obrigatório para 'db')
SSH_ADMIN_USER="${SSH_ADMIN_USER:-$(logname 2>/dev/null || echo root)}"

info() { printf '\n[backbet-harden] %s\n' "$*"; }
die() { printf '\n[backbet-harden] ERRO: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "execute como root: sudo bash deploy/harden-server.sh"
command -v ufw >/dev/null 2>&1 || die "UFW não instalado (apt install ufw)."
command -v openssh-server >/dev/null 2>&1 || info "openssh-server ausente; pulando bloqueios SSH?"

# ---------------------------------------------------------------------------
# 1) SSH: exigir chave pública, desabilitar root e senha
# ---------------------------------------------------------------------------
have_admin_key() {
  [[ "$SSH_ADMIN_USER" != "root" ]] && sudo -u "$SSH_ADMIN_USER" test -s ~/.ssh/authorized_keys 2>/dev/null && return 0
  grep -qs '^[^#].*$' /root/.ssh/authorized_keys 2>/dev/null && return 0
  for u in /home/*/.ssh/authorized_keys; do
    [[ -e "$u" && -s "$u" ]] && return 0
  done
  return 1
}

SSHD_CONF='/etc/ssh/sshd_config.d/99-backbet-hardening.conf'
if have_admin_key; then
  info "Chave pública detectada -> aplicando regras de hardening no SSH."
  cat > "$SSHD_CONF" <<'EOF'
# BackBet hardening (Fase 27)
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
UsePAM yes
EOF
  systemctl reload ssh 2>/dev/null || service ssh reload 2>/dev/null || true
else
  info "NENHUMA chave pública encontrada. Não vou desabilitar senha (evitaria acesso)."
  info '  Instale sua chave ANTES de rodar de novo, ex.:'
  info '  ssh-copy-id <seu-usuario>@<ip-do-server>  (na sua máquina local)'
  info "  Depois re-execute: HOST_ROLE=$HOST_ROLE bash deploy/harden-server.sh"
fi

# ---------------------------------------------------------------------------
# 2) Firewall UFW
# ---------------------------------------------------------------------------
info "Configurando UFW..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
if [[ "$HOST_ROLE" == "web" ]]; then
  # API quando estiver SEM o proxy (Fase 25) — expor só na LAN/loopback se possível.
  true
elif [[ "$HOST_ROLE" == "db" ]]; then
  [[ -n "$SERVER01_IP" ]] || die "HOST_ROLE=db exige SERVER01_IP=<ip-do-server01>."
  info "MongoDB: 27017 liberado SOMENTE para $SERVER01_IP"
  ufw allow from "$SERVER01_IP" to any port 27017 proto tcp >/dev/null
else
  die "HOST_ROLE inválida: $HOST_ROLE (use 'web' ou 'db')."
fi
ufw --force enable >/dev/null
ufw status verbose

# ---------------------------------------------------------------------------
# 3) Updates automáticos de segurança
# ---------------------------------------------------------------------------
if [[ "$HOST_ROLE" == "web" ]]; then
  info "Instalando e habilitando unattended-upgrades..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq unattended-upgrades >/dev/null
  dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null || true
  systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# 4) fail2ban (opcional)
# ---------------------------------------------------------------------------
if command -v fail2ban-server >/dev/null 2>&1; then
  info "fail2ban já presente."
else
  info "fail2ban não instalado (opcional). Instale com: apt-get install fail2ban"
fi

info "Hardening aplicado. Verifique a conectividade em NOVA sessão antes de fechar esta."