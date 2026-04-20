# Plan d'attaque — Durcissement login/mot de passe

Date : 2026-04-20

## Contexte

Audit initial de l'auth (voir fin du document pour l'état des lieux). Ce
plan couvre les améliorations séquentielles, regroupées en 3 phases selon
leurs dépendances.

## Phase 1 — Sans email (on peut faire tout de suite)

Dépendances : Redis (déjà en place via BullMQ/ioredis).

### 1.1 Rate limiting login/register

- Middleware tRPC basé sur Redis (INCR + EXPIRE par IP)
- Clé : `ratelimit:auth:<ip>`
- Limite proposée : **10 req/min par IP** sur login + register
- Réponse 429 propre côté frontend

### 1.2 Account lockout après N échecs

- Colonnes sur `users` : `failed_login_attempts int`, `locked_until timestamp`
- Incrément à chaque login raté, reset à chaque succès
- **5 tentatives échouées → blocage 15 min** (à confirmer)
- Login renvoie une erreur claire "Compte verrouillé, réessayez dans X min"

### 1.3 Audit log des connexions

- Nouvelle table `login_events` (userId nullable, email, success, ip, userAgent, createdAt)
- Ligne écrite sur chaque tentative (succès ET échec)
- Colonne `users.last_login_at` mise à jour sur succès
- Support futur : détection d'anomalies, "nouvelle connexion depuis X"

## Phase 2 — Setup email (bloquant pour la suite)

### 2.1 Provider

- **Reco : Resend** (API simple, gratuit jusqu'à 3000 mails/mois, templates React)
- Alternatives : SendGrid, Mailgun, SMTP maison
- Action utilisateur : créer compte + récupérer `RESEND_API_KEY`

### 2.2 Module mailer

- `apps/api/src/modules/mailer/mailer.service.ts`
- Variables env : `RESEND_API_KEY`, `MAIL_FROM`
- Template de base (header/footer Exilium)
- Log d'envoi (succès/échec)

## Phase 3 — Flows qui ont besoin d'email

### 3.1 Password reset

- Table `password_reset_tokens` (userId, tokenHash, expiresAt)
- Endpoint `auth.requestPasswordReset(email)` — toujours renvoyer OK (ne pas leak l'existence)
- Endpoint `auth.resetPassword(token, newPassword)` — consomme le token
- Page frontend `/forgot-password` + `/reset-password?token=...`
- Invalider tous les refresh tokens du user après reset

### 3.2 Email verification

- Colonne `users.email_verified_at timestamp nullable`
- Envoi automatique d'email à l'inscription
- Endpoint `auth.verifyEmail(token)` (via lien dans l'email)
- Bandeau frontend si email non vérifié
- Politique : autoriser ou bloquer l'accès sans vérification ? (à décider — reco : autoriser 48h, puis bloquer)

## Phases optionnelles (plus tard)

- 2FA/MFA (TOTP) — surtout pour les comptes admin
- Cookies httpOnly au lieu de localStorage (refactor côté frontend)
- Invalidation access token au logout (revocation list Redis)
- Tuning Argon2 (work factor custom)

## État des lieux initial (2026-04-20)

### Ce qui existe

- tRPC auth router : register / login / logout / refresh
- Argon2 pour le hash (paramètres par défaut)
- JWT HS256 (2h / 14j "remember me") + refresh token rotaté (7j / 30j, hashé SHA256 en DB)
- Tables : `users`, `refresh_tokens`
- Frontend : Login.tsx + Register.tsx avec password strength meter
- Soft-ban via `users.bannedAt`

### Ce qui manque

- Rate limiting (🔴)
- Password reset (🔴)
- Email verification (🟠)
- Audit log (🟠)
- Tokens en localStorage → vulnérable XSS (🟠)
- Lockout (🟡)
- 2FA (🟡)
- Invalidation access token au logout (🟡)

### Fichiers clés

- Backend : `apps/api/src/modules/auth/{auth.router.ts, auth.service.ts}`
- Schema : `packages/db/src/schema/users.ts`
- Frontend : `apps/web/src/pages/{Login.tsx, Register.tsx}`, `apps/web/src/stores/auth.store.ts`
- Admin : `apps/admin/src/stores/auth.store.ts`
- Env : `apps/api/src/config/env.ts`
