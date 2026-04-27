# Runbook incidents — Exilium

Ce document décrit comment diagnostiquer et résoudre les incidents les plus probables en production. Destiné à l'admin solo.

**Principe général** : avant toute action destructive, faire un backup (`/opt/exilium/scripts/backup-postgres.sh`).

---

## Contacts & infra

- **VPS** : OVH, IP `51.83.45.246`, Ubuntu
- **Domaines** : `exilium-game.com`, `www.exilium-game.com`, `admin.exilium-game.com`, `staging.exilium-game.com`, `admin-staging.exilium-game.com`
- **DNS** : OVH (ns200.anycast.me)
- **Repo** : https://github.com/JulienAubree/exilium
- **Services système** : Caddy (TLS + reverse proxy), Postgres 17, Redis 7, PM2
- **Users PM2** : `exilium-api` (port 3000), `exilium-worker`, `exilium-api-staging` (port 3001), `exilium-worker-staging`

## Checks de santé

```bash
# Est-ce que le site répond ?
curl https://exilium-game.com/health

# État des process
pm2 list

# Taille logs / disque
du -sh /home/ubuntu/.pm2/logs /opt/backups /opt/exilium/uploads
df -h /

# RAM / CPU
free -h && uptime
```

---

## Incidents fréquents

### 🔴 Le site ne répond plus (HTTP 502 / 503 / timeout)

**Diagnostic** :
```bash
curl -v https://exilium-game.com/health
pm2 list
sudo systemctl status caddy
```

**Causes probables et remèdes** :

1. **exilium-api crashé ou en restart loop**
   - `pm2 logs exilium-api --err --lines 100` pour voir l'erreur
   - Si out-of-memory : augmenter `max_memory_restart` dans `ecosystem.config.cjs`, rebuild et `pm2 reload exilium-api`
   - Sinon : `pm2 restart exilium-api` et monitorer

2. **Postgres down**
   - `curl /health` retourne `checks.db.ok: false`
   - `sudo systemctl status postgresql` → `sudo systemctl restart postgresql`
   - Vérifier `/var/log/postgresql/` pour OOM ou corruption

3. **Redis down**
   - `checks.redis.ok: false` dans `/health`
   - `sudo systemctl restart redis` (ou `redis-server`)
   - Les flottes en vol n'avancent plus tant que Redis n'est pas revenu

4. **Caddy down**
   - `sudo systemctl status caddy` → `sudo systemctl restart caddy`
   - Si `Caddyfile` invalide : `sudo caddy validate --config /etc/caddy/Caddyfile`

### 🔴 Base de données corrompue ou perdue

**Priorité** : restaurer depuis le backup le plus récent (`/opt/backups/postgres/`).

```bash
# Identifier le dernier dump
ls -lht /opt/backups/postgres/ | head -5

# Pause l'API pour éviter des writes pendant la restore
pm2 stop exilium-api exilium-worker

# Drop + recreate + restore
sudo -u postgres psql -c "DROP DATABASE exilium;"
sudo -u postgres psql -c "CREATE DATABASE exilium OWNER exilium;"
PGPASSWORD=<...> pg_restore -h localhost -U exilium -d exilium --no-owner --no-acl /opt/backups/postgres/<dump>.dump

# Vérifier
PGPASSWORD=<...> psql -h localhost -U exilium -d exilium -c "SELECT count(*) FROM users;"

# Relancer
pm2 start exilium-api exilium-worker
curl https://exilium-game.com/health
```

**Perte max** : 24h (le cron quotidien tourne à 03:00 UTC). À améliorer avec backups plus fréquents si besoin.

### 🟠 Migration Drizzle cassée / schema drift

Ne JAMAIS rejouer les migrations sur prod depuis zéro (`apply-migrations.sh` est idempotent mais corromprait des données existantes).

**Workflow safe** :
1. Reproduire sur staging d'abord : `sudo /opt/exilium/scripts/refresh-staging-from-prod.sh` puis tester la migration
2. Si la migration passe sur staging, l'appliquer sur prod : `cd /opt/exilium && bash scripts/apply-migrations.sh`
3. Si elle échoue sur staging : investiguer, fix, tester à nouveau

### 🟠 PM2 ne démarre pas au reboot

```bash
pm2 resurrect
# Si ça échoue, reconstruit la config :
cd /opt/exilium && pm2 start ecosystem.config.cjs
cd /opt/exilium-staging && pm2 start ecosystem.config.cjs
pm2 save
# Et s'assurer que pm2-startup est bien configuré :
pm2 startup  # affichage d'une commande sudo à lancer
```

### 🟠 Rate limit global déclenché à tort

Symptôme : des utilisateurs normaux reçoivent 429.

**Temporairement** : augmenter la limite dans `apps/api/src/index.ts` (`max: 300` → plus haut), rebuild, reload.

**Mieux** : identifier l'IP abusive dans les logs Caddy et y appliquer un blocage Caddy spécifique.

### 🟠 Certificat TLS expiré

Caddy renouvelle automatiquement 30 jours avant expiration. Si ça échoue :

```bash
sudo journalctl -u caddy --since "1 hour ago" | grep -i "tls\|challenge"
# Cause typique : DNS down, port 80 bloqué, rate limit Let's Encrypt
sudo systemctl restart caddy
```

### 🟡 Disque plein

