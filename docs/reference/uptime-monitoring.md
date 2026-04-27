# Uptime monitoring externe

Le monitoring doit tourner **hors du VPS** — sinon, quand le VPS tombe, le monitoring tombe avec. C'est un SaaS gratuit qui ping `/health` toutes les 5 minutes et t'envoie un email si ça fail.

## Option recommandée : UptimeRobot (free tier)

- Gratuit à vie, 50 monitors, intervalle 5 min
- Email + Slack + webhook en alerting
- Status page publique optionnelle

### Setup (5 min)

1. Crée un compte sur https://uptimerobot.com/signUp (adresse email ou Google SSO)
2. Confirme l'email
3. Dans le dashboard : **+ New Monitor**
4. Remplis :
   - **Monitor Type** : `HTTPS`
   - **Friendly Name** : `Exilium prod`
   - **URL** : `https://exilium-game.com/health`
   - **Monitoring Interval** : `5 minutes` (min du free tier)
   - **Monitor Timeout** : `30 seconds`
5. **Alert Contacts** : ton email est pré-coché (ou ajoute un Slack webhook)
6. **Create Monitor**

### Ce que ça détecte

Notre endpoint `/health` renvoie `200` si DB + Redis sont OK, `503` si l'un des deux est down. UptimeRobot considère tout `2xx` comme OK et tout le reste comme DOWN — donc on chope :
- VPS down (timeout)
- Caddy crashé
- API crashée
- Postgres ou Redis down
- Cert TLS expiré

### Recommandations de monitors additionnels

| URL | Pourquoi |
|---|---|
| `https://exilium-game.com/health` | Stack applicative complète |
| `https://www.exilium-game.com/` | Vérifie que le static SPA est servi |
| `https://admin.exilium-game.com/` | Devrait retourner `401` (basic auth). Configure "Alert when status is NOT 401" → ça lève si l'admin devient accessible sans auth (régression config) |

Le 3e est optionnel mais utile pour détecter une régression de config Caddy.

### Pour aller plus loin plus tard

- **Healthchecks.io** (free aussi) pour surveiller que le **backup cron tourne bien** : ajouter `curl https://hc-ping.com/<uuid>` à la fin du script `backup-postgres.sh`. Si le cron ne ping pas à l'heure prévue, Healthchecks t'alerte. Utile pour ne pas découvrir 3 mois plus tard que les backups sont cassés.
- **Status page publique** : UptimeRobot peut générer une `status.exilium-game.com` avec tes uptimes → transparence aux joueurs.
