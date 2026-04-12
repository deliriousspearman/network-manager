# Developer Documentation

This document describes how **Network Manager** is built: the architecture, the HTTP API, the data model, and the frontend. It is aimed at contributors who want to understand, modify, or extend the codebase. For installation and deployment see the [README](../README.md). For end-user guidance see [USER.md](USER.md).

## Table of Contents

1. [Overview](#1-overview)
2. [Repository Layout](#2-repository-layout)
3. [Local Development](#3-local-development)
4. [Backend Architecture](#4-backend-architecture)
5. [Database Layer](#5-database-layer)
6. [HTTP API Reference](#6-http-api-reference)
7. [Parser System](#7-parser-system)
8. [Shared Types](#8-shared-types)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Frontend Data Fetching](#10-frontend-data-fetching)
11. [Network Diagram](#11-network-diagram)
12. [Custom Hooks](#12-custom-hooks)
13. [Build & TypeScript](#13-build--typescript)
14. [Testing](#14-testing)
15. [Adding Features (Cookbook)](#15-adding-features-cookbook)

---

## 1. Overview

Network Manager is a self-hosted web application for inventorying network devices, storing structured command output, and visualising the network as an interactive diagram. Everything runs in a single Node.js process with an embedded SQLite database — no external services are required.

The repo is an npm workspaces monorepo with three packages:

```
network-manager/
├── shared/     # TypeScript type definitions, imported by both client and server
├── server/     # Express + better-sqlite3 API, ESM modules
├── client/     # React 18 + Vite SPA with React Flow diagram
└── package.json
```

### Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 6 |
| Router | React Router v6 (code-split with `lazy()`) |
| Async state | TanStack Query v5 (30 s stale time, 1 retry) |
| Diagram canvas | `@xyflow/react` v12 |
| Icons | Lucide React |
| HTML sanitisation | DOMPurify (client) + sanitize-html (server) |
| Backend framework | Express |
| Database | SQLite via `better-sqlite3` (WAL mode, FKs on) |
| Security | helmet, cors, express-rate-limit |
| Shared types | Plain `.ts` file imported by both sides |
| Test runner | Vitest |

---

## 2. Repository Layout

```
network-manager/
├── shared/
│   └── types.ts              # Single source of truth for all shared types
├── server/
│   ├── src/
│   │   ├── index.ts          # HTTP/HTTPS bootstrap
│   │   ├── app.ts            # Express app (exported for tests)
│   │   ├── validation.ts     # requireString / requireInt / validateColor / …
│   │   ├── sanitizeHtml.ts   # sanitizeRichText / stripHtml
│   │   ├── db/
│   │   │   ├── connection.ts         # SQLite init + auto-migrate
│   │   │   ├── readonlyConnection.ts # Read-only handle for the SQL Query feature
│   │   │   ├── activityLog.ts        # logActivity()
│   │   │   └── migrations/           # .sql files, run alphabetically on startup
│   │   ├── middleware/
│   │   │   ├── asyncHandler.ts       # async/sync error wrapper
│   │   │   └── projectScope.ts       # validates :projectId
│   │   ├── parsers/                  # ps, netstat, last, ip_a, ip_r, mount, systemctl, arp
│   │   ├── routes/                   # 24 router modules, one per resource
│   │   └── utils/cidr.ts             # isValidCidr()
│   └── data/network.db       # Created on first run
├── client/
│   ├── src/
│   │   ├── main.tsx          # React mount + provider stack
│   │   ├── App.tsx           # Route table
│   │   ├── api/              # Fetch wrappers, one file per resource
│   │   ├── components/
│   │   │   ├── layout/       # AppShell, Sidebar, ProjectLayout, Breadcrumb …
│   │   │   ├── devices/      # DeviceList / Detail / Form + section components
│   │   │   ├── subnets/
│   │   │   ├── credentials/
│   │   │   ├── agents/
│   │   │   ├── diagram/      # NetworkDiagram, node types, PropertiesPanel …
│   │   │   ├── commands/     # CommandSection + parsed-row tables
│   │   │   ├── overview/
│   │   │   ├── timeline/
│   │   │   ├── query/
│   │   │   ├── logs/
│   │   │   ├── settings/
│   │   │   ├── admin/
│   │   │   └── ui/           # ConfirmDialog, InputDialog, Toast, SearchModal, …
│   │   ├── contexts/         # ProjectContext
│   │   ├── hooks/            # useUnsavedChanges, useFocusTrap
│   │   └── utils/            # storage.ts, apiError.ts, …
│   └── vite.config.ts
├── CLAUDE.md                 # Short notes for AI assistants
├── tsconfig.base.json        # Shared TS config
├── vitest.config.ts          # Shared test config
└── package.json              # Workspaces root
```

---

## 3. Local Development

Installation and run commands live in the [README](../README.md). This section covers the day-to-day workflow.

### Building and testing

```bash
# Requires Node 20+ (via nvm: export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh")
npm run build        # tsc (server) + vite build (client)
npm test             # vitest run
npm run test:watch   # vitest watch mode
```

### Dev service

There is a systemd user unit on the maintainer's dev box. When it is active, prefer `systemctl --user` over `npm run dev`:

```bash
systemctl --user status network-manager
systemctl --user restart network-manager    # after code changes
systemctl --user stop network-manager
systemctl --user start network-manager
```

Use `npm run …` only for commands not covered by the unit (`npm run build`, `npm install`, etc.).

### Dev ports

- **API** — `http://localhost:3001`
- **Vite dev server** — `http://localhost:8080` (listens on `0.0.0.0`)
- Vite proxies `/api/*` to `http://localhost:3001` (see [client/vite.config.ts](../client/vite.config.ts)), so the browser only needs to hit one port.

---

## 4. Backend Architecture

### Entry points

- [server/src/index.ts](../server/src/index.ts) is the bootstrap script. It creates an HTTP server on `PORT` (default `3001`), and additionally an HTTPS server on `SSL_PORT` (default `3443`) if `SSL_CERT` and `SSL_KEY` are set.
- [server/src/app.ts](../server/src/app.ts) defines the Express app itself. It is exported separately so tests can mount routes against a fresh instance without starting a listener.

The server package is ESM (`"type": "module"`), so intra-package imports use `.js` extensions even though the files are `.ts`. This is required by Node/tsx in ESM mode.

### Middleware stack

The order in [server/src/app.ts](../server/src/app.ts) is:

1. **helmet** — security headers. CSP is **only enabled in production**, because the Vite dev server injects inline scripts and an HMR websocket that would violate a strict policy. `crossOriginResourcePolicy` is set to `cross-origin` so the API (`:3001`) can serve images to the Vite client (`:8080` / `:5173`).
2. **cors** — allowlist with a default of `http://localhost:5173`, `http://localhost:8080`, `http://localhost:3001`. Override via the `ALLOWED_ORIGINS` env (comma-separated, `*.example.com` wildcards supported). Requests with no `Origin` header are rejected in production unless `ALLOW_NO_ORIGIN=1` is set — this prevents non-browser clients (curl, internal scripts) from silently bypassing the allowlist.
3. **Rate limiters** — `apiLimiter`: 200 req/min applied to all of `/api/`; `uploadLimiter`: 20 req/min applied only to upload-heavy routes (backup, credentials, images, attachments, diagram-icons, image-library, import).
4. **Body parsers** — default `express.json({ limit: '1mb' })`, or `10mb` for paths containing `/diagram`, `/credentials`, `/backup`, `/images`, `/attachments`, `/diagram-icons`, `/image-library`, `/import`. The selector is a tiny middleware that looks at `req.path` by substring.
5. **Routers** — top-level routes first (`/api/projects`, `/api/backup`, `/api/settings`, `/api/admin/logs`), then project-scoped routes under `/api/projects/:projectId/...`, each passing through `projectScope` middleware first.
6. **Global error handler** — catches any thrown error, logs it, and returns `500 Internal server error` if headers haven't been sent.
7. **Static client** — in production only, serves `client/dist` with an SPA fallback (`app.get('*', …)`) so client-side routes work on reload.

### Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` enables CSP and strict CORS no-origin checks |
| `PORT` | HTTP port (default `3001`) |
| `SSL_CERT` / `SSL_KEY` | Paths to cert and key — enables the HTTPS listener |
| `SSL_PORT` | HTTPS port (default `3443`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (overrides defaults) |
| `ALLOW_NO_ORIGIN` | Set to `1` to allow no-origin requests in production |

### HTML sanitisation

[server/src/sanitizeHtml.ts](../server/src/sanitizeHtml.ts) exports two helpers used before any user-provided HTML hits the database:

- `sanitizeRichText(input)` — keeps an allowlist of formatting tags (`p`, `b`, `i`, `h1`–`h6`, `ul`, `ol`, `li`, `table`, `pre`, `code`, `blockquote`, …) and safe inline styles (`color`, `background-color`, `text-align`, `font-*`, etc.). No anchors, no protocols. Disallowed tags are stripped, not escaped.
- `stripHtml(input)` — removes all HTML, used for plain-text fields like `about_title`.

The client already runs DOMPurify before sending, but the server version is the authoritative check — anyone hitting the API directly still has to go through it.

### Other utilities

- [server/src/validation.ts](../server/src/validation.ts) — `requireString`, `optionalString`, `requireOneOf`, `optionalOneOf`, `requireInt`, `optionalInt`, `validateColor`, `validateMac`, `sanitizeFilename`, and a `ValidationError` class. Route handlers wrap themselves in `asyncHandler()`, which turns a thrown `ValidationError` into a `400` response.
- [server/src/utils/cidr.ts](../server/src/utils/cidr.ts) — `isValidCidr(cidr)` validates IPv4 (0–32 prefix) and IPv6 (0–128 prefix).
- [server/src/db/activityLog.ts](../server/src/db/activityLog.ts) — `logActivity({ projectId, action, resourceType, resourceId, resourceName, details })`. Wrapped in a try/catch so a logging failure never takes down a request.
- [server/src/middleware/asyncHandler.ts](../server/src/middleware/asyncHandler.ts) — async/sync wrapper that forwards errors to the global handler and short-circuits `ValidationError` to a `400` JSON response.
- [server/src/middleware/projectScope.ts](../server/src/middleware/projectScope.ts) — validates `:projectId` exists and stores the numeric value on `res.locals.projectId`. Returns `404` if the project doesn't exist.

---

## 5. Database Layer

### Connection

[server/src/db/connection.ts](../server/src/db/connection.ts) opens `server/data/network.db` via `better-sqlite3` with these pragmas:

- `journal_mode = WAL` — concurrent readers while a writer is in progress
- `foreign_keys = ON` — enforce referential integrity
- `busy_timeout = 5000` — 5 s wait on lock contention

Because `better-sqlite3` is synchronous, module-level `db.prepare(...)` calls in route files are fine — the migration runner at the bottom of `connection.ts` runs **before** the module exports `db`, so every table is guaranteed to exist by the time routes are imported.

A second handle is opened by [server/src/db/readonlyConnection.ts](../server/src/db/readonlyConnection.ts) with `readonly: true`. This is used exclusively by the [SQL Query route](#sql-query) so a user's ad-hoc `SELECT` can't accidentally mutate data even if a regex gets bypassed.

### Migrations

`.sql` files live under [server/src/db/migrations/](../server/src/db/migrations/) and are run alphabetically on startup. Each file is tracked in a `schema_migrations` table (`filename`, `applied_at`) so it only runs once. To add a new migration, drop a new file with the next numeric prefix (e.g. `048_my_change.sql`) — it will be picked up on the next restart.

The current set includes foundational tables (`projects`, `devices`, `subnets`, `connections`, `device_ips`, `command_outputs`, parsed tables), the multi-tenant `project_id` FK added in `012_projects.sql`, and later additions like `diagram_views`, `device_ports`, `device_attachments`, `activity_logs`, `timeline_entries`, `agents`, etc. The latest migration at the time of writing is `047_agents.sql`.

### Entity map

**Projects** are the multi-tenant root. Every other entity carries a `project_id` foreign key, and the `projectScope` middleware blocks cross-project access.

Core entities:

- `projects` — name, slug, short_name, description (rich HTML), about_title (plain)
- `devices` — name, type, mac_address, os, hostname, domain, location, notes, rich_notes, subnet_id, hosting_type, hypervisor_id, section_config (JSON), av, status
- `device_ips` — device_id, ip_address, label, is_primary
- `device_tags`, `device_subnets` (many-to-many), `device_ports`, `device_images`, `device_attachments`
- `subnets` — name, cidr, vlan_id, description
- `connections` — source/target device_id + subnet_id, label, connection_type, edge_type, handles, ports, edge/label colours and widths
- `credentials` — host, username, password, type (`SSH`/`RDP`/`HTTP`/`SNMP`/`SQL`/`VPN`/`SSH Key`/`Other`), source, optional file (`file_name`, `file_data`), `used`, `hidden`
- `command_outputs` + parsed sibling tables: `parsed_processes`, `parsed_connections`, `parsed_logins`, `parsed_interfaces`, `parsed_mounts`, `parsed_routes`, `parsed_services`, `parsed_arp`
- `agents` — name, agent_type, device_id, checkin_schedule, config, disk_path, status, version, notes
- `timeline_entries` — title, description, category, event_date
- `activity_logs` — action, resource_type, resource_id, resource_name, details (JSON), created_at

Diagram storage is split from entity storage so a device can exist without being on the diagram:

- `diagram_views` — named layouts per project (`is_default` marks the initial view)
- `diagram_positions`, `subnet_diagram_positions` — `{view_id, entity_id, x, y, [width, height]}`
- `diagram_annotations`, `diagram_images` — view-scoped text and image overlays
- `node_preferences` — per-node styling JSON (border/fill/label colours, border style/width/radius, favourite, custom icon)
- `device_icon_overrides`, `device_type_icons`, `image_library` — binary uploads

Other tables:

- `highlight_rules` — keyword → colour rules applied to command output viewers
- `app_settings` — singleton key/value store for timezone and notification-bar config
- `schema_migrations` — internal migration tracker

### Multi-tenancy

All project-scoped routes go through [`projectScope`](../server/src/middleware/projectScope.ts), which verifies the `:projectId` exists and stores it on `res.locals.projectId`. Every SQL statement in a route file then filters by `project_id = ?` using this value. There is no user/auth layer — a deployment is expected to run behind its own authentication (e.g. a reverse proxy).

---

## 6. HTTP API Reference

Base URL conventions:

- Top-level: `GET/POST /api/projects`, `/api/settings`, `/api/backup`, `/api/admin/logs`
- Project-scoped: everything else is prefixed with `/api/projects/:projectId/`

Paginated list endpoints accept `page`, `limit`, `search`, `sort`, `order` query parameters and return `{ items, total, page, limit, totalPages }`. Mutating endpoints return the affected row (or list of rows). `ValidationError` maps to `400`; missing projects map to `404`; the global error handler returns `500` for anything unhandled.

### Projects — [routes/projects.ts](../server/src/routes/projects.ts)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | List projects with device/subnet counts |
| GET | `/api/projects/:id` | Get a single project |
| GET | `/api/projects/:id/stats` | Counts for device / favourite / subnet / credential |
| GET | `/api/projects/by-slug/:slug` | Lookup by slug (used for `/p/:slug/…` client routes) |
| POST | `/api/projects` | Create — requires `name` and `slug`; description is rich HTML (sanitised) |
| PUT | `/api/projects/:id` | Update — enforces slug uniqueness |
| DELETE | `/api/projects/:id` | Cascade-delete all nested data. Refuses to delete the last remaining project. |

`short_name` is limited to 2 characters (used in the sidebar when collapsed). Slugs must be lowercase alphanumeric with hyphens.

### Devices — [routes/devices.ts](../server/src/routes/devices.ts)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects/:projectId/devices` | Paginated list with `search`, `sort`, `order` |
| GET | `/api/projects/:projectId/devices/hypervisors` | Hypervisors only (for VM form dropdowns) |
| GET | `/api/projects/:projectId/devices/:id` | Full detail incl. IPs, tags, VM children |
| POST | `/api/projects/:projectId/devices` | Create (with IPs + tags inline) |
| PUT | `/api/projects/:projectId/devices/:id` | Partial update |
| DELETE | `/api/projects/:projectId/devices/:id` | Cascades IPs, tags, ports, images, attachments |

Device type whitelist: `server`, `workstation`, `router`, `switch`, `nas`, `firewall`, `access_point`, `iot`, `camera`, `phone`. Hosting types: `baremetal`, `vm`, `hypervisor`. A hypervisor cannot host itself (migration `044` adds a check constraint). Creating a device with `ips[]` inserts them in a single transaction.

### Subnets — [routes/subnets.ts](../server/src/routes/subnets.ts)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects/:projectId/subnets` | Paginated list |
| GET | `/api/projects/:projectId/subnets/:id` | Detail with member devices |
| POST | `/api/projects/:projectId/subnets` | Create (validates CIDR via `isValidCidr`) |
| PUT | `/api/projects/:projectId/subnets/:id` | Partial update |
| DELETE | `/api/projects/:projectId/subnets/:id` | Cascade delete |

VLAN IDs are optional and must be `0–4094`.

### Connections — [routes/connections.ts](../server/src/routes/connections.ts)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects/:projectId/connections` | All connections with joined names |
| POST | `/api/projects/:projectId/connections` | Create device↔device, device↔subnet, or subnet↔subnet |
| PUT | `/api/projects/:projectId/connections/:id` | Update label, style, handles, ports |
| DELETE | `/api/projects/:projectId/connections/:id` | Delete |

Source and target can each be either a device or a subnet; the route verifies both endpoints belong to the project before inserting.

### Command Outputs — [routes/commandOutputs.ts](../server/src/routes/commandOutputs.ts)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects/:projectId/command-outputs/device/:deviceId` | List recent outputs (metadata only) |
| GET | `/api/projects/:projectId/command-outputs/:id` | Full output with parsed rows |
| POST | `/api/projects/:projectId/command-outputs` | Submit raw output. If `parse_output` is true and `command_type` is not `freeform`, the parser runs and parsed rows are inserted in the same transaction. |
| PATCH | `/api/projects/:projectId/command-outputs/:id` | Edit title / toggle `parse_output` |
| DELETE | `/api/projects/:projectId/command-outputs/:id` | Cascade-delete parsed rows |

Max `raw_output` size: 50 MB. Parse failures roll the whole transaction back and return `400` with the parser's error message.

### Credentials — [routes/credentials.ts](../server/src/routes/credentials.ts)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects/:projectId/credentials` | Paginated list with `used`, `hidden`, `search` filters; supports `?device_id=` |
| GET | `/api/projects/:projectId/credentials/:id` | Single row (password excluded) |
| GET | `/api/projects/:projectId/credentials/:id/file` | Download attached file |
| POST | `/api/projects/:projectId/credentials` | Create (with optional base64 file) |
| PUT | `/api/projects/:projectId/credentials/:id` | Update |
| PATCH | `/api/projects/:projectId/credentials/:id/hidden` | Toggle `hidden` flag |
| DELETE | `/api/projects/:projectId/credentials/:id` | Delete |

Type whitelist is `SSH`, `RDP`, `HTTP`, `SNMP`, `SQL`, `VPN`, `SSH Key`, `Other`. Max file size 5 MB, filenames sanitised.

### Diagram — [routes/diagram.ts](../server/src/routes/diagram.ts)

The main data fetch is `GET /api/projects/:projectId/diagram?view_id=...`, which returns everything the client needs to render one view: devices with positions, subnet groups with positions + sizes, connections, annotations, images, node preferences, and legend items.

Additional endpoints cover view management (`GET/POST/PUT/DELETE /diagram/views`), position persistence (`POST/PUT /diagram/positions` with batched `devices[]` + `subnets[]` arrays), annotations (`POST/PUT/DELETE /diagram/annotations`), diagram images (via `/diagram-icons/images` — see below), legend configuration (`PUT /diagram/legend`), node preferences (`PUT /diagram/node-preferences`), auto-layout (`POST /diagram/auto-generate`), and removing entities from a view without deleting them (`DELETE /diagram/device/:id`, `DELETE /diagram/subnet/:id`).

### Diagram Icons & Image Library — [routes/diagramIcons.ts](../server/src/routes/diagramIcons.ts), [routes/imageLibrary.ts](../server/src/routes/imageLibrary.ts)

`diagramIcons` handles per-project **type default** icons (one icon per device type) and per-device **overrides**, plus diagram images placed on the canvas. `imageLibrary` is a reusable pool of images (2 MB max each) that can be dropped onto any view.

### Highlight Rules — [routes/highlightRules.ts](../server/src/routes/highlightRules.ts)

CRUD over `{keyword, category, color, text_color}` rows used by the command-output viewer to colourise matches.

### Device sub-resources

- [routes/deviceImages.ts](../server/src/routes/deviceImages.ts) — gallery uploads, 5 MB each (`image/jpeg`, `png`, `gif`, `webp`, `svg+xml`)
- [routes/deviceAttachments.ts](../server/src/routes/deviceAttachments.ts) — arbitrary file uploads, 10 MB each
- [routes/devicePorts.ts](../server/src/routes/devicePorts.ts) — port_number (1–65535), state, service
- [routes/deviceSubnets.ts](../server/src/routes/deviceSubnets.ts) — add/remove device↔subnet many-to-many memberships

### Agents — [routes/agents.ts](../server/src/routes/agents.ts)

Paginated CRUD for monitoring/security agents. Types: `wazuh`, `zabbix`, `elk`, `prometheus`, `grafana`, `nagios`, `datadog`, `splunk`, `ossec`, `custom`. Statuses: `active`, `inactive`, `error`, `unknown`. Notes are HTML and run through `sanitizeRichText`.

### Timeline — [routes/timeline.ts](../server/src/routes/timeline.ts)

Paginated CRUD for `timeline_entries`. Categories are `general`, `decision`, `change`, `incident`, `milestone`, `note`.

### Activity Logs — [routes/activityLogs.ts](../server/src/routes/activityLogs.ts), [routes/adminLogs.ts](../server/src/routes/adminLogs.ts)

`/api/projects/:projectId/logs` lists project-scoped audit entries; `/api/admin/logs` lists them across **all** projects. Both support `search`, `resource_type`, `action` filters and pagination.

### Search — [routes/search.ts](../server/src/routes/search.ts)

`GET /api/projects/:projectId/search?q=...` returns the top matches across devices, subnets, credentials and agents. Powers the `Ctrl/Cmd+K` global search modal.

### SQL Query — [routes/sqlQuery.ts](../server/src/routes/sqlQuery.ts)

`POST /api/projects/:projectId/query` with `{ sql: "SELECT ..." }`. Runs on the read-only connection. Validation:

- SELECT only (regex blocks `INSERT`, `UPDATE`, `DELETE`, `DROP`, etc.)
- No multi-statement queries (semicolons rejected)
- Comments stripped before validation
- Max 1000 rows returned

### CSV Import — [routes/deviceCsvImport.ts](../server/src/routes/deviceCsvImport.ts)

`POST .../device-csv-import/preview` parses CSV and returns a validated row preview without writing. `POST .../device-csv-import/apply` performs the insert in a transaction. Columns: `name` (required), `type`, `ip_address`, `mac_address`, `os`, `hostname`, `domain`, `location`, `tags`.

### PCAP / ARP Import — [routes/deviceImport.ts](../server/src/routes/deviceImport.ts)

`POST .../import/pcap/analyze` parses a `.pcap`/`.pcapng` (base64, max 10 MB) and returns discovered hosts with IPs, MACs, ports and match candidates. `POST .../import/pcap/apply` applies per-host create/merge/skip actions. ARP uses the same flow via `/import/arp/*`.

### Backup — [routes/backup.ts](../server/src/routes/backup.ts)

- `GET /api/projects/:projectId/backup` — project-scoped JSON export (query params `includeCommandOutputs`, `includeCredentials`, `includeImages`)
- `GET /api/backup` — full database export across all projects
- `POST /api/projects/:projectId/backup` / `POST /api/backup` — import from a previously exported JSON

Imports are schema-validated and wrapped in a transaction.

### Settings — [routes/settings.ts](../server/src/routes/settings.ts)

Singleton `GET`/`PUT /api/settings` for the global `app_settings` key/value table. Keys: `timezone`, `notification_enabled`, `notification_text`, `notification_bg_color`, `notification_text_color`, `notification_height`, `notification_font_size`, `notification_bold`.

---

## 7. Parser System

Parsers live in [server/src/parsers/](../server/src/parsers/). Each parser is a pure function `(raw: string) => Row[]`. The registry at [server/src/parsers/index.ts](../server/src/parsers/index.ts) maps command-type strings to parser functions:

```ts
export const parsers: Record<string, (raw: string) => ParsedRow[]> = {
  ps: parsePs,
  netstat: parseNetstat,
  last: parseLast,
  ip_a: parseIpAddr,
  mount: parseMount,
  ip_r: parseIpRoute,
  systemctl_status: parseSystemctlStatus,
  arp: parseArp,
};
```

| Command | Input | Output row shape | Feeds |
|---|---|---|---|
| `ps` | `ps aux` | `{pid, user, cpu_percent, mem_percent, command}` | `parsed_processes` |
| `netstat` | `netstat -tulpn` or `ss -tulpn` | `{protocol, local_addr, foreign_addr, state, pid_program}` | `parsed_connections` |
| `last` | `last` | `{user, terminal, source_ip, login_time, duration}` | `parsed_logins` |
| `ip_a` | `ip a` / `ip addr` | `{interface_name, state, ip_addresses (JSON), mac_address}` | `parsed_interfaces` |
| `mount` | `mount` | `{device, mount_point, fs_type, options}` | `parsed_mounts` |
| `ip_r` | `ip r` / `ip route` | `{destination, gateway, device, protocol, scope, metric}` | `parsed_routes` |
| `systemctl_status` | `systemctl list-units --type=service` | `{unit_name, load, active, sub, description}` | `parsed_services` |
| `arp` | `arp -an`, `arp -a`, `arp -avn` | `{ip, mac, interface}` | `parsed_arp` |

`freeform` is a valid `CommandType` but is not in the registry — it stores raw text without parsing.

The [routes/commandOutputs.ts](../server/src/routes/commandOutputs.ts) `submitOutput` handler wraps the insert + parse in a single `db.transaction()`: if the parser throws, the transaction rolls back and the error message is returned to the client.

There are also helper parsers that don't live in the registry: [csv.ts](../server/src/parsers/csv.ts) is used by the CSV import route, and [pcap.ts](../server/src/parsers/pcap.ts) is used by the PCAP import route.

---

## 8. Shared Types

[shared/types.ts](../shared/types.ts) is the one place client and server agree on shapes. It exports:

**Enum unions** — `DeviceType`, `CommandType`, `ConnectionType`, `HostingType`, `CredentialType` (as a `const` tuple + type), `TimelineCategory`, `AgentType`, `AgentStatus`. Each enum that is displayed in the UI also exports a `*_LABELS` map (e.g. `DEVICE_TYPE_LABELS`).

**Core interfaces** — `Subnet`, `Device`, `DeviceIp`, `DeviceWithIps` (adds `ips`, `tags`, `subnet_name`, `primary_ip`, `credential_count`, `vms`), `Connection`, `Credential`, `CommandOutput`, `CommandOutputWithParsed`, and one `Parsed*` interface per parsed table. Diagram-specific shapes: `DiagramDeviceNode`, `DiagramSubnetNode`, `DiagramData`, `NodePrefs`, `DiagramView`, `DiagramAnnotation`, `DiagramImage`.

**Request types** — `CreateProjectRequest`, `UpdateProjectRequest`, `CreateDeviceRequest`, `CreateSubnetRequest`, `CreateConnectionRequest`, `CreateCredentialRequest`, `SubmitCommandOutputRequest`, `UpdateCommandOutputRequest`, `UpdatePositionsRequest`, `CreateTimelineEntryRequest`, `CreateAgentRequest`, `PcapAnalyzeResult`, `PcapApplyAction`.

**Settings / misc** — `AppSettings`, `ActivityLog`, `ProjectStats`, `HighlightRule`, `Project`, `Agent` / `AgentWithDevice`.

Both workspaces import this file directly — there is no build step for `shared/`.

---

## 9. Frontend Architecture

### Entry point and provider stack

[client/src/main.tsx](../client/src/main.tsx) builds the provider tree (outer → inner):

```
QueryClientProvider (staleTime: 30 s, retry: 1)
  BrowserRouter
    ErrorBoundary
      ConfirmDialogProvider
        InputDialogProvider
          ToastProvider
            App
            KeyboardShortcutsModal
```

### Routing

All routes are declared in [client/src/App.tsx](../client/src/App.tsx). Every page is code-split via `lazy()` and wrapped in a `SuspenseWrap` that renders a `LoadingSpinner`.

| Path | Component | Notes |
|---|---|---|
| `/` | `ProjectRedirect` | Redirects to the last-used project (from localStorage) |
| `/admin` | `AdminSettingsPage` | Global settings and project CRUD |
| `/admin/logs` | `AdminLogsPage` | System-wide activity logs |
| `/p/:projectSlug` | `ProjectLayout` | Project shell — all routes below live here |
| `  overview` | `OverviewPage` | Stats + description |
| `  agents`, `agents/new`, `agents/:id`, `agents/:id/edit` | `AgentList` / `AgentForm` / `AgentDetail` | |
| `  devices`, `devices/new`, `devices/:id`, `devices/:id/edit` | `DeviceList` / `DeviceForm` / `DeviceDetail` | |
| `  subnets`, `subnets/new`, `subnets/:id`, `subnets/:id/edit` | `SubnetList` / `SubnetForm` / `SubnetDetail` | |
| `  credentials` | `CredentialList` | |
| `  diagram` | `NetworkDiagram` | React Flow canvas |
| `  timeline` | `TimelinePage` | |
| `  query` | `QueryPage` | SQL query interface |
| `  settings` | `SettingsPage` | Project-level settings |
| `  logs` | `LogsPage` | Project activity log |

There are also legacy redirects (`/devices/*` → `/p/default/devices`, etc.) that map pre-multi-tenant URLs to the default project.

### Layout

- **AppShell** ([client/src/components/layout/AppShell.tsx](../client/src/components/layout/AppShell.tsx)) — renders the notification bar (driven by `app_settings`) and the sidebar, then the main content.
- **ProjectLayout** ([client/src/components/layout/ProjectLayout.tsx](../client/src/components/layout/ProjectLayout.tsx)) — wraps all project-scoped pages, loads the current project by slug, and provides it via `ProjectContext`.
- **Sidebar** — navigation, project switcher, theme toggle, collapsed mode.
- **Breadcrumb** — computes a path from the current route and entity names.

### Pages

Every page component sits under [client/src/components/](../client/src/components/) in a folder named after its feature area (`devices/`, `subnets/`, `agents/`, `credentials/`, `diagram/`, `timeline/`, `query/`, `logs/`, `settings/`, `admin/`, `overview/`). Each page is a typical React function component that calls a fetch wrapper from `client/src/api/` via `useQuery`, renders a table/form/detail view, and wires mutations via `useMutation`. Detail pages like `DeviceDetail` also compose a set of **section** components (notes, ports, gallery, attachments, credentials, command outputs) whose visibility and order are controlled by the device's `section_config` JSON.

### Shared UI primitives

Under [client/src/components/ui/](../client/src/components/ui/):

- **ConfirmDialog** — provider + `useConfirmDialog()` hook returning `(message, title?) => Promise<boolean>`. Used everywhere instead of `window.confirm`.
- **InputDialog** — same pattern for a single-line text prompt.
- **Toast** — `useToast()` hook: `(message, type?) => void` where type is `success | error | info`.
- **SearchModal** — global `Ctrl/Cmd+K` search against the `/search` endpoint.
- **KeyboardShortcutsModal** — `?` key opens it.
- **RichEditor** — contenteditable-based rich text editor used for notes, descriptions, timeline bodies. Output is sanitised server-side before storage.
- **ErrorBoundary**, **LoadingSpinner**, **Pagination**, **TableContextMenu**.

---

## 10. Frontend Data Fetching

### API wrappers

Every backend resource has a matching file under [client/src/api/](../client/src/api/) containing plain `fetch` wrappers that return typed data from [shared/types.ts](../shared/types.ts). They share two helpers:

- `projectBase(projectId, resource)` from [client/src/api/base.ts](../client/src/api/base.ts) builds `/api/projects/{projectId}/{resource}` paths.
- `throwApiError(res, fallback)` from [client/src/utils/apiError.ts](../client/src/utils/apiError.ts) throws a structured error if the response is not OK, pulling the server's error message when available.

There is no generated client and no third-party HTTP library — just `fetch`.

### TanStack Query conventions

Query key shape follows a consistent pattern so invalidation is predictable:

| Kind | Key |
|---|---|
| Paginated list | `['<resource>', projectId, 'paged', page, limit, search, sort, order]` |
| Full list | `['<resource>', projectId]` |
| Single item | `['<resource-singular>', projectId, id]` |
| Device-scoped list | `['<resource>', projectId, 'device', deviceId]` |
| Diagram | `['diagram', projectId, viewId]` |
| Project detail | `['project', slug]` or `['project-stats', projectId]` |
| Global | `['projects']`, `['app-settings']` |

Mutations call `queryClient.invalidateQueries({ queryKey: [...] })` on success to refresh any dependent lists. Paginated queries set `placeholderData: keepPreviousData` so the table doesn't flash empty between pages.

### State outside React Query

- **ProjectContext** ([client/src/contexts/ProjectContext.tsx](../client/src/contexts/ProjectContext.tsx)) — current project object and ID, set by `ProjectLayout`.
- **Dialog/Toast contexts** — described above.
- **localStorage** via [client/src/utils/storage.ts](../client/src/utils/storage.ts) — safe wrappers (`getStorage`, `setStorage`, `removeStorage`) used for:
  - `last-project-slug`
  - diagram viewport per project: `diagram-viewport-${slug}`
  - diagram UI toggles per project: `diagram-show-grid-${slug}`, `-show-edges-`, `-show-credentials-`, `-show-legend-`, `-show-minimap-`, `-select-mode-`
  - column visibility and order per list page
  - theme, colour picker history, search history

There is no Redux or Zustand.

---

## 11. Network Diagram

The diagram is implemented in [client/src/components/diagram/NetworkDiagram.tsx](../client/src/components/diagram/NetworkDiagram.tsx) using `@xyflow/react` v12. Note the import path — it is **not** the legacy `reactflow` package.

### Custom node types

The `nodeTypes` object registers one component per diagram node kind:

- **DeviceNode** — rendered for every `DeviceType` (`server`, `workstation`, `router`, `switch`, `nas`, `firewall`, `access_point`, `iot`, `camera`, `phone`). Shows icon, name, primary IP, status dot, credential indicator, favourite star. Has multiple connection handles on top and bottom to allow neat routing.
- **SubnetGroupNode** — subnet container. Uses React Flow's `NodeResizer` so it can be dragged to any size. Has handles on all four sides.
- **AnnotationNode** — free-form text label, editable inline.
- **ImageNode** — a standalone image placed on the canvas.

### Parent/child containment

Devices with a `subnet_id` get `parentId: "subnet-{subnet_id}"` and `extent: 'parent'` so they are visually and physically contained inside the subnet group. React Flow requires parent nodes to appear **before** child nodes in the `nodes` array; `toDiagramNodes()` ensures this ordering.

If a device has a subnet membership but is explicitly not contained (e.g. moved out of the group), a dashed grey **membership edge** is rendered instead to keep the relationship visible.

### Position persistence

Dragging a node triggers `onNodesChange`, which collects pending positions into `pendingPositionsRef` and sets a 500 ms debounce timer. On flush, a single batched `updatePositions(projectId, { devices, subnets }, viewId)` call writes everything at once — no per-node round-trips. Annotations and images are saved immediately because they change one row at a time.

### Node preferences

Per-node styling (border colour, background colour, label colour, border style / radius / width, favourite flag, custom icon) is stored in `node_preferences` as a JSON blob keyed by node ID. It is edited via the right-side **PropertiesPanel** and persisted via `updateNodePrefs(projectId, nodeId, prefs)`.

### Diagram views

A project can have multiple named views; each view has its own positions, annotations, images and node preferences. The active view is selected in the toolbar. The `diagram_views` table has an `is_default` flag for the initial view.

### Undo/redo

The `useUndoRedo` hook inside `NetworkDiagram.tsx` keeps a 50-entry history of `{ nodes, edges }` snapshots taken on drag start and structural changes. `Ctrl+Z` / `Ctrl+Shift+Z` step through them; positions are saved after every undo/redo.

### Import/export

`exportDiagram(projectId, viewId?)` downloads a JSON file of the current view. `importDiagram(projectId, data, viewId?)` matches devices and subnets by name, returning counts of matched vs unmatched entities so the user can see what was merged.

### Icons

Three layers of icon resolution:

1. **Built-in SVGs** for each `DeviceType`.
2. **Project type defaults** — a per-device-type icon uploaded via Project Settings, overriding the built-in.
3. **Per-device overrides** — a specific device can replace the icon regardless of type.

`NodePrefs.icon` can also hold an emoji or glyph chosen from the Properties Panel's icon palette.

---

## 12. Custom Hooks

- [client/src/hooks/useUnsavedChanges.ts](../client/src/hooks/useUnsavedChanges.ts) — registers a `beforeunload` listener while a form has a dirty state, so the browser warns on close/refresh. Used by `DeviceForm`, `SubnetForm`, and `AgentForm`.
- [client/src/hooks/useFocusTrap.ts](../client/src/hooks/useFocusTrap.ts) — returns a ref that constrains keyboard focus to the element's descendants. Used by every modal dialog.

---

## 13. Build & TypeScript

- [client/vite.config.ts](../client/vite.config.ts) — dev server on `0.0.0.0:8080`, proxies `/api/*` to `http://localhost:3001`, optionally sets `allowedHosts` from `VITE_ALLOWED_HOST` for reverse-proxy dev setups.
- [tsconfig.base.json](../tsconfig.base.json) — shared compiler options; each workspace has its own `tsconfig.json` that extends it. The client uses `jsx: "react-jsx"` (automatic runtime).
- `npm run build` runs `tsc` for the server (outputs to `server/dist/`) and `vite build` for the client (outputs to `client/dist/`). In production, the Express app serves `client/dist` directly with an SPA fallback.

---

## 14. Testing

Vitest is configured at [vitest.config.ts](../vitest.config.ts) at the repo root.

Server tests currently cover:

- [server/src/validation.test.ts](../server/src/validation.test.ts) — all input-validation helpers
- [server/src/utils/cidr.test.ts](../server/src/utils/cidr.test.ts) — CIDR validator (IPv4 + IPv6)
- [server/src/parsers/ps.test.ts](../server/src/parsers/ps.test.ts)
- [server/src/parsers/netstat.test.ts](../server/src/parsers/netstat.test.ts)
- [server/src/parsers/arp.test.ts](../server/src/parsers/arp.test.ts)
- [server/src/parsers/csv.test.ts](../server/src/parsers/csv.test.ts)

There are no client tests at present. Commands:

```bash
npm test            # run all tests once
npm run test:watch  # watch mode
```

---

## 15. Adding Features (Cookbook)

### A new resource (table → API → UI)

1. **Schema** — add a migration in [server/src/db/migrations/](../server/src/db/migrations/) with the next numeric prefix, including a `project_id` FK if it should be project-scoped.
2. **Types** — add an interface (and a `Create*Request` type) to [shared/types.ts](../shared/types.ts).
3. **Route** — create `server/src/routes/<resource>.ts` following the existing routers. Use `asyncHandler`, `requireString`/`requireInt`, `logActivity`, and `db.transaction()` where multi-row writes are involved. Mount it in [server/src/app.ts](../server/src/app.ts) behind `projectScope` if scoped.
4. **Client API** — add `client/src/api/<resource>.ts` with `fetch`-based wrappers and typed return values.
5. **Page** — create components under `client/src/components/<resource>/` and register the route in [client/src/App.tsx](../client/src/App.tsx).
6. **Sidebar** — add a nav entry in `Sidebar.tsx` if the user should be able to reach it.

### A new command parser

1. Write a pure function `(raw: string) => Row[]` in [server/src/parsers/](../server/src/parsers/) and export the row type.
2. Add a migration creating the `parsed_<name>` table (with `output_id` FK to `command_outputs.id`).
3. Register the parser in [server/src/parsers/index.ts](../server/src/parsers/index.ts).
4. Add the new value to the `CommandType` union in [shared/types.ts](../shared/types.ts) and to `CommandOutputWithParsed`.
5. Update `commandOutputs.ts` to insert the parsed rows into the new table.
6. Add a table component under `client/src/components/commands/` and wire it into `CommandSection`.
7. Write a Vitest file next to the parser with realistic fixtures.

### A new diagram node type

1. Create the component under [client/src/components/diagram/nodes/](../client/src/components/diagram/nodes/) and register it in the `nodeTypes` object inside `NetworkDiagram.tsx`.
2. If the type persists state, either reuse `node_preferences` or add a dedicated table + route.
3. Decide whether the node participates in connections — if so, place `Handle` components on it.
