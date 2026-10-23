const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  user: null,
  setupRequired: false,
  apps: [],
  overview: null,
  recent: [],
  stats: null,
  system: null,
  engines: { sqlite: true, postgres: false, mysql: false },
  ssh: null,
  caddyConfig: null,
  app: null,
  deployments: [],
  env: [],
  database: null,
  keys: [],
  github: null,
  githubRepos: null,
  githubBranches: null,
  githubBranchRequest: 0,
  newAppSource: "git",
  activeTab: "deployments",
  showDbUrl: false,
  modalOnClose: null,
  pollTimer: null,
};

const icons = {
  logo: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V5l7 7 7-7v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>`,
  key: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="8" cy="15" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M11 12 20 3m-3 3 2 2m-5 1 2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  server: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="13" width="18" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 7.5h.01M7 16.5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  rocket: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 4c3.5.5 5.5 2.5 6 6-1.5 4.5-5 7-8.5 8.5l-3-3C10 12 12.5 8.5 14 4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9 15-3 3m1-6-3 .5M15 9l-1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-4M4 5v5h5M4 13a8 8 0 0 0 14.8 4M20 19v-5h-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="m7 9 3 3-3 3m6 0h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3Z" stroke="currentColor" stroke-width="1.6"/></svg>`,
  git: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="18" r="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="6" cy="18" r="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M6 8.5v7M8.5 6h4A3.5 3.5 0 0 1 16 9.5V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  github: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 19c-4 1.2-4-2.1-5.5-2.5M15 21v-3.3c0-.9.1-1.3-.4-1.7 2.3-.3 4.7-1.1 4.7-5.1a4 4 0 0 0-1.1-2.8 3.7 3.7 0 0 0-.1-2.8s-.9-.3-3 1.1a10.3 10.3 0 0 0-5.2 0C7.8 4.9 6.9 5.2 6.9 5.2a3.7 3.7 0 0 0-.1 2.8A4 4 0 0 0 5.7 11c0 4 2.4 4.8 4.7 5.1-.5.4-.5.9-.4 1.7V21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 5.5v6c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-6M4.5 11.5v6c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-6" stroke="currentColor" stroke-width="1.8"/></svg>`,
  cpu: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  memory: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 10v4m3-4v4m3-4v4m3-4v4M6 4v3m4-3v3m4-3v3m4-3v3M6 17v3m4-3v3m4-3v3m4-3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 2.8 19.5h18.4L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5m0 2.4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 8V5H5v14h9v-3M10 12h11m-3-3 3 3-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.8"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 16 16M9.5 6.4A9.8 9.8 0 0 1 12 6c5.8 0 9 6 9 6a15 15 0 0 1-3 3.5M6.3 8.1A14.8 14.8 0 0 0 3 12s3.2 6 9 6a9.6 9.6 0 0 0 3.2-.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const icon = (name) => icons[name] ?? "";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function escapeJsonForAttr(value) {
  return esc(JSON.stringify(value));
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body !== undefined && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
    body,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();
  if (!response.ok) {
    const message = payload && typeof payload === "object" ? payload.error : payload;
    throw new ApiError(response.status, message || response.statusText || "Request failed");
  }
  return payload;
}

function toast(message, type = "success") {
  const root = $("#toast-root");
  if (!root) return;
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `${type === "error" ? icon("alert") : icon("check")}<div></div>`;
  node.lastElementChild.textContent = message;
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    node.style.transition = "0.2s ease";
    setTimeout(() => node.remove(), 220);
  }, 4200);
}

function toastError(error) {
  if (error instanceof ApiError && error.status === 401) {
    state.user = null;
    state.app = null;
    stopPolling();
    closeModal();
    renderAuth("login");
    toast("Your session expired. Sign in again.", "error");
    return;
  }
  toast(error instanceof Error ? error.message : String(error), "error");
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function timeAgo(value) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.max(1, Math.round(seconds / 3600))}h ago`;
  if (seconds < 604800) return `${Math.max(1, Math.round(seconds / 86400))}d ago`;
  return formatDate(value);
}

function formatUptime(seconds) {
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const STATUS_LABELS = {
  idle: "Not deployed",
  queued: "Queued",
  building: "Building",
  starting: "Starting",
  running: "Running",
  stopped: "Stopped",
  failed: "Failed",
};

function statusPill(status) {
  const normalized = STATUS_LABELS[status] ? status : "idle";
  return `<span class="pill is-${esc(normalized)}"><span class="dot"></span>${esc(STATUS_LABELS[normalized])}</span>`;
}

function statusDot(status) {
  const cls = status === "running" ? "green" : status === "failed" ? "red" : status === "building" || status === "starting" || status === "queued" ? "amber" : "";
  return `<span class="dot ${cls}"></span>`;
}

function shortSha(sha) {
  return (sha || "").slice(0, 8);
}

function host() {
  return state.ssh?.host || window.location.hostname;
}

function remoteFor(app) {
  if (state.ssh && state.app && state.app.name === app.name) return state.ssh.remote;
  return `${state.ssh?.user || "paas"}@${host()}:${app.name}.git`;
}

function appUrl(app) {
  if (app.domain) return `https://${app.domain}`;
  return `http://${host()}:${app.port}`;
}

function githubRepoUrl(app) {
  if (!app.github_repo_full_name) return "https://github.com";
  return `https://github.com/${app.github_repo_full_name.split("/").map(encodeURIComponent).join("/")}`;
}

function githubBranchUrl(app) {
  if (!app.github_repo_full_name || !app.github_branch) return githubRepoUrl(app);
  return `${githubRepoUrl(app)}/tree/${app.github_branch.split("/").map(encodeURIComponent).join("/")}`;
}

function brandBlock() {
  return `<div class="brand"><div class="brand-mark">${icon("logo")}</div><div><div class="brand-name">NodePaaS</div><div class="brand-tag">Node deployments</div></div></div>`;
}

function renderLoading() {
  const root = $("#app");
  root.innerHTML = `<div class="loading-screen"><div><div class="spinner"></div>Loading NodePaaS</div></div>`;
}

function renderFatal(error) {
  $("#app").innerHTML = `<div class="auth-screen"><div class="card" style="width:min(520px,100%)"><div class="card-body"><h2 class="page-title" style="font-size:20px">Could not load NodePaaS</h2><p class="page-sub">${esc(error instanceof Error ? error.message : String(error))}</p><div class="form-actions" style="justify-content:flex-start;margin-top:18px"><button class="btn btn-primary" data-action="reload">Try again</button></div></div></div></div>`;
}

