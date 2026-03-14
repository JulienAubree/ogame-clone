# Deployment VPS Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the OGame clone on a bare-metal VPS with PM2, Caddy, PostgreSQL, and Redis — accessible via HTTP on the server's IP.

**Architecture:** Caddy serves the static frontend and proxies API/SSE requests to Fastify. PM2 manages the API server and BullMQ worker as separate processes. PostgreSQL and Redis run as native services.

**Tech Stack:** PM2, Caddy, PostgreSQL 16, Redis 7, pnpm, Node 22

**Spec:** `docs/superpowers/specs/2026-03-14-deployment-vps.md`

---

## File Structure

**Create:**
- `ecosystem.config.cjs` — PM2 process configuration (api + worker)
- `Caddyfile` — Caddy reverse proxy config
- `scripts/setup-vps.sh` — One-time VPS setup script
- `scripts/deploy.sh` — Repeatable deployment script

**Modify:**
- `.env.example` — Clean up for production clarity

---

### Task 1: Create PM2 ecosystem config

**Files:**
- Create: `ecosystem.config.cjs`

- [ ] **Step 1: Create ecosystem.config.cjs**

Create `ecosystem.config.cjs` at the project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'ogame-api',
      script: 'apps/api/dist/index.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'ogame-worker',
      script: 'apps/api/dist/workers/worker.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
```

Note: `--env-file=.env` is a Node 22 native feature — loads the `.env` file without dotenv dependency. PM2 passes `node_args` to the Node process.

- [ ] **Step 2: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "chore: add PM2 ecosystem config for production"
```

---

### Task 2: Create Caddyfile

**Files:**
- Create: `Caddyfile`

- [ ] **Step 1: Create Caddyfile**

Create `Caddyfile` at the project root:

```caddyfile
:80 {
	root * /opt/ogame-clone/apps/web/dist
	file_server

	handle /trpc/* {
		reverse_proxy localhost:3000
	}

	handle /sse {
		reverse_proxy localhost:3000 {
			flush_interval -1
		}
	}

	handle /health {
		reverse_proxy localhost:3000
	}

	try_files {path} /index.html
}
```

Key details:
- `flush_interval -1` on `/sse` disables response buffering so SSE events stream in real-time
- `try_files {path} /index.html` is the SPA fallback — React Router handles client-side routes
- Static files from `apps/web/dist` are served directly by Caddy (fast, no Node involved)

- [ ] **Step 2: Commit**

```bash
git add Caddyfile
git commit -m "chore: add Caddyfile for production reverse proxy"
```

---

### Task 3: Create VPS setup script

**Files:**
- Create: `scripts/setup-vps.sh`

- [ ] **Step 1: Create scripts directory and setup script**

Create `scripts/setup-vps.sh`:

```bash
#!/bin/bash
set -e

# ============================================================
# OGame Clone — VPS Initial Setup
# Run once as root: sudo bash scripts/setup-vps.sh
# ============================================================

echo "========================================"
echo "  OGame Clone — VPS Setup"
echo "========================================"

# --- PostgreSQL 16 ---
echo ""
echo "==> Installing PostgreSQL 16..."
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib

echo "==> Configuring PostgreSQL..."
read -sp "Enter password for PostgreSQL user 'ogame': " DB_PASSWORD
echo ""

sudo -u postgres psql -c "CREATE USER ogame WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || echo "User ogame already exists"
sudo -u postgres psql -c "CREATE DATABASE ogame OWNER ogame;" 2>/dev/null || echo "Database ogame already exists"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ogame TO ogame;"

systemctl enable postgresql
systemctl start postgresql

# --- Redis ---
echo ""
echo "==> Installing Redis..."
apt-get install -y -qq redis-server

# Enable Redis to start on boot
systemctl enable redis-server
systemctl start redis-server

# --- Caddy ---
echo ""
echo "==> Installing Caddy..."
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy

# --- pnpm ---
echo ""
echo "==> Installing pnpm..."
npm install -g pnpm

# --- PM2 ---
echo ""
echo "==> Installing PM2..."
npm install -g pm2

# --- Clone repo ---
INSTALL_DIR="/opt/ogame-clone"
if [ ! -d "$INSTALL_DIR" ]; then
  echo ""
  read -p "Enter GitHub repo URL (e.g. git@github.com:user/ogame-clone.git): " REPO_URL
  echo "==> Cloning repo to ${INSTALL_DIR}..."
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  echo "==> ${INSTALL_DIR} already exists, skipping clone"
fi

# --- .env ---
echo ""
echo "==> Creating .env file..."
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  read -sp "Enter JWT_SECRET (32+ chars, random string): " JWT_SECRET
  echo ""

  cat > "${INSTALL_DIR}/.env" << EOF
DATABASE_URL=postgresql://ogame:${DB_PASSWORD}@localhost:5432/ogame
REDIS_URL=redis://localhost:6379
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
API_PORT=3000
NODE_ENV=production
EOF

  chmod 600 "${INSTALL_DIR}/.env"
  echo "==> .env created with restricted permissions"
else
  echo "==> .env already exists, skipping"
fi

# --- Caddy config ---
echo ""
echo "==> Installing Caddyfile..."
cp "${INSTALL_DIR}/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy

# --- PM2 startup ---
echo ""
echo "==> Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root | bash

echo ""
echo "========================================"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "    cd ${INSTALL_DIR}"
echo "    ./scripts/deploy.sh"
echo "========================================"
```

