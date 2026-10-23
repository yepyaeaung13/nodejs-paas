#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_HOST="localhost"
ENABLE_SSH=1
INSTALL_ARGS=()

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/install-wsl.sh [options]

Local WSL installation of NodePaaS. Uses http://localhost:3000 and configures
git pushes from inside WSL with paas@localhost.

Options:
  --ssh-host HOST     Host used in displayed git remotes (default: localhost)
  --no-ssh            Do not enable the WSL OpenSSH server
  --with-postgres     Pass through to the main installer
  --with-mysql        Pass through to the main installer
  --help              Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ssh-host)
      SSH_HOST="${2:-}"
      if [ -z "$SSH_HOST" ]; then
        echo "--ssh-host requires a value." >&2
        exit 1
      fi
      shift 2
      ;;
    --no-ssh)
      ENABLE_SSH=0
      shift
      ;;
    --with-postgres|--with-mysql)
      INSTALL_ARGS+=("$1")
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
  echo "Run this installer as root: sudo bash scripts/install-wsl.sh" >&2
  exit 1
fi
if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer must run inside WSL." >&2
  exit 1
fi
if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "Warning: this does not look like WSL. Continuing with the Linux installer." >&2
fi
if [ ! -d /run/systemd/system ]; then
  cat >&2 <<'EOF'
systemd is not running in this WSL distribution.

Add these lines to /etc/wsl.conf:

  [boot]
  systemd=true

Then run this from PowerShell:

  wsl --shutdown

Reopen WSL and run the installer again.
EOF
  exit 1
fi

echo "==> Installing NodePaaS for local WSL use"
bash "$SCRIPT_DIR/install.sh" --ssh-host "$SSH_HOST" "${INSTALL_ARGS[@]}"

if [ "$ENABLE_SSH" -eq 1 ]; then
  echo "==> Enabling OpenSSH for local git pushes"
  if ! systemctl enable --now ssh 2>/dev/null && ! systemctl enable --now sshd 2>/dev/null; then
    echo "Warning: could not enable sshd. Install it with:" >&2
    echo "  sudo apt-get install -y openssh-server" >&2
    echo "  sudo systemctl enable --now ssh" >&2
  fi
fi

WSL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "NodePaaS WSL install is ready."
echo "  Dashboard:  http://localhost:3000"
if [ -n "$WSL_IP" ] && [ "$WSL_IP" != "127.0.0.1" ]; then
  echo "  WSL IP URL: http://$WSL_IP:3000"
fi
echo "  Health:     curl http://127.0.0.1:3000/api/health"
echo
echo "Local git deploys (from inside WSL):"
echo "  ssh-keygen -t ed25519 -C \"you@example.com\""
echo "  Add ~/.ssh/id_ed25519.pub in the dashboard's SSH keys page."
echo "  git remote add paas $SSH_HOST:<app>.git"
echo "  git push paas main"
echo
echo "GitHub webhooks need a public HTTPS URL; localhost is not reachable from GitHub."
