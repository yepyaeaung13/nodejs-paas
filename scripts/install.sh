#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/nodepaaS"
DATA_DIR="/var/lib/paas"
CONFIG_DIR="/etc/paas"
SSH_USER="paas"
SSH_HOST="${PAAS_SSH_HOST:-}"
DASHBOARD_DOMAIN="${PAAS_DASHBOARD_DOMAIN:-}"
WITH_POSTGRES=0
WITH_MYSQL=0

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/install.sh [options]

Options:
  --ssh-host HOST          Hostname or IP clients use for git pushes (default: hostname -f)
  --dashboard-domain NAME  Optional domain for the dashboard (Caddy will issue TLS)
  --with-postgres          Install PostgreSQL and enable it
  --with-mysql             Install MariaDB/MySQL and enable it
  --help                   Show this help

Environment overrides:
  PAAS_SSH_HOST, PAAS_DASHBOARD_DOMAIN
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ssh-host)
      SSH_HOST="${2:-}"
      shift 2
      ;;
    --dashboard-domain)
      DASHBOARD_DOMAIN="${2:-}"
      shift 2
      ;;
    --with-postgres)
      WITH_POSTGRES=1
      shift
      ;;
    --with-mysql)
      WITH_MYSQL=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root (sudo bash scripts/install.sh)." >&2
  exit 1
fi
if [ "$(uname -s)" != "Linux" ]; then
  echo "The installer only supports Linux." >&2
  exit 1
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required." >&2
  exit 1
fi
if [ -z "$SSH_HOST" ]; then
  SSH_HOST="$(hostname -f 2>/dev/null || hostname)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git build-essential python3 tar rsync openssh-server \
  debian-keyring debian-archive-keyring apt-transport-https gnupg

node_supported() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)' >/dev/null 2>&1
}

if ! node_supported; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js was not found after installation." >&2
  exit 1
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Installing Caddy"
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

if [ "$WITH_POSTGRES" -eq 1 ]; then
  echo "==> Installing PostgreSQL"
  apt-get install -y postgresql
  systemctl enable --now postgresql
fi

if [ "$WITH_MYSQL" -eq 1 ]; then
  echo "==> Installing MariaDB/MySQL"
  apt-get install -y default-mysql-server
  systemctl enable --now mariadb 2>/dev/null || systemctl enable --now mysql
fi

echo "==> Creating service users and directories"
if ! id -u "$SSH_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash --user-group "$SSH_USER"
fi
install -d -m 0700 -o "$SSH_USER" -g "$SSH_USER" "/home/$SSH_USER/.ssh"
install -d -m 0755 -o root -g root "$CONFIG_DIR"
install -d -m 0711 -o root -g root "$DATA_DIR"
install -d -m 0711 -o root -g root "$DATA_DIR/apps"
install -d -m 0711 -o root -g root "$DATA_DIR/repos"

if [ "$PROJECT_DIR" != "$APP_DIR" ]; then
  echo "==> Copying NodePaaS to $APP_DIR"
  install -d -m 0755 -o root -g root "$APP_DIR"
  systemctl stop paas.service 2>/dev/null || true
  rsync -a --delete \
    --exclude node_modules \
    --exclude .git \
    --exclude '.data*' \
    --exclude .env \
    --exclude dist \
    "$PROJECT_DIR/" "$APP_DIR/"
fi

echo "==> Building NodePaaS"
systemctl stop paas.service 2>/dev/null || true
cd "$APP_DIR"
npm ci --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev

echo "==> Installing git SSH wrapper"
install -m 0755 -o root -g root "$PROJECT_DIR/scripts/paas-git-hook" /usr/local/bin/paas-git-hook

echo "==> Writing configuration"
if [ -n "$DASHBOARD_DOMAIN" ]; then
  PUBLIC_URL="https://$DASHBOARD_DOMAIN"
else
  PUBLIC_URL="http://$SSH_HOST:3000"