- [ ] **Step 2: Make it executable and commit**

```bash
chmod +x scripts/setup-vps.sh
git add scripts/setup-vps.sh
git commit -m "chore: add VPS setup script (PostgreSQL, Redis, Caddy, PM2)"
```

---

### Task 4: Create deploy script

**Files:**
- Create: `scripts/deploy.sh`

- [ ] **Step 1: Create deploy script**

Create `scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

# ============================================================
# OGame Clone — Deploy Script
# Run from project root: ./scripts/deploy.sh
# ============================================================

cd "$(dirname "$0")/.."

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building all packages..."
pnpm build

echo "==> Pushing database schema..."
cd packages/db
pnpm db:push
cd ../..

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs --update-env

echo "==> Saving PM2 process list..."
pm2 save

echo ""
echo "==> Deploy complete! Checking status..."
pm2 list
```

- [ ] **Step 2: Make it executable and commit**

```bash
chmod +x scripts/deploy.sh
git add scripts/deploy.sh
git commit -m "chore: add deploy script (pull, build, migrate, reload)"
```

---

### Task 5: Clean up .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example**

Remove `WEB_PORT` (not used in production — Caddy serves the frontend). Add production guidance comments:

```
# Database
DATABASE_URL=postgresql://ogame:ogame@localhost:5432/ogame

# Redis
REDIS_URL=redis://localhost:6379

# Auth — CHANGE IN PRODUCTION (use a random 32+ char string)
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Server
API_PORT=3000
NODE_ENV=development
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: clean up .env.example for production clarity"
```

---

### Task 6: Create GitHub repo and push

- [ ] **Step 1: Verify git status is clean**

Run: `git status`
Expected: nothing to commit, working tree clean

- [ ] **Step 2: Create private GitHub repo and push**

Run: `gh repo create julienaubree/ogame-clone --private --source=. --push`

This creates the repo on GitHub and pushes all existing commits.

- [ ] **Step 3: Verify**

Run: `gh repo view julienaubree/ogame-clone`
Expected: shows the repo info

---

### Task 7: Deploy on VPS

This task is manual — the user SSHs to the VPS and runs the scripts.

- [ ] **Step 1: SSH to VPS and run setup**

```bash
ssh user@VPS_IP
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/julienaubree/ogame-clone/main/scripts/setup-vps.sh)"
# OR: copy setup-vps.sh to the VPS and run it
```

Alternatively, if git is already available:
```bash
ssh user@VPS_IP
git clone git@github.com:julienaubree/ogame-clone.git /opt/ogame-clone
cd /opt/ogame-clone
sudo bash scripts/setup-vps.sh
```

- [ ] **Step 2: Run first deploy**

```bash
cd /opt/ogame-clone
./scripts/deploy.sh
```

- [ ] **Step 3: Verify**

```bash
# Check PM2 processes
pm2 list
# Expected: ogame-api (online), ogame-worker (online)

# Check API health
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

# Check via Caddy
curl http://VPS_IP/health
# Expected: same response

# Check frontend
curl -s http://VPS_IP/ | head -5
# Expected: HTML with <div id="root">
```
