# Network Manager

A web application for inventorying network devices (servers, workstations, routers, switches), storing and parsing command outputs, and visualizing your network as an interactive diagram.

## Features

- **Device Management** — CRUD for servers, workstations, routers, and switches with multiple IP addresses, MAC, OS, location, and notes
- **Subnet Organization** — Group devices by subnet with CIDR and VLAN tracking
- **Command Output Parsing** — Paste output from `ps aux`, `netstat`/`ss`, `last`, or `ip a` and get structured, searchable tables (servers only)
- **Freeform Notes** — Manual text field for any other command output or documentation
- **Interactive Network Diagram** — Drag-and-drop React Flow canvas with device nodes, subnet grouping, and connection edges that persist across sessions

## Requirements

- **Node.js** 20+ (tested with v20.20.0)
- **npm** 10+ (comes with Node.js)
- No external database server needed — uses embedded SQLite

## Quick Start (Development)

```bash
# Clone the repo
git clone https://example.com
cd network-manager

# Install dependencies
npm install

# Start dev servers (API on :3001, UI on :5173)
npm run dev
```

Open http://localhost:5173 in your browser. The Vite dev server proxies API requests to the Express backend automatically.

## Production Setup

### 1. Install Node.js

On Ubuntu/Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Or via nvm (no root required):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
```

### 2. Clone and build

```bash
git clone https://example.com
cd network-manager
npm install
npm run build
```

### 3. Run the server

```bash
NODE_ENV=production node server/dist/index.js
```

This serves both the API and the built frontend on a single port. By default the server listens on port **3001** on all interfaces.

To change the port:
```bash
PORT=8080 NODE_ENV=production node server/dist/index.js
```

### 4. Run as a systemd service (optional)

Create `/etc/systemd/system/network-manager.service`:

```ini
[Unit]
Description=Network Manager Web App
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/path/to/network-manager
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

If using nvm, replace `/usr/bin/node` with the full path from `which node` (e.g. `/home/user/.nvm/versions/node/v20.20.0/bin/node`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable network-manager
sudo systemctl start network-manager
```

### 5. HTTPS setup (optional)

The server supports HTTPS natively via the `SSL_CERT` and `SSL_KEY` environment variables.

**Generate a self-signed certificate** (for local/internal use):
```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout server.key -out server.crt \
  -days 365 -subj "/CN=localhost"
```

**Run the server with HTTPS:**
```bash
SSL_CERT=./server.crt SSL_KEY=./server.key NODE_ENV=production node server/dist/index.js
```

By default the HTTPS server listens on port **3443**. To change it:
```bash
SSL_PORT=8443 SSL_CERT=./server.crt SSL_KEY=./server.key NODE_ENV=production node server/dist/index.js
```

**systemd service with HTTPS** — example unit file at `/etc/systemd/system/network-manager.service`:
```ini
[Unit]
Description=Network Manager Web App
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/path/to/network-manager
Environment=NODE_ENV=production
Environment=SSL_CERT=/path/to/server.crt
Environment=SSL_KEY=/path/to/server.key
Environment=SSL_PORT=3443
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

If using nvm, replace `/usr/bin/node` with the full path from `which node`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable network-manager
sudo systemctl start network-manager
```

For production use with real certificates, use [Let's Encrypt](https://letsencrypt.org/) (via certbot) and point `SSL_CERT` / `SSL_KEY` to the generated fullchain and privkey files.

### 6. Reverse proxy with nginx (optional)

To serve on port 80/443 behind nginx:

```nginx
server {
    listen 80;
    server_name network.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Development mode with a reverse proxy

If running in **development mode** (`npm run dev`) behind a reverse proxy with a custom domain, Vite will reject requests with a "disallowed host" error and prompt you to add the domain to `server.allowedHosts` in `vite.config.ts`.

Fix: set the `VITE_ALLOWED_HOST` environment variable to your domain before starting:

```bash
VITE_ALLOWED_HOST=network.example.com npm run dev
```

Or add it permanently in `client/vite.config.ts` under the `server` block:

```ts
server: {
  allowedHosts: ['network.example.com'],
  // ...
}
```

If you used `scripts/setup.sh` to create a systemd service, re-run it and enter your domain at the **"Custom domain"** prompt — it will inject `VITE_ALLOWED_HOST` into the service automatically.

> **Note:** This only applies in development mode. In production, Express serves the compiled client directly and there is no Vite host check.

## Data Storage

The SQLite database is stored at `server/data/network.db`. It is created automatically on first run. The database schema is applied via migrations on startup — no manual setup needed.

To back up your data, copy the `server/data/network.db` file while the server is stopped (or use `sqlite3 network.db ".backup backup.db"` while running).

## Project Structure

```
network-manager/
├── shared/       # TypeScript types shared between client and server
├── server/       # Express API + SQLite + command output parsers
├── client/       # React + Vite frontend with React Flow diagram
└── package.json  # npm workspaces root
```