fi
cat > "$CONFIG_DIR/paas.env" <<EOF
PAAS_HOST=0.0.0.0
PAAS_PORT=3000
PAAS_DATA_DIR=$DATA_DIR
PAAS_PUBLIC_URL=$PUBLIC_URL
PAAS_SSH_USER=$SSH_USER
PAAS_SSH_HOST=$SSH_HOST
PAAS_INTERNAL_TOKEN_FILE=$CONFIG_DIR/internal.token
PAAS_AUTHORIZED_KEYS=/home/$SSH_USER/.ssh/authorized_keys
PAAS_CADDY_CONFIG=$CONFIG_DIR/apps.caddy
PAAS_CADDY_SERVICE=caddy
PAAS_TRUST_PROXY=127.0.0.1
NODE_ENV=production
EOF
if [ -n "$DASHBOARD_DOMAIN" ]; then
  echo "PAAS_DASHBOARD_DOMAIN=$DASHBOARD_DOMAIN" >> "$CONFIG_DIR/paas.env"
fi
chmod 0640 "$CONFIG_DIR/paas.env"
chown root:root "$CONFIG_DIR/paas.env"

echo "==> Installing systemd service"
cat > /etc/systemd/system/paas.service <<EOF
[Unit]
Description=NodePaaS control plane
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=-$CONFIG_DIR/paas.env
ExecStart=$NODE_BIN --disable-warning=ExperimentalWarning dist/index.js
Restart=always
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
SyslogIdentifier=nodepaas
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable paas.service
systemctl restart paas.service

echo "==> Waiting for NodePaaS"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
  echo "NodePaaS did not start. Check: journalctl -u paas -n 100 --no-pager" >&2
  exit 1
fi

echo "==> Configuring Caddy"
if [ ! -f "$CONFIG_DIR/apps.caddy" ]; then
  printf '# Managed by NodePaaS. App site blocks are added here.\n' > "$CONFIG_DIR/apps.caddy"
  chmod 0644 "$CONFIG_DIR/apps.caddy"
  chown root:root "$CONFIG_DIR/apps.caddy"
fi
if [ -f /etc/caddy/Caddyfile ] && grep -Eq "^[[:space:]]*import[[:space:]]+$CONFIG_DIR/apps\.caddy([[:space:]]|$)" /etc/caddy/Caddyfile 2>/dev/null; then
  :
elif [ -f /etc/caddy/Caddyfile ]; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"
  printf '\n# Added by NodePaaS\nimport %s\n' "$CONFIG_DIR/apps.caddy" >> /etc/caddy/Caddyfile
else
  cat > /etc/caddy/Caddyfile <<EOF
{
	admin localhost:2019
}

import $CONFIG_DIR/apps.caddy
EOF
fi
systemctl enable caddy
systemctl restart caddy

if [ -f "$CONFIG_DIR/internal.token" ]; then
  chown root:"$SSH_USER" "$CONFIG_DIR/internal.token"
  chmod 0640 "$CONFIG_DIR/internal.token"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "^Status: active"; then
  echo
  echo "UFW is active. Allow these ports if they are not already open:"
  echo "  ufw allow OpenSSH"
  echo "  ufw allow 80,443/tcp"
fi

echo
echo "NodePaaS is installed."
echo "  Dashboard:   $PUBLIC_URL"
if [ -z "$DASHBOARD_DOMAIN" ]; then
  echo "  Direct URL:  http://$SSH_HOST:3000"
  echo "  For TLS, set PAAS_DASHBOARD_DOMAIN in $CONFIG_DIR/paas.env and restart paas."
fi
echo "  Git remote:  $SSH_USER@$SSH_HOST:<app>.git"
echo "  First visit: open the dashboard and create the admin account."
echo
echo "Useful commands:"
echo "  systemctl status paas"
echo "  journalctl -u paas -f"
echo "  systemctl restart paas"
