# NodePaaS

[![CI](https://github.com/yepyaeaung13/nodejs-paas/actions/workflows/ci.yml/badge.svg)](https://github.com/yepyaeaung13/nodejs-paas/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yepyaeaung13/nodejs-paas/actions/workflows/codeql.yml/badge.svg)](https://github.com/yepyaeaung13/nodejs-paas/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, Docker-free PaaS for deploying Node.js apps on a single Linux VPS. Push to a git remote, NodePaaS builds the app, runs it under systemd, and routes a domain to it through Caddy. It also provisions a database per app.

Built for 512 MB-2 GB servers. No Kubernetes, no Docker daemon, no container overhead.

> **Project status:** early-stage and single-operator. NodePaaS is not a
> container, VM, or security sandbox. Do not deploy untrusted code. See
> [SECURITY.md](SECURITY.md) for the threat model.

## What it does

- Git-push deploys from `main` or `master`
- Isolated Linux users and systemd services per app
- Optional `MemoryMax` limits per app
- Caddy reverse proxy with automatic HTTPS
- SQLite, PostgreSQL, or MySQL database per app
- Persistent shared directory per app
- Environment variable editor
- Live deployment logs and runtime logs over SSE
- SSH public-key management
- Small built-in dashboard
- Mock mode for development on Windows/macOS

## Architecture

```text
Browser --> Caddy (80/443) --> NodePaaS dashboard :3000
                                  |
                                  +-- SQLite control DB /var/lib/paas/paas.db
                                  +-- bare git repos /var/lib/paas/repos
                                  +-- app releases /var/lib/paas/apps
                                  +-- systemd units paas-<app>.service

Git SSH --> paas-git-hook --> git-receive-pack --> post-receive hook
                                                       |
                                                       +--> POST /api/internal/deploy/<app>

Domain --> Caddy --> 127.0.0.1:<app port>
```

The control plane runs as root because it creates system users, writes systemd units, and runs `systemctl`. Generated app services run as unprivileged `app_<name>` users with systemd hardening options.

## Requirements

- Linux with systemd (Debian 12/Ubuntu 22.04+ recommended)
- Root access
- Node.js 22.5+ (the installer installs it if needed)
- Git, curl, tar
- Caddy (the installer installs it)
- A domain name pointed at the server for HTTPS
- Optional: PostgreSQL and/or MySQL packages

## Install

```bash
git clone https://github.com/yepyaeaung13/nodejs-paas.git
cd nodejs-paas
sudo bash scripts/install.sh --ssh-host git.example.com
```

Or with TLS for the dashboard:

```bash
sudo bash scripts/install.sh \
  --ssh-host git.example.com \
  --dashboard-domain paas.example.com
```

Optional database engines:

```bash
sudo bash scripts/install.sh \
  --ssh-host git.example.com \
  --with-postgres \
  --with-mysql
```

The installer:

1. Installs Node.js 22.5+, Caddy, git, build tools, and optional databases.
2. Creates the `paas` SSH user and `/usr/local/bin/paas-git-hook`.
3. Copies the app to `/opt/nodepaaS`, builds it, and installs a production-only `node_modules`.
4. Writes `/etc/paas/paas.env` and `/etc/systemd/system/paas.service`.
5. Adds an import for `/etc/paas/apps.caddy` to the Caddyfile (backing up any existing file).
6. Starts NodePaaS and Caddy.

Open the dashboard URL printed by the installer and create the first admin account.

### Firewall

Only these ports need to be public:

- `22/tcp` for git over SSH
- `80/tcp` and `443/tcp` for Caddy

The control plane listens on `3000`, and apps listen on `3100-3999`. Keep those private. With UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

If you use the dashboard over plain HTTP on port 3000, either restrict it with a firewall or put it behind a Caddy domain.

### DNS and TLS

For an app domain, point an `A`/`AAAA` record at the server before adding the domain in the app settings. Caddy obtains and renews the certificate automatically. A domain already used by the dashboard or another app cannot be assigned to an app.

For the dashboard, use `--dashboard-domain` or set `PAAS_DASHBOARD_DOMAIN` in `/etc/paas/paas.env` and restart:

```bash
sudo systemctl restart paas
```

## First deployment

1. Open **SSH keys** in the dashboard and add your public key:

   ```bash
   ssh-keygen -t ed25519 -C "you@example.com"
   cat ~/.ssh/id_ed25519.pub
   ```

2. Create an app in the dashboard.
3. Add the git remote and push:

   ```bash
   git remote add paas paas@git.example.com:my-app.git
   git push paas main
   ```

4. Watch the deployment in the app's **Deployments** tab.
5. If you configured a domain, open `https://your-domain`.

The app must listen on `process.env.PORT` (NodePaaS sets it) and should bind to `0.0.0.0` or `127.0.0.1`.

### Start commands

NodePaaS auto-detects:

- **Install:** `npm ci` when `package-lock.json` exists, `pnpm install` for `pnpm-lock.yaml`, `yarn install` for `yarn.lock`, otherwise `npm install`
- **Build:** `npm run build` when that script exists
- **Start:** `npm start` when that script exists, otherwise `server.js`, `index.js`, `app.js`, `dist/server.js`, `dist/index.js`, or `build/index.js`

Override any of them in the app's **Settings** tab. Command and memory changes take effect on the next deployment.

### Deployments and rollback

Deployments run one at a time per app. If a deployment fails, NodePaaS switches back to the previous release and restores that release's start command and systemd unit. A failed first deployment removes the half-created service and release link. Deployment logs are retained in the control database and capped at 1 MiB per deployment; the dashboard keeps the most recent live output.

## Databases

One database per app. Credentials are written to the app's environment file and injected at process start:

- `DATABASE_URL` is always set.
- For SQLite, `SQLITE_PATH` points at the database file.

SQLite files live in:

```
/var/lib/paas/apps/<app>/shared/data.sqlite
```

PostgreSQL and MySQL databases are created on the same server with generated credentials. Restart the app after creating or deleting a database. Deleting an app also deletes its database; if the database engine cannot be reached, the deletion fails instead of leaving orphaned data. Database creation/deletion is blocked while provisioning is in progress.

Database engines are only offered when the client/server tools are installed. Run the installer with `--with-postgres` or `--with-mysql`, or install them manually.

## App directories

```
/var/lib/paas/apps/<app>/
  current -> releases/<timestamp>-<sha>/
  releases/
  control/
    app.env
    start.sh
  shared/              (HOME; writable by the app)
    data.sqlite        (if SQLite)
  .npm/
  .tmp/
```

`shared/` is the persistent directory and the app's `HOME`. Files written there survive deployments. `control/` holds root-managed environment and start scripts; the app can read but not modify them. Releases are pruned to the three most recent versions.

## Operations

```bash
# Control plane
systemctl status paas
journalctl -u paas -f
systemctl restart paas

# A single app
systemctl status paas-my-app
journalctl -u paas-my-app -f

# Caddy
systemctl status caddy
journalctl -u caddy -f
```

### Update NodePaaS

Copy the new source over the install and rerun the installer:

```bash
sudo bash scripts/install.sh --ssh-host git.example.com
```

The installer rebuilds the control plane and restarts the `paas` service. App repositories and databases are not touched.

### Backup

For a consistent backup, stop the control plane and app services first:

```bash
sudo systemctl stop paas
sudo systemctl stop 'paas-*.service' || true
sudo tar -czf nodepaas-backup-$(date +%F).tar.gz /var/lib/paas /etc/paas
sudo systemctl start paas
sudo systemctl start 'paas-*.service' || true
```

`/var/lib/paas` contains the control database, git repositories, releases, app data, and SQLite files. `/etc/paas` contains secrets and the generated Caddy config. Back up PostgreSQL/MySQL separately with `pg_dump`/`mysqldump`.

### Uninstall

```bash
sudo systemctl disable --now paas caddy
sudo systemctl disable --now 'paas-*.service' || true
sudo rm -f /etc/systemd/system/paas.service /etc/systemd/system/paas-*.service
sudo rm -rf /opt/nodepaaS /etc/paas
# App users and data:
#   userdel -r app_<name>
sudo rm -rf /var/lib/paas
```

Remove the `Caddyfile` import and the `paas` user if you no longer need them. This permanently deletes app data.

## Local development

On Windows or macOS, NodePaaS automatically runs in mock mode. On Linux, force it with `PAAS_MOCK=1`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Mock mode still creates the control database, git repositories, releases, and app files, but it does not run `useradd`, `npm`, `systemctl`, Caddy, or `journalctl`. Mock deployments succeed without starting a real process.

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Configuration

Environment variables are read from the process or an optional `.env` file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAAS_HOST` | `0.0.0.0` | Control plane bind address |
| `PAAS_PORT` | `3000` | Dashboard/API port |
| `PAAS_DATA_DIR` | `/var/lib/paas` | Control DB, repos, apps, logs |
| `PAAS_PUBLIC_URL` | `http://localhost:3000` | Displayed dashboard URL |
| `PAAS_HOOK_URL` | `http://127.0.0.1:<port>` | URL used by git hooks |
| `PAAS_APP_PORT_START` | `3100` | First app port |
| `PAAS_APP_PORT_END` | `3999` | Last app port |
| `PAAS_SSH_USER` | `paas` | SSH user for git deploys |
| `PAAS_SSH_HOST` | request host | Host shown in git remotes |
| `PAAS_AUTHORIZED_KEYS` | `/home/paas/.ssh/authorized_keys` | Managed authorized keys |
| `PAAS_INTERNAL_TOKEN_FILE` | `/etc/paas/internal.token` | Git-hook bearer token |
| `PAAS_CADDY_CONFIG` | `/etc/paas/apps.caddy` | Generated Caddy site config |
| `PAAS_CADDY_SERVICE` | `caddy` | systemd unit for Caddy |
| `PAAS_DASHBOARD_DOMAIN` | unset | Optional Caddy domain for the dashboard |
| `PAAS_TRUST_PROXY` | `127.0.0.1` | Trusted proxy addresses |
| `PAAS_SESSION_SECRET` | generated file | Session signing secret |
| `PAAS_INTERNAL_TOKEN` | generated file | Internal deploy token |
| `PAAS_ADMIN_USER` / `PAAS_ADMIN_PASSWORD` | unset | Optional bootstrap admin |
| `PAAS_MOCK` | auto on non-Linux | Simulate privileged commands |

## Security notes

See [SECURITY.md](SECURITY.md) for the full threat model and private
vulnerability-reporting process.

- This is a single-operator PaaS. Every SSH key added to the dashboard can push to every app repository. There are no per-app deploy permissions.
- The control plane runs as root. Generated app services run as unprivileged users with systemd hardening, but this is not a container or a VM. Do not run untrusted code.
- Secrets are stored on disk: the control database is mode `0600`, app environment files are `0640` for the app group, and the internal token is `0640` for the `paas` group.
- The dashboard is protected by a signed HTTP-only session cookie with `SameSite=Lax`. Use HTTPS for the dashboard.
- Login attempts are rate-limited per client IP. The default trusted proxy is loopback, so configure `PAAS_TRUST_PROXY` if Caddy runs elsewhere.
- App ports are not firewalled by NodePaaS. Restrict `3100-3999` with your firewall.
- The installer writes a Caddyfile that imports NodePaaS-managed config. If you already had a Caddyfile, a timestamped backup is created.

## Troubleshooting

**Deployment says no deployable commit**

Push to `main` or `master` first, or use the Deploy button after a push.

**App fails to start**

Check the deployment log and `journalctl -u paas-<app> -f`. The app must open `PORT` within 45 seconds. If a previous release was healthy, NodePaaS rolls back automatically.

**Git push does nothing**

```bash
sudo tail -f /var/log/auth.log
sudo -u paas test -r /etc/paas/internal.token && echo token-readable
curl -fsS http://127.0.0.1:3000/api/health
```

The `paas` user needs read access to `/etc/paas/internal.token`, and the repository must exist. Add the key in the dashboard, not directly to `authorized_keys` (the file is regenerated).

**Caddy does not get a certificate**

Confirm DNS points at the server and ports 80/443 are reachable. Check `journalctl -u caddy -n 100 --no-pager`.

**SQLite permission errors**

The database file belongs to the app user and lives in `shared/`. Do not replace it with a root-owned file. Use `chown app_<name>:app_<name>` after restoring a backup.

**Port collision**

App ports are allocated from `PAAS_APP_PORT_START` to `PAAS_APP_PORT_END`. Change the range in `/etc/paas/paas.env` and restart, or delete unused apps.

## Project layout

```
src/
  config.ts             paths, ports, secrets, mock detection
  db.ts                 control SQLite schema and queries
  auth.ts               signed sessions and login throttling
  server.ts             Fastify setup and middleware
  lib/                  command, filesystem, HTTP, password, validation
  services/             apps, Caddy, databases, deployer, git, logs, SSH, systemd
  routes/               auth, apps, keys, system, internal deploy hook
public/                 dashboard HTML/CSS/JS
scripts/
  install.sh            Linux installer
  paas-git-hook         SSH forced-command git receive wrapper
```

## Limitations

- Single server only; no clustering or scheduling.
- One git remote per app; deploy branch is `main` or `master`.
- One database per app.
- No rollback button in the UI (failed deploys roll back automatically; releases are kept on disk).
- No automatic PostgreSQL/MySQL backups.
- No per-app SSH deploy keys.
- No Windows or macOS production mode; use mock mode there.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security
issues should be reported privately as described in [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