function renderAuth(mode) {
  state.user = null;
  const isSetup = mode === "setup";
  const root = $("#app");
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-shell">
        <section class="auth-brand">
          ${brandBlock()}
          <div class="auth-copy">
            <div class="auth-kicker">${icon("rocket")} Docker-free deploys</div>
            <h1>Push code.<br />We run it.</h1>
            <p>A small, opinionated PaaS for Node.js. Git deploys, systemd processes, Caddy TLS and a database — without the container overhead.</p>
            <div class="auth-points">
              <div class="auth-point"><span>${icon("git")}</span><span>Deploy with <b style="color:#e8eef7">git push</b> to main</span></div>
              <div class="auth-point"><span>${icon("memory")}</span><span>Built for 512 MB–2 GB VPS servers</span></div>
              <div class="auth-point"><span>${icon("database")}</span><span>SQLite, PostgreSQL and MySQL provisioning</span></div>
            </div>
          </div>
          <div class="auth-foot">NodePaaS v0.1 · single-server · no Docker required</div>
        </section>
        <section class="auth-panel">
          <div class="auth-form-wrap">
            <h2>${isSetup ? "Create your account" : "Welcome back"}</h2>
            <p>${isSetup ? "This first account becomes the administrator for this server." : "Sign in to manage applications and deployments."}</p>
            <form class="auth-form" data-form="${isSetup ? "setup" : "login"}">
              <div class="field">
                <label class="label" for="auth-username">Username</label>
                <input class="input" id="auth-username" name="username" autocomplete="username" required minlength="3" maxlength="48" placeholder="admin" />
              </div>
              <div class="field">
                <label class="label" for="auth-password">Password</label>
                <input class="input" id="auth-password" name="password" type="password" autocomplete="${isSetup ? "new-password" : "current-password"}" required minlength="${isSetup ? 10 : 1}" placeholder="${isSetup ? "At least 10 characters" : "Your password"}" />
              </div>
              ${isSetup ? `<div class="field"><label class="label" for="auth-confirm">Confirm password</label><input class="input" id="auth-confirm" name="confirm" type="password" autocomplete="new-password" required minlength="10" placeholder="Repeat password" /></div>` : ""}
              <div id="auth-error" class="error-banner hidden"></div>
              <button class="btn btn-primary" type="submit" style="width:100%;min-height:40px">${isSetup ? "Create account" : "Sign in"} ${icon("chevron")}</button>
            </form>
            <div class="auth-switch">${isSetup ? "This server has no account yet. Complete setup to continue." : "First time here? The setup screen appears automatically when no account exists."}</div>
          </div>
        </section>
      </div>
    </div>`;
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/apps";
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "apps" && parts[1]) {
    return { view: "app", name: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "keys") return { view: "keys" };
  if (parts[0] === "system") return { view: "system" };
  return { view: "apps" };
}

function navigate(hash) {
  if (window.location.hash === hash) {
    void handleRoute();
  } else {
    window.location.hash = hash;
  }
}

function titleFor(route) {
  if (route.view === "app") return state.app?.name || "Application";
  if (route.view === "keys") return "SSH keys";
  if (route.view === "system") return "System";
  return "Applications";
}

function shellSidebar(route) {
  const appLinks = state.apps
    .slice(0, 14)
    .map(
      (app) => `<a class="sidebar-app ${route.view === "app" && route.name === app.name ? "active" : ""}" href="#/apps/${encodeURIComponent(app.name)}">
        ${statusDot(app.status)}<span class="truncate">${esc(app.name)}</span>
      </a>`,
    )
    .join("");
  return `<aside class="sidebar" id="sidebar">
    <div class="sidebar-head">
      ${brandBlock()}
      <button class="icon-button sidebar-close" data-action="toggle-sidebar" aria-label="Close navigation">${icon("x")}</button>
    </div>
    <nav class="nav">
      <div class="nav-label">Workspace</div>
      <a class="nav-link ${route.view === "apps" ? "active" : ""}" href="#/apps">${icon("grid")} Applications</a>
      <a class="nav-link ${route.view === "keys" ? "active" : ""}" href="#/keys">${icon("key")} SSH keys</a>
      <a class="nav-link ${route.view === "system" ? "active" : ""}" href="#/system">${icon("server")} System</a>
      ${state.apps.length ? `<div class="nav-label">Apps</div><div class="sidebar-apps">${appLinks}</div>` : ""}
    </nav>
    <div class="sidebar-foot">
      <div class="user-chip">
        <div class="user-avatar">${esc((state.user?.username || "?").slice(0, 2))}</div>
        <div class="user-name truncate">${esc(state.user?.username || "")}</div>
        <button class="icon-button" data-action="logout" aria-label="Sign out" title="Sign out">${icon("logout")}</button>
      </div>
    </div>
  </aside>`;
}

function renderShell(route) {
  const mode = state.system?.mock ? "Mock mode" : "Production";
  const title = titleFor(route);
  $("#app").innerHTML = `
    <div class="shell">
      ${shellSidebar(route)}
      <div class="main">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-button mobile-toggle" data-action="toggle-sidebar" aria-label="Open navigation">${icon("menu")}</button>
            <div class="topbar-title">${route.view === "app" ? `<a href="#/apps" style="color:var(--muted)">Applications</a> / <b>${esc(title)}</b>` : `<b>${esc(title)}</b>`}</div>
          </div>
          <div class="topbar-right">
            <span class="pill ${state.system?.mock ? "is-building" : "is-running"}" title="${state.system?.mock ? "System commands are simulated on this platform" : "Running with systemd"}"><span class="dot"></span>${mode}</span>
            <button class="icon-button" data-action="refresh" title="Refresh">${icon("refresh")}</button>
          </div>
        </header>
        <main class="main-content" id="view"></main>
      </div>
    </div>`;
  document.title = route.view === "apps" ? "NodePaaS" : `${title} · NodePaaS`;
}

async function loadShell() {
  const [overview, system, github] = await Promise.all([
    api("/api/overview"),
    api("/api/system"),
    api("/api/github/status").catch(() => null),
  ]);
  state.overview = overview;
  state.apps = overview.apps || [];
  state.recent = overview.recent || [];
  state.stats = overview.stats || null;
  state.system = system.system || null;
  state.engines = system.engines || { sqlite: true, postgres: false, mysql: false };
  state.ssh = system.ssh || state.ssh;
  state.caddyConfig = system.caddyConfig || null;
  state.github = github;
}

async function loadApp(name) {
  const data = await api(`/api/apps/${encodeURIComponent(name)}`);
  state.app = data.app;
  state.deployments = data.deployments || [];
  state.env = data.env || [];
  state.database = data.database || null;
  state.ssh = data.ssh || state.ssh;
  if (!state.activeTab) state.activeTab = "deployments";
}

async function handleRoute() {
  if (!state.user) return;
  const route = parseRoute();
  try {
    if (route.view === "app") {
      if (!state.app || state.app.name !== route.name) {
        state.activeTab = "deployments";
        state.showDbUrl = false;
      }
      await loadApp(route.name);
      renderShell(route);
      renderAppView();
    } else if (route.view === "keys") {
      await loadKeys();
      renderShell(route);
      renderKeysView();
    } else if (route.view === "system") {
      renderShell(route);
      renderSystemView();
    } else {
      renderShell(route);
      renderAppsView();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      toast("Application not found", "error");
      window.location.hash = "#/apps";
      return;
    }
    toastError(error);
  }
}

async function loadKeys() {
  const data = await api("/api/ssh-keys");
  state.keys = data.keys || [];
}

function refreshButton(extra = "") {
  return `<button class="btn btn-sm" data-action="refresh">${icon("refresh")} Refresh</button>${extra}`;
}

function emptyState(iconName, title, description, action = "") {
  return `<div class="empty"><div class="empty-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
}