```bash
df -h /
du -sh /opt/exilium /opt/exilium-staging /home/ubuntu/.pm2/logs /opt/backups /var/log
```

**Cibles fréquentes** :
- `/home/ubuntu/.pm2/logs/*.log*` → `pm2 flush` (garder un backup avant si besoin de debug)
- `/opt/backups/postgres/*.dump` → baisser `RETENTION_DAYS` dans `scripts/backup-postgres.sh`
- `/opt/exilium*/node_modules` → rarement utile de nettoyer mais `pnpm store prune` peut libérer quelques centaines de MB
- `journalctl --vacuum-time=7d` si les logs systemd sont gros

### 🟡 Worker BullMQ job stuck / failed

```bash
# Voir les jobs failed
pm2 logs exilium-worker --err --lines 50

# Via admin dashboard: admin.exilium-game.com/dashboard → colonne "Failed" des queues
```

Pour purger les failed d'une queue :
```bash
redis-cli
> LRANGE bull:fleet:failed 0 -1  # voir
> DEL bull:fleet:failed          # purger (tue l'historique des failed)
```

Attention : les jobs peuvent être retry automatiquement (`attempts: 3`, `backoff exponential`). Laisser finir avant de purger.

### 🟡 Un joueur signale un bug reproductible

1. Reproduire sur **staging** (cf. la section "Staging" plus bas)
2. Fix en local, push, tester sur staging
3. Si OK sur staging, merge + déployer prod

### 🟡 Compte joueur compromis / spam

```sql
-- Ban un user
UPDATE users SET banned_at = NOW() WHERE username = 'xxx';

-- Voir les IPs des dernières connexions
SELECT email, ip_address, success, created_at
FROM login_events
WHERE email = 'xxx@example.com'
ORDER BY created_at DESC LIMIT 20;

-- Révoquer toutes ses sessions
DELETE FROM refresh_tokens WHERE user_id = '<uuid>';
```

---

## Staging

### Accès
- URL : `https://staging.exilium-game.com`
- Basic auth : `/etc/caddy/caddy.env` (user + hash), password en clair détruit après setup
- Emails en staging : `<username_slug>@staging.local`
- Password tous users : `/opt/exilium-staging/.staging-password` (perms 600)

### Rafraîchir staging depuis prod
```bash
sudo /opt/exilium/scripts/refresh-staging-from-prod.sh
```
Anonymise les emails, réinitialise les passwords, purge les tokens/PII, rsync les uploads. ~30 s.

### Déployer une branche sur staging
```bash
bash /opt/exilium/scripts/deploy-staging.sh origin/<branche>
```

### Promouvoir un user admin sur staging
```sql
PGPASSWORD=<...> psql -h localhost -U exilium_staging -d exilium_staging \
  -c "UPDATE users SET is_admin = true WHERE username = 'xxx';"
```

---

## Déploiement prod (workflow standard)

1. **Pousser sur `main`** (commits ici passent en prod à chaque déploiement)
2. Sur le VPS :
   ```bash
   cd /opt/exilium
   git pull
   pnpm install --frozen-lockfile
   pnpm build
   bash scripts/apply-migrations.sh
   pm2 reload exilium-api
   pm2 reload exilium-worker
   curl https://exilium-game.com/health
   ```
3. Ou via le script deploy : `bash scripts/deploy.sh` (si à jour)

**Point sensible** : si une migration ajoute une colonne NOT NULL sans DEFAULT sur une grosse table, faire le `migrate` AVANT le `reload` (sinon la nouvelle version du code peut casser). L'ordre `migrate puis reload` est la règle.

---

## Rollback d'un déploiement

Si un reload prod introduit un bug bloquant :

```bash
cd /opt/exilium
git log --oneline -5            # repérer le commit précédent
git checkout <sha_avant>
pnpm build
pm2 reload exilium-api exilium-worker
```

Si la migration du déploiement cassé est dangereuse à garder, restaurer la DB depuis le dernier backup (cf. section "DB corrompue") — mais seulement si la migration ne peut pas être annulée par une migration inverse.

---

## Où regarder quand rien ne marche et qu'on panique

1. `curl https://exilium-game.com/health` → vue d'ensemble DB + Redis
2. `pm2 list` → qui tourne, qui restart
3. `pm2 logs exilium-api --err --lines 100` → dernières erreurs API
4. `pm2 logs exilium-worker --err --lines 100` → dernières erreurs workers
5. `sudo journalctl -u caddy --since "15 min ago"` → erreurs Caddy / TLS
6. `sudo journalctl -u postgresql --since "15 min ago"` → erreurs DB
7. Dashboard admin `/dashboard` → état temps réel visuel

Si rien n'aide : `pm2 restart all` et voir ce qui revient online.

---

## Backups

- **Quotidiens Postgres** : `/opt/backups/postgres/exilium-<date>.dump`, rétention 14 j, cron 03:00 UTC
- **Log du cron** : `/opt/backups/postgres/backup.log`
- **Test de restore** (à faire tous les X mois) :
  ```bash
  # Restore dans un DB jetable pour valider le dump est sain
  sudo -u postgres psql -c "CREATE DATABASE exilium_restore_test OWNER exilium;"
  pg_restore -d postgresql://exilium:<pass>@localhost/exilium_restore_test /opt/backups/postgres/<dump>
  sudo -u postgres psql -c "DROP DATABASE exilium_restore_test;"
  ```
