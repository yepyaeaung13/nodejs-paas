# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-21

### Added

- Git-push deployments for Node.js applications on a single Linux server
- Per-app systemd services and unprivileged Linux users
- Automatic port allocation and Caddy reverse-proxy configuration
- SQLite, PostgreSQL, and MySQL database provisioning per app
- Persistent shared application directories
- Environment variable and SSH public-key management
- Deployment logs and runtime logs over Server-Sent Events
- Automatic rollback when a deployment fails to start
- Deployment log size limit and release retention
- Mock mode for development on non-Linux systems

### Security

- Caddy domain validation and dashboard-domain protection
- Signed HTTP-only sessions with per-IP login rate limiting
- Restricted permissions for the control database, app environment files, and
  internal deployment token
- systemd hardening for generated application services

[Unreleased]: https://github.com/yepyaeaung13/nodejs-paas/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yepyaeaung13/nodejs-paas/releases/tag/v0.1.0
