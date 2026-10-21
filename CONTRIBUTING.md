# Contributing to NodePaaS

Thanks for helping improve NodePaaS. This project is a small, security-sensitive
deployment tool, so changes are reviewed with an emphasis on correctness and
privilege boundaries.

## Development setup

Requirements:

- Node.js 22.5 or newer
- npm
- Linux with systemd for production-mode testing

Install and run locally:

```bash
npm ci
npm run dev
```

The dashboard runs at `http://localhost:3000`.

On Windows and macOS, NodePaaS automatically uses mock mode. Mock mode does not
create users, write systemd units, start Caddy, or run real application
processes.

## Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm test
```

The test command builds the project and runs the compiled test suite.

For shell changes:

```bash
bash -n scripts/install.sh
bash -n scripts/paas-git-hook
shellcheck scripts/install.sh scripts/paas-git-hook
```

## Linux integration testing

Production behavior depends on systemd, Linux users, file permissions, and
Caddy. Test privileged changes in a disposable VM or a dedicated test server.

Do not run the installer on a machine that already hosts production services.
Use a snapshot or a fresh VM so you can roll back safely.

Useful checks:

```bash
sudo systemctl status paas
sudo journalctl -u paas -n 100 --no-pager
sudo journalctl -u paas-<app> -n 100 --no-pager
```

## Code guidelines

- Use TypeScript and keep the project strict-mode clean.
- Keep the control plane small and dependency-light.
- Validate all user input before it reaches shell commands, paths, systemd,
  Caddy, or SQL.
- Prefer argument arrays over shell strings when running external commands.
- Preserve the distinction between control-plane privileges and application
  privileges.
- Do not log secrets, tokens, passwords, private keys, or full environment
  files.
- Add tests for validation, authorization, and failure paths.
- Avoid adding a database, queue, or framework unless the benefit is clear.

## Pull requests

Include:

- What changed and why
- Security impact, especially for privileged operations
- How you tested it
- Any migration or upgrade notes
- Screenshots for dashboard changes

Keep pull requests focused. Separate refactors from behavior changes when
possible.

## Security issues

Do not open a public issue for a vulnerability. Follow `SECURITY.md` and use
GitHub's private vulnerability reporting.

## License

By contributing, you agree that your contributions are licensed under the MIT
License in `LICENSE`.
