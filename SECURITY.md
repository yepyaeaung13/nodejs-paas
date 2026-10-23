# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Older | No |

NodePaaS is early-stage software. Security fixes are applied to the latest
release only.

## Reporting a vulnerability

Do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include affected versions, reproduction steps, impact, and any suggested fix.

You can expect an initial response within 7 days. Please allow time for a fix
and release before public disclosure.

## Threat model

NodePaaS is a single-operator deployment tool. It is not a multi-tenant
sandbox.

- The control plane runs as **root** because it creates Linux users, writes
  systemd units, manages Caddy configuration, and provisions databases.
- Applications run as unprivileged `app_<name>` users with systemd hardening,
  but they share the host kernel and filesystem. There is no container or VM
  boundary.
- Every SSH key added to the dashboard can push to every application
  repository. NodePaaS does not provide per-app deploy keys.
- Application environment files contain secrets and are readable by the
  application's group.
- App ports `3100-3999` are not blocked by NodePaaS. Operators must restrict
  them with a firewall.
- The dashboard must be served over HTTPS. The session cookie is HTTP-only and
  `SameSite=Lax`, but TLS is the operator's responsibility.
- GitHub App credentials are privileged deployment credentials. The private key
  is root-readable, can mint installation tokens, and must never be committed or
  copied between NodePaaS instances.
- GitHub webhooks authenticate with an HMAC over the raw request body. A proxy
  that rewrites or buffers the body incorrectly can break verification.
- GitHub installation tokens are scoped to the repositories selected during
  installation, held in memory, and never written to app environments.

Do not run untrusted or hostile code with NodePaaS. Only deploy applications
that you would be willing to run directly on the host.

## In scope

- Authentication and session handling
- Command injection or path traversal in the control plane
- Privilege escalation from an application user to root or another application
- Git hook, GitHub webhook, deployment pipeline, and internal API authorization
- GitHub App private-key handling, installation-token scope, and webhook signature verification
- Caddy configuration injection
- Secret exposure through logs, the API, or generated files
- Installer and file-permission issues

## Out of scope

- Code execution or data access caused by an application's own vulnerabilities
- Denial of service against the host by an application
- Attacks requiring root access to the server before exploitation
- Missing hardening that does not cross a privilege boundary
- Vulnerabilities in unsupported operating systems or modified installs

## Operator guidance

- Keep the control plane and host packages updated.
- Use SSH keys, not passwords, for server access.
- Restrict the dashboard to trusted networks where possible.
- Back up the control database and application data before upgrades.
- Review application code before deploying it.
- Store the GitHub App private key outside the repository with mode `0600`, and
  use a distinct GitHub App and webhook secret per NodePaaS instance.
- Revoke the GitHub App installation and rotate its private key and webhook
  secret if either may have been exposed.
- Never expose the internal API or app ports directly to the internet.
