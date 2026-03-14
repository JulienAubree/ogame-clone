# Déploiement VPS — Spec

## Objectif

Déployer l'OGame clone sur un VPS bare metal (Node 22) accessible en HTTP sur l'IP directe. Premier déploiement en production.

## Infra cible

- **VPS** : bare metal, Node 22, Linux
- **PostgreSQL** : installé nativement sur le VPS
- **Redis** : installé nativement sur le VPS
- **Caddy** : reverse proxy, sert le frontend statique, proxy `/trpc` et `/sse` vers l'API
- **PM2** : process manager pour l'API et le worker
- **Git** : repo GitHub, le VPS clone et pull pour déployer

## Architecture

```
Client → :80 → Caddy
                ├── /* → fichiers statiques (apps/web/dist)
                ├── /trpc/* → reverse_proxy localhost:3000
                └── /sse → reverse_proxy localhost:3000

PM2 manage :
  ├── ogame-api    → node apps/api/dist/index.js
  └── ogame-worker → node apps/api/dist/workers/worker.js

Services natifs :
  ├── PostgreSQL :5432
  └── Redis :6379
```

## Fichiers à créer

### `ecosystem.config.cjs`

Config PM2 à la racine du projet. CommonJS car PM2 ne supporte pas ESM.

```javascript
module.exports = {
  apps: [
    {
      name: 'ogame-api',
      script: 'apps/api/dist/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'ogame-worker',
      script: 'apps/api/dist/workers/worker.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
```

Note : les variables d'environnement de production (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.) seront dans un fichier `.env` sur le VPS, chargé par PM2 via `env_file` ou sourcé dans le deploy script. On ne met PAS les secrets dans `ecosystem.config.cjs`.

### `Caddyfile`

Config Caddy pour IP directe (HTTP, pas de SSL) :

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

    # SPA fallback — toutes les routes non-fichier → index.html
    try_files {path} /index.html
}
```

Note : `flush_interval -1` sur `/sse` désactive le buffering pour que les Server-Sent Events passent en temps réel.

### `scripts/setup-vps.sh`

Script de setup initial à lancer une seule fois sur le VPS (en root ou sudo). Installe PostgreSQL, Redis, Caddy, pnpm, PM2, crée la DB et l'utilisateur.

Actions :
1. Installer PostgreSQL 16
2. Créer la base `ogame` et l'utilisateur `ogame` avec mot de passe
3. Installer Redis
4. Installer Caddy
5. Installer pnpm globalement
6. Installer PM2 globalement (`npm install -g pm2`)
7. Cloner le repo dans `/opt/ogame-clone`
8. Créer le fichier `.env` à partir de `.env.example` (l'utilisateur remplit les valeurs)
9. Copier le `Caddyfile` dans `/etc/caddy/Caddyfile` et reload Caddy

Le script sera interactif pour le mot de passe PostgreSQL et le JWT_SECRET.

### `scripts/deploy.sh`

Script de déploiement à lancer à chaque update :

```bash
#!/bin/bash
set -e

cd /opt/ogame-clone

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building..."
pnpm build

echo "==> Pushing database schema..."
cd packages/db
pnpm db:push
cd ../..

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs

echo "==> Done!"
```

Note : on utilise `db:push` (pas de migrations) comme en dev. C'est acceptable pour un premier déploiement. On passera aux migrations (`db:generate` + `db:migrate`) quand on aura des données en prod à préserver.

## Fichiers à modifier

### `.env.example`

Ajouter un commentaire pour les valeurs de production :

```
# Database
DATABASE_URL=postgresql://ogame:ogame@localhost:5432/ogame

# Redis
REDIS_URL=redis://localhost:6379

# Auth — CHANGER EN PRODUCTION
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Server
API_PORT=3000
NODE_ENV=development
```

Supprimer `WEB_PORT` (le frontend est servi par Caddy en prod, pas par Vite).

### `.gitignore`

S'assurer que `.env` et `ecosystem.config.cjs` ne sont pas ignorés inutilement. `.env` est déjà ignoré (bien). `ecosystem.config.cjs` doit être versionné (il ne contient pas de secrets).

## Étape Git : création du repo GitHub

Avant le premier déploiement :
1. Créer le repo sur GitHub : `gh repo create julienaubree/ogame-clone --private --source=. --push`
2. Le VPS clonera depuis ce remote

## Flux de déploiement

### Premier déploiement

1. Créer le repo GitHub et push
2. SSH sur le VPS
3. Lancer `setup-vps.sh` (installe tout, clone le repo)
4. Éditer `/opt/ogame-clone/.env` avec les valeurs de prod (JWT_SECRET fort, mot de passe DB)
5. Lancer `deploy.sh` (build, push schema, start PM2)
6. Vérifier : `curl http://IP/health` → `{"status":"ok"}`
7. `pm2 save` pour persister la config PM2 au reboot
8. `pm2 startup` pour démarrer PM2 au boot du VPS

### Déploiements suivants

1. Push sur main depuis la machine locale
2. `ssh user@vps 'cd /opt/ogame-clone && ./scripts/deploy.sh'`

## Points d'attention

1. **Pas de SSL** pour l'instant (IP directe). Quand un domaine sera configuré, il suffira de remplacer `:80` par le domaine dans le Caddyfile — Caddy gère automatiquement Let's Encrypt.

2. **`db:push` en prod** : OK pour le premier déploiement et tant qu'on n'a pas de données critiques. Dès qu'il y aura des joueurs, on passera aux migrations Drizzle pour éviter la perte de données.

3. **Secrets** : le `.env` sur le VPS n'est jamais commité. Le `JWT_SECRET` doit être une chaîne aléatoire forte (32+ caractères).

4. **SSE et Caddy** : le `flush_interval -1` est crucial sinon Caddy bufferise les événements SSE.

5. **PM2 reload** : fait un zero-downtime reload (grace restart). Les connexions SSE existantes seront coupées mais le client EventSource reconnecte automatiquement.