function renderAppsView() {
  const stats = state.stats || { apps: state.apps.length, running: 0, deployments: 0, databases: 0 };
  const appCards = state.apps
    .map((app) => {
      const db = app.domain ? "" : `<span class="meta-chip">${icon("globe")} port ${app.port}</span>`;
      return `<article class="app-card" data-action="open-app" data-name="${esc(app.name)}" tabindex="0" role="link" aria-label="Open ${esc(app.name)}">
        <div class="app-card-top">
          <div style="min-width:0">
            <h3 class="app-name">${esc(app.name)}</h3>
            <div class="app-domain">${icon("globe")} ${esc(app.domain || "No domain configured")}</div>
          </div>
          ${statusPill(app.status)}
        </div>
        <div class="app-meta">
          <span class="meta-chip">:${app.port}</span>
          ${db}
          ${app.source_type === "github" ? `<span class="meta-chip" title="${esc(app.github_repo_full_name || "")}">${icon("github")} ${esc(app.github_branch || "GitHub")}</span>` : ""}
          ${app.memory_mb ? `<span class="meta-chip">${icon("memory")} ${app.memory_mb} MB</span>` : ""}
        </div>
        <div class="app-card-foot">
          <span class="app-time">${app.last_deployed_at ? `Deployed ${timeAgo(app.last_deployed_at)}` : "Not deployed yet"}</span>
          <div class="actions" style="gap:5px">
            <button class="btn btn-sm btn-primary" data-action="deploy" data-name="${esc(app.name)}">${icon("rocket")} Deploy</button>
            <button class="btn btn-sm" data-action="open-app" data-name="${esc(app.name)}">Open ${icon("chevron")}</button>
          </div>
        </div>
      </article>`;
    })
    .join("");

  const recentRows = state.recent
    .map(
      (item) => `<tr>
        <td><a class="link" href="#/apps/${encodeURIComponent(item.app_name)}">${esc(item.app_name)}</a></td>
        <td>${statusPill(item.status)}</td>
        <td class="commit" title="${esc(item.commit_message)}">${esc(item.commit_message || "No commit message")} <span class="sha">${esc(shortSha(item.sha))}</span></td>
        <td class="muted">${timeAgo(item.created_at)}</td>
        <td><div class="row-actions"><button class="btn btn-sm" data-action="open-log" data-name="${esc(item.app_name)}" data-id="${item.id}">${icon("terminal")} Logs</button></div></td>
      </tr>`,
    )
    .join("");

  const memoryUsed = state.system ? state.system.totalMemory - state.system.freeMemory : 0;
  const memoryPercent = state.system?.totalMemory ? Math.round((memoryUsed / state.system.totalMemory) * 100) : 0;

  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Applications</h1>
        <p class="page-sub">Git-push deployments on this server. No Docker daemon required.</p>
      </div>
      <div class="actions">${refreshButton()}<button class="btn btn-primary" data-action="new-app">${icon("plus")} New application</button></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon">${icon("box")}</div><div><div class="stat-label">Applications</div><div class="stat-value">${stats.apps}</div></div></div>
      <div class="stat-card"><div class="stat-icon">${icon("play")}</div><div><div class="stat-label">Running</div><div class="stat-value">${stats.running}</div></div></div>
      <div class="stat-card"><div class="stat-icon">${icon("rocket")}</div><div><div class="stat-label">Deployments</div><div class="stat-value">${stats.deployments}</div></div></div>
      <div class="stat-card"><div class="stat-icon">${icon("database")}</div><div><div class="stat-label">Databases</div><div class="stat-value">${stats.databases}</div></div></div>
    </div>

    <div class="grid-2" style="align-items:start;margin-bottom:16px">
      <section>
        <div class="card">
          <div class="card-head">
            <div><h2 class="card-title">Your applications</h2><p class="card-sub">${state.apps.length} on this server</p></div>
          </div>
          <div class="card-body">
            ${
              state.apps.length
                ? `<div class="app-grid">${appCards}</div>`
                : emptyState(
                    "rocket",
                    "No applications yet",
                    "Create an app, add your SSH key, then push a Node.js project to the main branch. NodePaaS builds it and keeps it running.",
                    `<button class="btn btn-primary" data-action="new-app">${icon("plus")} Create your first app</button>`,
                  )
            }
          </div>
        </div>
      </section>
      <section class="section-grid">
        <div class="card">
          <div class="card-head"><div><h2 class="card-title">Server</h2><p class="card-sub">${esc(state.system?.platform || "Unknown platform")}</p></div><span class="pill ${state.system?.mock ? "is-building" : "is-running"}"><span class="dot"></span>${state.system?.mock ? "Mock" : "Live"}</span></div>
          <div class="card-body">
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">Memory</span><span class="kv-value">${formatBytes(memoryUsed)} / ${formatBytes(state.system?.totalMemory || 0)}</span></div>
              <div class="kv-row"><span class="kv-label">Uptime</span><span class="kv-value">${formatUptime(state.system?.uptimeSeconds)}</span></div>
              <div class="kv-row"><span class="kv-label">Node</span><span class="kv-value mono">${esc(state.system?.nodeVersion || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Caddy</span><span class="kv-value">${state.system?.caddy ? "available" : "not detected"}</span></div>
            </div>
            <div class="divider"></div>
            <div class="memory-bar" title="${memoryPercent}% used"><span style="width:${Math.min(100, Math.max(0, memoryPercent))}%"></span></div>
            <p class="hint" style="margin:8px 0 0">${memoryPercent}% host memory in use.</p>
            <div class="form-actions" style="justify-content:flex-start;margin-top:14px"><a class="btn btn-sm" href="#/system">View system details ${icon("chevron")}</a></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h2 class="card-title">Deploy from your terminal</h2><p class="card-sub">One remote per app</p></div>${icon("terminal")}</div>
          <div class="card-body">
            <code class="code">git remote add paas ${esc(state.ssh ? `${state.ssh.user}@${state.ssh.host}:${state.apps[0]?.name || "my-app"}.git` : "paas@server:my-app.git")}</code>
            <code class="code" style="margin-top:6px">git push paas main</code>
            <p class="hint" style="margin-top:9px">Add your public key under <a class="link" href="#/keys">SSH keys</a>. Every push to main creates a deployment.</p>
          </div>
        </div>
      </section>
    </div>

    <div class="card">
      <div class="card-head">
        <div><h2 class="card-title">Recent deployments</h2><p class="card-sub">Latest activity across all applications</p></div>
        <a class="btn btn-sm" href="#/apps">All apps ${icon("chevron")}</a>
      </div>
      <div class="card-body tight">
        ${
          recentRows
            ? `<div class="table-wrap"><table><thead><tr><th>App</th><th>Status</th><th>Commit</th><th>Started</th><th></th></tr></thead><tbody>${recentRows}</tbody></table></div>`
            : emptyState("clock", "No deployments yet", "Push to an app's git remote or press Deploy to create the first deployment.")
        }
      </div>
    </div>`;
}

function renderTabs() {
  const tabs = [
    ["deployments", "Deployments", state.deployments.length],
    ["environment", "Environment", state.env.length],
    ["database", "Database", state.database ? 1 : 0],
    ["settings", "Settings", null],
  ];
  return `<div class="tabs">${tabs
    .map(
      ([id, label, count]) =>
        `<button class="tab ${state.activeTab === id ? "active" : ""}" data-action="tab" data-tab="${id}">${label}${count !== null ? `<span class="tab-count">${count}</span>` : ""}</button>`,
    )
    .join("")}</div>`;
}

function renderAppView() {
  if (!state.app) return;
  const app = state.app;
  const ssh = state.ssh || { user: "paas", host: host(), remote: remoteFor(app) };
  const remote = ssh.remote || remoteFor(app);
  const isGithub = app.source_type === "github";
  const isBusy = ["queued", "building", "starting"].includes(app.status);
  const canStart = app.status !== "idle";
  const deployAction = isBusy
    ? `<button class="btn btn-primary" disabled><span class="spinner"></span> Deploying</button>`
    : `<button class="btn btn-primary" data-action="deploy" data-name="${esc(app.name)}">${icon("rocket")} Deploy</button>`;
  const runtimeAction = isBusy
    ? `<button class="btn" disabled><span class="spinner"></span> Working</button>`
    : app.status === "running"
      ? `<button class="btn" data-action="app-stop" data-name="${esc(app.name)}">${icon("stop")} Stop</button>`
      : canStart
        ? `<button class="btn" data-action="app-start" data-name="${esc(app.name)}">${icon("play")} Start</button>`
        : "";
  const sourceCard = isGithub
    ? `<div class="card">
        <div class="card-head"><div><h2 class="card-title">GitHub source</h2><p class="card-sub">Pushes to ${esc(app.github_branch || "the selected branch")} deploy automatically</p></div>${icon("github")}</div>
        <div class="card-body">
          <div class="copy-row">
            <code class="code" id="remote-code">${esc(app.github_repo_full_name || "Unknown repository")}</code>
            <button class="btn btn-sm btn-icon" data-action="copy" data-copy="${esc(app.github_repo_full_name || "")}" title="Copy repository name">${icon("copy")}</button>
            <a class="btn btn-sm btn-icon" href="${esc(githubBranchUrl(app))}" target="_blank" rel="noreferrer" title="Open branch on GitHub">${icon("github")}</a>
          </div>
          <div class="kv-list" style="margin-top:10px">
            <div class="kv-row"><span class="kv-label">Repository</span><span class="kv-value truncate" style="max-width:220px"><a class="link" href="${esc(githubRepoUrl(app))}" target="_blank" rel="noreferrer">${esc(app.github_repo_full_name || "-")}</a></span></div>
            <div class="kv-row"><span class="kv-label">Branch</span><span class="kv-value mono">${esc(app.github_branch || "-")}</span></div>
            <div class="kv-row"><span class="kv-label">Source</span><span class="kv-value">GitHub App</span></div>
          </div>
          <p class="hint" style="margin-top:10px">GitHub is the source of truth for this app. Direct SSH pushes are rejected. The Deploy button fetches the latest commit from the selected branch.</p>
        </div>
      </div>`
    : `<div class="card">
        <div class="card-head"><div><h2 class="card-title">Git remote</h2><p class="card-sub">Push to main to deploy</p></div>${icon("git")}</div>
        <div class="card-body">
          <div class="copy-row">
            <code class="code" id="remote-code">${esc(remote)}</code>
            <button class="btn btn-sm btn-icon" data-action="copy" data-copy="${esc(remote)}" title="Copy remote">${icon("copy")}</button>
          </div>
          <div class="copy-row" style="margin-top:7px">
            <code class="code">git push paas main</code>
            <button class="btn btn-sm btn-icon" data-action="copy" data-copy="git push paas main" title="Copy command">${icon("copy")}</button>
          </div>
          <p class="hint" style="margin-top:10px">Deploys run on <span class="mono">main</span> or <span class="mono">master</span>. Add your key in <a class="link" href="#/keys">SSH keys</a> first.</p>
        </div>
      </div>`;

  $("#view").innerHTML = `
    <div class="page-head">
      <div style="min-width:0">
        <div class="breadcrumb"><a href="#/apps">Applications</a>${icon("chevron")}<span>${esc(app.name)}</span></div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h1 class="page-title">${esc(app.name)}</h1>
          ${statusPill(app.status)}
        </div>
        <p class="page-sub">${app.domain ? esc(app.domain) : "No domain configured"} · Node.js on port ${app.port}</p>
      </div>
      <div class="actions">
        <button class="btn btn-sm" data-action="runtime-logs" data-name="${esc(app.name)}">${icon("terminal")} Logs</button>
        <button class="btn btn-sm" data-action="app-restart" data-name="${esc(app.name)}" ${canStart && !isBusy ? "" : "disabled"}>${icon("refresh")} Restart</button>
        ${runtimeAction}
        ${deployAction}
      </div>
    </div>

    <div class="grid-2" style="align-items:start;margin-bottom:18px">
      ${sourceCard}
      <div class="card">
        <div class="card-head"><div><h2 class="card-title">Runtime</h2><p class="card-sub">Managed by systemd</p></div><a class="btn btn-sm" href="${esc(appUrl(app))}" target="_blank" rel="noreferrer">${icon("globe")} Open</a></div>
        <div class="card-body">
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">URL</span><span class="kv-value truncate" style="max-width:220px"><a class="link" href="${esc(appUrl(app))}" target="_blank" rel="noreferrer">${esc(app.domain || `${host()}:${app.port}`)}</a></span></div>
            <div class="kv-row"><span class="kv-label">Internal port</span><span class="kv-value mono">127.0.0.1:${app.port}</span></div>
            <div class="kv-row"><span class="kv-label">Last deploy</span><span class="kv-value">${app.last_deployed_at ? timeAgo(app.last_deployed_at) : "never"}</span></div>
            <div class="kv-row"><span class="kv-label">Database</span><span class="kv-value">${state.database ? `<span class="engine-badge">${esc(state.database.engine)}</span>` : "none"}</span></div>
            <div class="kv-row"><span class="kv-label">Memory limit</span><span class="kv-value">${app.memory_mb ? `${app.memory_mb} MB` : "unlimited"}</span></div>
          </div>
        </div>
      </div>
    </div>

    ${renderTabs()}
    <div id="tab-content">${renderTabContent()}</div>`;
}

function renderTabContent() {
  if (state.activeTab === "environment") return renderEnvironmentTab();
  if (state.activeTab === "database") return renderDatabaseTab();
  if (state.activeTab === "settings") return renderSettingsTab();
  return renderDeploymentsTab();
}

function renderDeploymentsTab() {
  const rows = state.deployments
    .map(
      (deployment) => `<tr>
        <td>${statusPill(deployment.status)}</td>
        <td class="commit" title="${esc(deployment.commit_message)}"><div style="color:#d7e0ec">${esc(deployment.commit_message || "No commit message")}</div><span class="sha">${esc(shortSha(deployment.sha))}</span></td>
        <td class="muted">${timeAgo(deployment.created_at)}</td>
        <td class="muted">${deployment.finished_at ? formatDate(deployment.finished_at) : "in progress"}</td>
        <td><div class="row-actions"><button class="btn btn-sm" data-action="open-log" data-name="${esc(state.app.name)}" data-id="${deployment.id}">${icon("terminal")} View log</button></div></td>
      </tr>`,
    )
    .join("");

  return `<div class="card">
    <div class="card-head">
      <div><h2 class="card-title">Deployment history</h2><p class="card-sub">Builds are queued per application</p></div>
      <button class="btn btn-sm btn-primary" data-action="deploy" data-name="${esc(state.app.name)}">${icon("rocket")} Deploy now</button>
    </div>
    <div class="card-body tight">
      ${
        rows
          ? `<div class="table-wrap"><table><thead><tr><th>Status</th><th>Commit</th><th>Started</th><th>Finished</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : emptyState("rocket", "No deployments yet", "Push a commit to main or press Deploy now. The build log will appear here.")
      }
    </div>
  </div>`;
}

function envRowTemplate(key = "", value = "") {
  return `<div class="env-row">
    <input class="input" name="env-key" placeholder="API_KEY" value="${esc(key)}" spellcheck="false" autocomplete="off" />
    <input class="input" name="env-value" placeholder="value" value="${esc(value)}" spellcheck="false" autocomplete="off" />
    <button type="button" class="icon-button env-remove" data-action="remove-env" title="Remove variable">${icon("trash")}</button>
  </div>`;
}

function renderEnvironmentTab() {
  const rows = state.env.map((item) => envRowTemplate(item.key, item.value)).join("");
  return `<form data-form="env">
    <div class="card">
      <div class="card-head">
        <div><h2 class="card-title">Environment variables</h2><p class="card-sub">Injected at process start. Secrets are stored on the server.</p></div>
        <div class="actions"><button type="button" class="btn btn-sm" data-action="add-env">${icon("plus")} Add variable</button><button class="btn btn-sm btn-primary" type="submit">${icon("check")} Save variables</button></div>
      </div>
      <div class="card-body">
        <div class="info-banner" style="margin-bottom:14px">${icon("alert")}<div><b>Restart required.</b> Saved variables are written to the app environment file. Restart the app to apply them. <span class="mono">PORT</span>, <span class="mono">NODE_ENV</span>, <span class="mono">HOME</span>, <span class="mono">PATH</span>, <span class="mono">DATABASE_URL</span> and <span class="mono">SQLITE_PATH</span> are managed by NodePaaS.</div></div>
        <div id="env-list" class="env-list">${rows || envRowTemplate()}</div>
        <div id="env-error" class="error-banner hidden" style="margin-top:12px"></div>
      </div>
    </div>
  </form>`;
}

function renderDatabaseTab() {
  if (state.database) {
    const db = state.database;
    const isSqlite = db.engine === "sqlite";
    const display = isSqlite || state.showDbUrl ? db.url : db.url.replace(/(:\/\/[^:]+:)[^@]+@/, "$1••••••@");
    return `<div class="grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head"><div><h2 class="card-title">Database</h2><p class="card-sub">Provisioned on this server</p></div><span class="engine-badge">${esc(db.engine)}</span></div>
        <div class="card-body">
          <div class="kv-list">
            <div class="kv-row"><span class="kv-label">Engine</span><span class="kv-value">${esc(db.engine)}</span></div>
            <div class="kv-row"><span class="kv-label">Database</span><span class="kv-value mono">${esc(db.name)}</span></div>
            ${db.username ? `<div class="kv-row"><span class="kv-label">User</span><span class="kv-value mono">${esc(db.username)}</span></div>` : ""}
            <div class="kv-row"><span class="kv-label">Created</span><span class="kv-value">${timeAgo(db.created_at)}</span></div>
          </div>
          <div class="divider"></div>
          <div class="copy-row">
            <code class="code truncate" style="max-height:36px">${esc(display)}</code>
            <button class="btn btn-sm btn-icon" data-action="reveal-db" title="${state.showDbUrl ? "Hide URL" : "Reveal URL"}">${state.showDbUrl ? icon("eyeOff") : icon("eye")}</button>
            <button class="btn btn-sm btn-icon" data-action="copy" data-copy="${esc(db.url)}" title="Copy URL">${icon("copy")}</button>
          </div>
          <p class="hint" style="margin-top:10px">Available to the app as <span class="mono">DATABASE_URL</span>${isSqlite ? " and <span class=\"mono\">SQLITE_PATH</span>" : ""}. Restart the app after provisioning.</p>
        </div>
      </div>
      <div class="card danger-zone">
        <div class="card-head"><div><h2 class="card-title">Delete database</h2><p class="card-sub">This cannot be undone.</p></div>${icon("trash")}</div>
        <div class="card-body">
          <p class="hint" style="margin-top:0">Deleting this database drops ${isSqlite ? "the SQLite file" : `the ${esc(db.engine)} database and role`}. The app keeps running but loses access on its next restart.</p>
          <button class="btn btn-danger" data-action="delete-db" data-name="${esc(state.app.name)}">${icon("trash")} Delete database</button>
        </div>
      </div>
    </div>`;
  }

  const engines = [
    ["sqlite", "SQLite", "Zero configuration. A file inside the app's persistent data directory. Best for small VPS servers."],
    ["postgres", "PostgreSQL", "Creates a local role and database. Needs PostgreSQL installed on the host."],
    ["mysql", "MySQL", "Creates a local database and user. Needs MySQL installed on the host."],
  ];
  return `<div class="card">
    <div class="card-head"><div><h2 class="card-title">Provision a database</h2><p class="card-sub">Credentials are generated and injected as DATABASE_URL</p></div>${icon("database")}</div>
    <div class="card-body">
      <div class="db-grid">
        ${engines
          .map(
            ([engine, name, description]) => `<button class="db-option" data-action="create-db" data-engine="${engine}" ${state.engines[engine] ? "" : "disabled"}>
              <span class="db-icon">${icon("database")}</span>
              <strong>${name}</strong>
              <span>${description}</span>
              ${state.engines[engine] ? "" : `<span style="color:var(--danger);margin-top:2px">Not installed on this server</span>`}
            </button>`,
          )
          .join("")}
      </div>
      <div class="info-banner" style="margin-top:14px">${icon("alert")}<div>One database per app. On a small VPS, SQLite is usually the lightest option. The app must be restarted to receive the new <span class="mono">DATABASE_URL</span>.</div></div>
    </div>
  </div>`;
}

function renderSettingsTab() {
  const app = state.app;
  return `<div class="section-grid">
    <form data-form="app-settings">
      <div class="card">
        <div class="card-head"><div><h2 class="card-title">Application settings</h2><p class="card-sub">Domain changes apply immediately; command and memory changes apply on the next deploy.</p></div></div>
        <div class="card-body form-grid">
          ${app.source_type === "github" ? `<div class="info-banner">${icon("github")}<div>This app deploys from <span class="mono">${esc(app.github_repo_full_name || "GitHub")}</span> on branch <span class="mono">${esc(app.github_branch || "-")}</span>. The source repository and branch are fixed after creation.</div></div>` : ""}
          <div class="form-row">
            <div class="field"><label class="label" for="setting-domain">Domain</label><input class="input" id="setting-domain" name="domain" value="${esc(app.domain || "")}" placeholder="app.example.com" /><span class="hint">Caddy provisions HTTPS automatically when DNS points here.</span></div>
            <div class="field"><label class="label" for="setting-memory">Memory limit <span class="optional">(MB)</span></label><input class="input" id="setting-memory" name="memoryMb" type="number" min="64" max="16384" value="${app.memory_mb ?? ""}" placeholder="No limit" /><span class="hint">systemd MemoryMax. Leave blank for no limit.</span></div>
          </div>
          <div class="field"><label class="label" for="setting-install">Install command <span class="optional">(optional)</span></label><input class="input mono" id="setting-install" name="installCmd" value="${esc(app.install_cmd || "")}" placeholder="Auto-detected: npm ci / pnpm / yarn" /></div>
          <div class="field"><label class="label" for="setting-build">Build command <span class="optional">(optional)</span></label><input class="input mono" id="setting-build" name="buildCmd" value="${esc(app.build_cmd || "")}" placeholder="Auto-detected: npm run build" /></div>
          <div class="field"><label class="label" for="setting-start">Start command <span class="optional">(optional)</span></label><input class="input mono" id="setting-start" name="startCmd" value="${esc(app.start_cmd || "")}" placeholder="Auto-detected: npm start" /><span class="hint">Run from the release directory as the app's system user. Do not include secrets here.</span></div>
          <div id="settings-error" class="error-banner hidden"></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("check")} Save settings</button></div>
        </div>
      </div>
    </form>
    <div class="card danger-zone">
      <div class="card-head"><div><h2 class="card-title">Delete application</h2><p class="card-sub">Removes the service, git repository, releases and database.</p></div>${icon("alert")}</div>
      <div class="card-body">
        <p class="hint" style="margin-top:0">This action cannot be undone. Type <span class="mono">${esc(app.name)}</span> to confirm.</p>
        <button class="btn btn-danger" data-action="delete-app" data-name="${esc(app.name)}">${icon("trash")} Delete application</button>
      </div>
    </div>
  </div>`;
}

function renderKeysView() {
  const rows = state.keys
    .map(
      (key) => `<tr>
        <td><div style="color:#d8e2ef;font-weight:600">${esc(key.name)}</div><div class="muted mono" style="font-size:10px">${esc(key.fingerprint)}</div></td>
        <td class="muted">${timeAgo(key.created_at)}</td>
        <td><div class="row-actions"><button class="btn btn-sm" data-action="copy" data-copy="${esc(key.public_key)}">${icon("copy")} Copy</button><button class="btn btn-sm btn-danger" data-action="delete-key" data-id="${key.id}" data-name="${esc(key.name)}">${icon("trash")} Remove</button></div></td>
      </tr>`,
    )
    .join("");

  const sshExample = state.ssh ? `${state.ssh.user}@${state.ssh.host}` : "paas@your-server";
  $("#view").innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">SSH keys</h1><p class="page-sub">Authorized keys can push to any app on this server.</p></div>
      <div class="actions">${refreshButton()}</div>
    </div>
    <div class="grid-2" style="align-items:start;margin-bottom:16px">
      <div class="card">
        <div class="card-head"><div><h2 class="card-title">Add a public key</h2><p class="card-sub">Use the public half of your local SSH key.</p></div>${icon("key")}</div>
        <div class="card-body">
          <form data-form="add-key" class="form-grid">
            <div class="field"><label class="label" for="key-name">Name</label><input class="input" id="key-name" name="name" required maxlength="64" placeholder="MacBook" /></div>
            <div class="field"><label class="label" for="key-value">Public key</label><textarea class="textarea" id="key-value" name="publicKey" required placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... you@laptop"></textarea><span class="hint">Find it with <span class="mono">cat ~/.ssh/id_ed25519.pub</span>.</span></div>
            <div id="key-error" class="error-banner hidden"></div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon("plus")} Add key</button></div>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2 class="card-title">Connect</h2><p class="card-sub">SSH user for git deploys</p></div>${icon("terminal")}</div>
        <div class="card-body">
          <code class="code">${esc(sshExample)}</code>
          <p class="hint" style="margin-top:10px">The server uses a forced command for git receive-pack, so these keys cannot open a shell. Test with a real push:</p>
          <code class="code" style="margin-top:6px">git remote add paas ${esc(sshExample)}:my-app.git<br />git push paas main</code>
          <div class="info-banner" style="margin-top:13px">${icon("alert")}<div>Make sure port 22 is reachable. If you use a non-default SSH port, configure your git remote accordingly.</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div><h2 class="card-title">Authorized keys</h2><p class="card-sub">${state.keys.length} key${state.keys.length === 1 ? "" : "s"}</p></div></div>
      <div class="card-body tight">
        ${
          rows
            ? `<div class="table-wrap"><table><thead><tr><th>Key</th><th>Added</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
            : emptyState("key", "No SSH keys yet", "Add a public key above, then push to your app's git remote.")
        }
      </div>
    </div>`;
}

function renderSystemView() {
  const system = state.system || {};
  const memoryUsed = (system.totalMemory || 0) - (system.freeMemory || 0);
  const memoryPercent = system.totalMemory ? Math.round((memoryUsed / system.totalMemory) * 100) : 0;
  const serviceRow = (name, available, note) => `<div class="kv-row"><span class="kv-label">${name}</span><span class="kv-value"><span class="dot ${available ? "green" : "red"}" style="display:inline-block;margin-right:6px"></span>${available ? "available" : "not installed"}</span></div>${note ? `<p class="hint" style="margin:-5px 0 8px">${note}</p>` : ""}`;
  $("#view").innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">System</h1><p class="page-sub">Host runtime and service availability.</p></div>
      <div class="actions">${refreshButton()}</div>
    </div>
    ${
      system.mock
        ? `<div class="warn-banner" style="margin-bottom:16px">${icon("alert")}<div><b>Mock mode.</b> This instance is running on a non-Linux platform or with <span class="mono">PAAS_MOCK=1</span>. Deploy commands, systemd, user creation and Caddy are simulated. Use the Linux installer for real deployments.</div></div>`
        : ""
    }
    <div class="grid-2" style="align-items:start">
      <div class="section-grid">
        <div class="card">
          <div class="card-head"><div><h2 class="card-title">Runtime</h2><p class="card-sub">NodePaaS control plane</p></div><span class="pill is-running"><span class="dot"></span>Online</span></div>
          <div class="card-body">
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">Version</span><span class="kv-value">v${esc(system.version || "0.1.0")}</span></div>
              <div class="kv-row"><span class="kv-label">Platform</span><span class="kv-value">${esc(system.platform || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Node.js</span><span class="kv-value mono">${esc(system.nodeVersion || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Hostname</span><span class="kv-value mono">${esc(system.hostname || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Uptime</span><span class="kv-value">${formatUptime(system.uptimeSeconds)}</span></div>
              <div class="kv-row"><span class="kv-label">Mode</span><span class="kv-value">${system.mock ? "mock" : "systemd"}</span></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h2 class="card-title">Resources</h2><p class="card-sub">Host memory and load</p></div>${icon("memory")}</div>
          <div class="card-body">
            <div class="kv-row" style="padding-top:0"><span class="kv-label">Memory</span><span class="kv-value">${formatBytes(memoryUsed)} / ${formatBytes(system.totalMemory || 0)}</span></div>
            <div class="memory-bar" style="margin:6px 0 14px"><span style="width:${Math.min(100, Math.max(0, memoryPercent))}%"></span></div>
            <div class="kv-row"><span class="kv-label">Load (1m / 5m / 15m)</span><span class="kv-value mono">${(system.loadAverage || []).map((value) => Number(value).toFixed(2)).join(" / ") || "—"}</span></div>
            <div class="kv-row"><span class="kv-label">Data directory</span><span class="kv-value mono truncate" style="max-width:260px">${esc(system.dataDir || "—")}</span></div>
            <div class="kv-row"><span class="kv-label">Caddy config</span><span class="kv-value mono truncate" style="max-width:260px">${esc(state.caddyConfig || "—")}</span></div>
          </div>
        </div>
      </div>
      <div class="section-grid">
        <div class="card">
          <div class="card-head"><div><h2 class="card-title">Services</h2><p class="card-sub">Optional host components</p></div>${icon("server")}</div>
          <div class="card-body">
            ${serviceRow("Caddy", system.caddy, "Automatic HTTPS and domain routing.")}
            ${serviceRow("PostgreSQL", system.postgres, "Enables PostgreSQL database provisioning.")}
            ${serviceRow("MySQL", system.mysql, "Enables MySQL database provisioning.")}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><h2 class="card-title">SSH deploys</h2><p class="card-sub">Git receive endpoint</p></div>${icon("git")}</div>
          <div class="card-body">
            <div class="kv-list">
              <div class="kv-row"><span class="kv-label">SSH user</span><span class="kv-value mono">${esc(state.ssh?.user || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">SSH host</span><span class="kv-value mono">${esc(state.ssh?.host || "—")}</span></div>
              <div class="kv-row"><span class="kv-label">Remote format</span><span class="kv-value mono">${esc(state.ssh ? `${state.ssh.user}@${state.ssh.host}:<app>.git` : "—")}</span></div>
            </div>
            <div class="form-actions" style="justify-content:flex-start;margin-top:14px"><a class="btn btn-sm" href="#/keys">Manage SSH keys ${icon("chevron")}</a></div>
          </div>
        </div>
      </div>
    </div>`;
}

function showModal({ title, subtitle, body, footer = "", wide = false, onClose = null }) {
  closeModal();
  state.modalOnClose = onClose;
  $("#modal-root").innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
    <div class="modal ${wide ? "modal-lg" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div><h2 class="modal-title">${esc(title)}</h2>${subtitle ? `<p class="modal-sub">${esc(subtitle)}</p>` : ""}</div>
        <button class="modal-close" data-action="close-modal" aria-label="Close">${icon("x")}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>
  </div>`;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#modal-root input, #modal-root textarea, #modal-root button")?.focus(), 40);
}

function closeModal() {
  if (state.modalOnClose) {
    try {
      state.modalOnClose();
    } catch {
      // ignore cleanup failures
    }
    state.modalOnClose = null;
  }
  $("#modal-root").innerHTML = "";
  document.body.style.overflow = "";
}

function formError(id, message) {
  const node = $(`#${id}`);
  if (!node) return;
  node.textContent = message;
  node.classList.remove("hidden");
}

function clearFormError(id) {
  const node = $(`#${id}`);
  if (!node) return;
  node.textContent = "";
  node.classList.add("hidden");
}

function setButtonBusy(button, busy, label = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }
}

function githubSetupMarkup() {
  if (!state.github?.configured) {
    const missing = state.github?.missing?.length ? state.github.missing.join(", ") : "the GitHub App environment variables";
    return `<div class="warn-banner">${icon("alert")}<div><b>GitHub App not configured.</b> Set <span class="mono">${esc(missing)}</span> on the server and restart NodePaaS. See the README for the GitHub App setup steps.</div></div>`;
  }
  return `<div class="info-banner">${icon("github")}<div><div>Only repositories selected during GitHub App installation are visible. <a class="link" href="${esc(state.github.installUrl || "#")}" target="_blank" rel="noreferrer">Manage repository access</a>.</div><button type="button" class="btn btn-sm" data-action="refresh-github-repos" style="margin-top:8px">${icon("refresh")} Refresh list</button></div></div>`;
}

function openNewApp() {
  state.newAppSource = state.github?.configured ? "github" : "git";
  state.githubBranches = null;
  const isGithub = state.newAppSource === "github";
  showModal({
    title: "New application",
    subtitle: "Creates a systemd service, internal port and deployment source.",
    body: `<form id="new-app-form" data-form="new-app" class="form-grid">
      <div class="field"><label class="label" for="new-app-name">App name</label><input class="input" id="new-app-name" name="name" required minlength="3" maxlength="24" pattern="[a-z][a-z0-9-]*[a-z0-9]" placeholder="my-api" autocomplete="off" /><span class="hint">Lowercase letters, numbers and hyphens. Used for the Linux user and service.</span></div>
      <div class="field">
        <label class="label">Deployment source</label>
        <div class="source-switch" id="new-app-source-switch">
          <button type="button" class="btn btn-sm ${isGithub ? "" : "btn-primary"}" data-action="app-source" data-source="git">${icon("git")} Git over SSH</button>
          <button type="button" class="btn btn-sm ${isGithub ? "btn-primary" : ""}" data-action="app-source" data-source="github" ${state.github?.configured ? "" : "disabled"}>${icon("github")} GitHub App</button>
        </div>
        ${state.github && !state.github.configured ? `<span class="hint">GitHub App is not configured on this server. See the README to enable it.</span>` : ""}
      </div>
      <div id="git-source-fields" class="${isGithub ? "hidden" : ""}">
        <div class="info-banner">${icon("terminal")}<div>Create the app, add your SSH key, then push to <span class="mono">main</span>. Pushes deploy automatically.</div></div>
      </div>
      <div id="github-source-fields" class="${isGithub ? "" : "hidden"}">
        ${githubSetupMarkup()}
        <div class="form-row" style="margin-top:12px">
          <div class="field"><label class="label" for="new-app-repo">Repository</label><select class="select" id="new-app-repo" data-github-repo disabled><option value="">Loading repositories.</option></select></div>
          <div class="field"><label class="label" for="new-app-branch">Branch</label><select class="select" id="new-app-branch" disabled><option value="">Select a repository first</option></select><span class="hint">Every push to this branch deploys automatically.</span></div>
        </div>
        <div id="github-source-error" class="error-banner hidden"></div>
      </div>
      <div class="field"><label class="label" for="new-app-domain">Domain <span class="optional">(optional)</span></label><input class="input" id="new-app-domain" name="domain" placeholder="api.example.com" autocomplete="off" /><span class="hint">Point DNS here and Caddy will obtain a certificate.</span></div>
      <div id="new-app-error" class="error-banner hidden"></div>
    </form>`,
    footer: `<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit" form="new-app-form">${icon("plus")} Create application</button>`,
  });
  if (isGithub && state.github?.configured) void loadGithubRepositories();
}

function slugifyAppName(value) {
  let slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  if (!/^[a-z]/.test(slug)) slug = `app-${slug}`;
  if (slug.length < 3) slug = `app-${slug || "service"}`;
  slug = slug.replace(/-$/g, "").slice(0, 24);
  return slug.length >= 3 && /^[a-z][a-z0-9-]*[a-z0-9]$/.test(slug) ? slug : "my-app";
}

function setNewAppSource(source) {
  state.newAppSource = source;
  for (const button of $$("#new-app-source-switch [data-action='app-source']")) {
    button.classList.toggle("btn-primary", button.dataset.source === source);
  }
  $("#git-source-fields")?.classList.toggle("hidden", source !== "git");
  $("#github-source-fields")?.classList.toggle("hidden", source !== "github");
  if (source === "github" && state.github?.configured && state.githubRepos === null) {
    void loadGithubRepositories();
  } else if (source === "github" && state.githubRepos) {
    populateGithubRepositories();
  }
}

function setGithubSourceError(message) {
  const node = $("#github-source-error");
  if (!node) return;
  node.textContent = message || "";
  node.classList.toggle("hidden", !message);
}

async function loadGithubRepositories(force = false) {
  const select = $("#new-app-repo");
  if (!select) return;
  select.disabled = true;
  select.innerHTML = `<option value="">Loading repositories.</option>`;
  setGithubSourceError("");
  try {
    const data = await api(`/api/github/repositories${force ? "?refresh=1" : ""}`);
    state.githubRepos = data.repositories || [];
    populateGithubRepositories();
  } catch (error) {
    state.githubRepos = [];
    select.innerHTML = `<option value="">Could not load repositories</option>`;
    setGithubSourceError(error instanceof Error ? error.message : String(error));
  }
}

function populateGithubRepositories() {
  const select = $("#new-app-repo");
  if (!select) return;
  const repositories = state.githubRepos || [];
  if (!repositories.length) {
    select.innerHTML = `<option value="">No repositories available</option>`;
    select.disabled = true;
    setGithubSourceError(
      state.github?.installUrl
        ? "Install the GitHub App on an account and grant it access to at least one repository."
        : "Grant the GitHub App access to at least one repository.",
    );
    return;
  }
  select.innerHTML = repositories
    .map(
      (repo) =>
        `<option value="${repo.id}" data-installation-id="${repo.installationId}" data-default-branch="${esc(repo.defaultBranch)}" data-full-name="${esc(repo.fullName)}">${esc(repo.fullName)}${repo.private ? " (private)" : ""}</option>`,
    )
    .join("");
  select.disabled = false;
  const current = repositories.find((repo) => String(repo.id) === select.value) || repositories[0];
  select.value = String(current.id);
  const nameInput = $("#new-app-name");
  if (nameInput && !nameInput.value.trim()) nameInput.value = slugifyAppName(current.name);
  void loadGithubBranches(current.id, current.installationId, current.defaultBranch);
}

async function loadGithubBranches(repoId, installationId, defaultBranch) {
  const select = $("#new-app-branch");
  if (!select) return;
  const requestId = ++state.githubBranchRequest;
  state.githubBranches = null;
  select.disabled = true;
  select.innerHTML = `<option value="">Loading branches.</option>`;
  setGithubSourceError("");
  try {
    const data = await api(
      `/api/github/repositories/${encodeURIComponent(repoId)}/branches?installationId=${encodeURIComponent(installationId)}`,
    );
    if (requestId !== state.githubBranchRequest || !$("#new-app-branch")) return;
    const branches = data.branches || [];
    state.githubBranches = branches;
    if (!branches.length) {
      select.innerHTML = `<option value="">No branches found</option>`;
      select.disabled = true;
      setGithubSourceError("This repository has no branches to deploy.");
      return;
    }
    select.innerHTML = branches
      .map((branch) => `<option value="${esc(branch.name)}">${esc(branch.name)}</option>`)
      .join("");
    const preferred = branches.find((branch) => branch.name === defaultBranch) || branches[0];
    select.value = preferred.name;
    select.disabled = false;
  } catch (error) {
    if (requestId !== state.githubBranchRequest || !$("#new-app-branch")) return;
    select.innerHTML = `<option value="">Could not load branches</option>`;
    setGithubSourceError(error instanceof Error ? error.message : String(error));
  }
}

function handleGithubRepoChange() {
  const select = $("#new-app-repo");
  const option = select?.selectedOptions?.[0];
  if (!option || !option.value) return;
  const nameInput = $("#new-app-name");
  if (nameInput && !nameInput.value.trim() && option.dataset.fullName) {
    nameInput.value = slugifyAppName(option.dataset.fullName.split("/").pop());
  }
  void loadGithubBranches(Number(option.value), Number(option.dataset.installationId), option.dataset.defaultBranch || "main");
}

function openDeleteApp() {
  const app = state.app;
  showModal({
    title: "Delete application",
    subtitle: "This permanently removes the app, its releases, service and database.",
    body: `<form id="delete-app-form" data-form="delete-app" class="form-grid">
      <div class="error-banner">${icon("alert")}<div>This cannot be undone. Type <span class="mono">${esc(app.name)}</span> to confirm.</div></div>
      <div class="field"><label class="label" for="delete-confirm">App name</label><input class="input" id="delete-confirm" name="confirm" required autocomplete="off" placeholder="${esc(app.name)}" /></div>
      <div id="delete-app-error" class="error-banner hidden"></div>
    </form>`,
    footer: `<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-danger" type="submit" form="delete-app-form">${icon("trash")} Delete permanently</button>`,
  });
}

function openDeleteDatabase() {
  const db = state.database;
  showModal({
    title: "Delete database",
    subtitle: `Drop the ${db.engine} database for ${state.app.name}.`,
    body: `<div class="error-banner">${icon("alert")}<div>This permanently deletes the database and its data. The application will keep running until restarted.</div></div>`,
    footer: `<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-danger" data-action="confirm-delete-db">${icon("trash")} Delete database</button>`,
  });
}

function openCreateDatabase(engine) {
  showModal({
    title: `Create ${engine === "postgres" ? "PostgreSQL" : engine === "mysql" ? "MySQL" : "SQLite"} database`,
    subtitle: `Provision a database for ${state.app.name}.`,
    body: `<div class="info-banner">${icon("database")}<div>${engine === "sqlite" ? "A SQLite file will be created in the app's persistent shared directory." : `A local ${engine} database, user and generated password will be created on this server.`} Credentials are injected as <span class="mono">DATABASE_URL</span> on the next app restart.</div></div>`,
    footer: `<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="confirm-create-db" data-engine="${engine}">${icon("plus")} Create database</button>`,
  });
}

async function startDeploy(appName) {
  try {
    const data = await api(`/api/apps/${encodeURIComponent(appName)}/deploy`, { method: "POST" });
    toast("Deployment queued");
    if (state.app?.name === appName) {
      await loadApp(appName);
      renderAppView();
    }
    startPolling();
    openDeploymentLog(appName, data.deployment.id);
  } catch (error) {
    toastError(error);
  }
}

function appendTerminalLine(body, line) {
  const node = document.createElement("span");
  node.className = "log-line";
  if (/(^|\s)(error|failed|exception|fatal|ERR!)/i.test(line)) node.classList.add("log-err");
  else if (/^\$ /.test(line.replace(/^\[[^\]]+\]\s*/, "")) || /\[mock\] skipped/.test(line)) node.classList.add("log-cmd");
  else if (/success|listening|running|complete/i.test(line)) node.classList.add("log-ok");
  node.textContent = `${line}\n`;
  body.appendChild(node);
}

function scrollTerminal(body, force = false) {
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  if (force || nearBottom) body.scrollTop = body.scrollHeight;
}

function openDeploymentLog(appName, deploymentId) {
  const known = state.deployments.find((item) => item.id === Number(deploymentId));
  const initialStatus = known?.status || "queued";
  let eventSource;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    eventSource?.close();
  };
  showModal({
    title: `Deployment #${deploymentId}`,
    subtitle: `${appName} · live build output`,
    wide: true,
    onClose: cleanup,
    body: `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><div id="deploy-log-status">${statusPill(initialStatus)}</div><span class="hint" id="deploy-log-hint">Streaming</span></div>
      <div class="terminal"><div class="terminal-head"><div class="terminal-dots"><i></i><i></i><i></i></div><span id="deploy-log-title">${esc(appName)}</span><button class="btn btn-sm" data-action="copy" data-copy="" id="copy-log-btn" style="min-height:24px;padding:2px 7px">Copy</button></div><div class="terminal-body" id="deploy-log-body"><span class="hint">Waiting for output…</span></div></div>`,
    footer: `<button class="btn" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="refresh-app" data-name="${esc(appName)}">${icon("refresh")} Refresh app</button>`,
  });
  const body = $("#deploy-log-body");
  const hint = $("#deploy-log-hint");
  const statusNode = $("#deploy-log-status");
  body.textContent = "";
  let hasContent = false;
  const append = (line) => {
    if (!hasContent) {
      body.textContent = "";
      hasContent = true;
    }
    appendTerminalLine(body, line);
    scrollTerminal(body);
  };
  eventSource = new EventSource(`/api/apps/${encodeURIComponent(appName)}/deployments/${deploymentId}/stream`);
  eventSource.addEventListener("snapshot", (event) => {
    const data = JSON.parse(event.data);
    if (data.log) {
      body.textContent = data.log;
      hasContent = true;
      scrollTerminal(body, true);
    }
    const copyBtn = $("#copy-log-btn");
    if (copyBtn) copyBtn.dataset.copy = data.log || "";
  });
  eventSource.addEventListener("log", (event) => {
    const data = JSON.parse(event.data);
    if (data.line !== undefined) append(data.line);
    const copyBtn = $("#copy-log-btn");
    if (copyBtn) copyBtn.dataset.copy = body.textContent || "";
  });
  eventSource.addEventListener("done", async (event) => {
    const data = JSON.parse(event.data);
    statusNode.innerHTML = statusPill(data.status);
    hint.textContent = "Finished";
    cleanup();
    if (data.status === "running") toast(`${appName} deployed successfully`);
    else toast(`Deployment failed for ${appName}`, "error");
    setTimeout(() => void refreshAfterDeploy(appName), 650);
  });
  eventSource.onerror = () => {
    if (closed) return;
    hint.textContent = "Disconnected";
    append("[stream] Connection lost. Open the deployment log to reconnect.");
    cleanup();
  };
}

function openRuntimeLogs(appName) {
  let eventSource;
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    eventSource?.close();
  };
  showModal({
    title: "Runtime logs",
    subtitle: `${appName} · journalctl -f`,
    wide: true,
    onClose: cleanup,
    body: `<div class="terminal"><div class="terminal-head"><div class="terminal-dots"><i></i><i></i><i></i></div><span>${esc(appName)}</span><span class="hint">last 200 lines</span></div><div class="terminal-body" id="runtime-log-body"><span class="hint">Connecting…</span></div></div>`,
    footer: `<button class="btn" data-action="close-modal">Close</button>`,
  });
  const body = $("#runtime-log-body");
  body.textContent = "";
  eventSource = new EventSource(`/api/apps/${encodeURIComponent(appName)}/logs/stream`);
  eventSource.addEventListener("log", (event) => {
    const data = JSON.parse(event.data);
    appendTerminalLine(body, data.line);
    scrollTerminal(body);
  });
  eventSource.addEventListener("error", (event) => {
    if (!event.data) return;
    const data = JSON.parse(event.data);
    appendTerminalLine(body, `[error] ${data.message || "log stream failed"}`);
  });
  eventSource.addEventListener("done", () => {
    appendTerminalLine(body, "[stream] ended");
    cleanup();
  });
  eventSource.onerror = () => {
    if (closed) return;
    cleanup();
  };
}

async function refreshAfterDeploy(appName) {
  try {
    await loadShell();
    if (state.app?.name === appName) {
      await loadApp(appName);
      renderAppView();
    } else if (parseRoute().view === "apps") {
      renderAppsView();
    }
    if (!state.app || !["queued", "building", "starting"].includes(state.app.status)) stopPolling();
  } catch (error) {
    toastError(error);
  }
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(async () => {
    try {
      await loadShell();
      if (state.app && parseRoute().view === "app") {
        await loadApp(state.app.name);
        renderAppView();
      } else if (parseRoute().view === "apps") {
        renderAppsView();
      }
      const app = state.app;
      if (!app || !["queued", "building", "starting"].includes(app.status)) stopPolling();
    } catch {
      stopPolling();
    }
  }, 4000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function saveEnv(form) {
  const rows = $$(".env-row", form);
  const vars = {};
  for (const row of rows) {
    const key = $('input[name="env-key"]', row)?.value.trim() ?? "";
    const value = $('input[name="env-value"]', row)?.value ?? "";
    if (!key && !value) continue;
    if (!key) throw new Error("Every variable needs a name");
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid variable name: ${key}`);
    if (Object.prototype.hasOwnProperty.call(vars, key)) throw new Error(`Duplicate variable: ${key}`);
    vars[key] = value;
  }
  await api(`/api/apps/${encodeURIComponent(state.app.name)}/env`, { method: "PUT", body: { vars } });
  const refreshed = await api(`/api/apps/${encodeURIComponent(state.app.name)}/env`);
  state.env = refreshed.env || [];
  toast("Environment variables saved. Restart the app to apply them.");
  renderAppView();
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Could not copy to clipboard");
}

async function deleteKey(id) {
  await api(`/api/ssh-keys/${id}`, { method: "DELETE" });
  await loadKeys();
  renderKeysView();
  toast("SSH key removed");
}

async function deleteDatabase() {
  await api(`/api/apps/${encodeURIComponent(state.app.name)}/database`, { method: "DELETE" });
  closeModal();
  await loadApp(state.app.name);
  await loadShell();
  renderAppView();
  toast("Database deleted");
}

async function createDatabase(engine) {
  await api(`/api/apps/${encodeURIComponent(state.app.name)}/database`, { method: "POST", body: { engine } });
  closeModal();
  await loadApp(state.app.name);
  await loadShell();
  renderAppView();
  toast("Database created. Restart the app to apply DATABASE_URL.");
}

async function appAction(action, name) {
  await api(`/api/apps/${encodeURIComponent(name)}/${action}`, { method: "POST" });
  await loadShell();
  if (state.app?.name === name) {
    await loadApp(name);
    renderAppView();
  }
  toast(action === "restart" ? "Application restarted" : action === "stop" ? "Application stopped" : "Application started");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const name = target.dataset.name;
  try {
    switch (action) {
      case "reload":
        window.location.reload();
        break;
      case "close-modal": {
        const backdrop = target.closest("[data-modal-backdrop]");
        if (target.hasAttribute("data-modal-backdrop") || backdrop || target.closest(".modal")) closeModal();
        break;
      }
      case "auth-login":
        event.preventDefault();
        renderAuth("login");
        break;
      case "toggle-sidebar":
        $("#sidebar")?.classList.toggle("open");
        break;
      case "logout":
        await api("/api/logout", { method: "POST" });
        state.user = null;
        state.app = null;
        stopPolling();
        renderAuth("login");
        break;
      case "refresh":
        await loadShell();
        await handleRoute();
        toast("Refreshed");
        break;
      case "new-app":
        openNewApp();
        break;
      case "app-source":
        if (target.dataset.source === "github" && !state.github?.configured) break;
        setNewAppSource(target.dataset.source);
        break;
      case "refresh-github-repos":
        await loadGithubRepositories(true);
        break;
      case "open-app":
        if (event.target.closest("button[data-action='deploy']")) return;
        navigate(`#/apps/${encodeURIComponent(name)}`);
        break;
      case "deploy":
        event.stopPropagation();
        await startDeploy(name);
        break;
      case "refresh-app":
        await refreshAfterDeploy(name);
        break;
      case "app-start":
      case "app-stop":
      case "app-restart":
        await appAction(action.replace("app-", ""), name);
        break;
      case "runtime-logs":
        openRuntimeLogs(name);
        break;
      case "tab":
        state.activeTab = target.dataset.tab;
        renderAppView();
        break;
      case "add-env": {
        const list = $("#env-list");
        if (list) {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = envRowTemplate();
          const row = wrapper.firstElementChild;
          list.appendChild(row);
          row.querySelector("input")?.focus();
        }
        break;
      }
      case "remove-env": {
        const row = target.closest(".env-row");
        if (row) {
          const list = $("#env-list");
          row.remove();
          if (list && !$(".env-row", list)) list.innerHTML = envRowTemplate();
        }
        break;
      }
      case "copy": {
        const value = target.dataset.copy || "";
        if (!value) {
          toast("Nothing to copy", "error");
          break;
        }
        await copyText(value);
        toast("Copied to clipboard");
        break;
      }
      case "open-log":
        openDeploymentLog(name, Number(target.dataset.id));
        break;
      case "delete-app":
        openDeleteApp();
        break;
      case "delete-key":
        if (window.confirm(`Remove SSH key "${target.dataset.name}"?`)) await deleteKey(Number(target.dataset.id));
        break;
      case "create-db":
        openCreateDatabase(target.dataset.engine);
        break;
      case "confirm-create-db":
        await createDatabase(target.dataset.engine);
        break;
      case "delete-db":
        openDeleteDatabase();
        break;
      case "confirm-delete-db":
        await deleteDatabase();
        break;
      case "reveal-db":
        state.showDbUrl = !state.showDbUrl;
        renderAppView();
        break;
      default:
        break;
    }
  } catch (error) {
    toastError(error);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-github-repo]")) handleGithubRepoChange();
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const submit = $('button[type="submit"]', form) || $('button[type="submit"]', $("#modal-root"));
  try {
    if (kind === "login" || kind === "setup") {
      clearFormError("auth-error");
      const data = new FormData(form);
      const username = String(data.get("username") || "").trim();
      const password = String(data.get("password") || "");
      if (kind === "setup" && password !== String(data.get("confirm") || "")) {
        formError("auth-error", "Passwords do not match");
        return;
      }
      setButtonBusy(submit, true, kind === "setup" ? "Creating…" : "Signing in…");
      const result = await api(kind === "setup" ? "/api/setup" : "/api/login", {
        method: "POST",
        body: { username, password },
      });
      state.user = result.user;
      await loadShell();
      window.location.hash = "#/apps";
      await handleRoute();
      toast(kind === "setup" ? "Account created" : "Signed in");
      return;
    }

    if (kind === "new-app") {
      clearFormError("new-app-error");
      setGithubSourceError("");
      const data = new FormData(form);
      let source;
      if (state.newAppSource === "github") {
        const repoSelect = $("#new-app-repo");
        const repoOption = repoSelect?.selectedOptions?.[0];
        const branch = String($("#new-app-branch")?.value || "").trim();
        if (!state.github?.configured) {
          formError("new-app-error", "Configure the GitHub App before creating a GitHub app");
          return;
        }
        if (!repoOption?.value) {
          formError("new-app-error", "Select a GitHub repository");
          return;
        }
        if (!branch) {
          formError("new-app-error", "Select a branch to deploy");
          return;
        }
        source = {
          type: "github",
          installationId: Number(repoOption.dataset.installationId),
          repoId: Number(repoOption.value),
          branch,
        };
      }
      setButtonBusy(submit, true, state.newAppSource === "github" ? "Connecting." : "Creating.");
      const payload = {
        name: String(data.get("name") || "").trim(),
        domain: String(data.get("domain") || "").trim(),
      };
      if (source) payload.source = source;
      const result = await api("/api/apps", { method: "POST", body: payload });
      closeModal();
      state.githubRepos = null;
      await loadShell();
      toast(
        result.app.source_type === "github"
          ? `Application ${result.app.name} created; first deployment queued`
          : `Application ${result.app.name} created`,
      );
      window.location.hash = `#/apps/${encodeURIComponent(result.app.name)}`;
      return;
    }

    if (kind === "env") {
      clearFormError("env-error");
      setButtonBusy(submit, true, "Saving…");
      await saveEnv(form);
      return;
    }

    if (kind === "app-settings") {
      clearFormError("settings-error");
      const data = new FormData(form);
      const memoryRaw = String(data.get("memoryMb") || "").trim();
      setButtonBusy(submit, true, "Saving…");
      const result = await api(`/api/apps/${encodeURIComponent(state.app.name)}`, {
        method: "PATCH",
        body: {
          domain: String(data.get("domain") || "").trim(),
          memoryMb: memoryRaw ? Number(memoryRaw) : null,
          installCmd: String(data.get("installCmd") || "").trim(),
          buildCmd: String(data.get("buildCmd") || "").trim(),
          startCmd: String(data.get("startCmd") || "").trim(),
        },
      });
      state.app = result.app;
      await loadShell();
      renderAppView();
      toast("Settings saved. Command and memory changes apply on the next deploy.");
      return;
    }

    if (kind === "add-key") {
      clearFormError("key-error");
      const data = new FormData(form);
      setButtonBusy(submit, true, "Adding…");
      const result = await api("/api/ssh-keys", {
        method: "POST",
        body: {
          name: String(data.get("name") || "").trim(),
          publicKey: String(data.get("publicKey") || "").trim(),
        },
      });
      state.keys = result.keys || [];
      form.reset();
      renderKeysView();
      toast("SSH key added");
      return;
    }

    if (kind === "delete-app") {
      clearFormError("delete-app-error");
      const data = new FormData(form);
      const confirm = String(data.get("confirm") || "").trim();
      if (confirm !== state.app.name) {
        formError("delete-app-error", "Type the app name exactly to confirm");
        return;
      }
      setButtonBusy(submit, true, "Deleting…");
      await api(`/api/apps/${encodeURIComponent(state.app.name)}`, { method: "DELETE", body: { confirm } });
      closeModal();
      toast("Application deleted");
      state.app = null;
      await loadShell();
      window.location.hash = "#/apps";
      return;
    }
  } catch (error) {
    const map = {
      login: "auth-error",
      setup: "auth-error",
      "new-app": "new-app-error",
      env: "env-error",
      "app-settings": "settings-error",
      "add-key": "key-error",
      "delete-app": "delete-app-error",
    };
    const id = map[kind];
    if (id) formError(id, error instanceof Error ? error.message : String(error));
    else toastError(error);
  } finally {
    setButtonBusy(submit, false);
  }
});

document.addEventListener("click", (event) => {
  if (event.target.matches("[data-modal-backdrop]")) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#modal-root").firstElementChild) closeModal();
  if (event.key === "Enter" && event.target.matches(".app-card")) {
    event.target.click();
  }
});

window.addEventListener("hashchange", () => {
  void handleRoute();
});

async function boot() {
  renderLoading();
  try {
    const auth = await api("/api/auth");
    if (auth.setupRequired) {
      renderAuth("setup");
      return;
    }
    state.user = auth.user;
    await loadShell();
    await handleRoute();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      renderAuth("login");
      return;
    }
    renderFatal(error);
  }
}

boot();
