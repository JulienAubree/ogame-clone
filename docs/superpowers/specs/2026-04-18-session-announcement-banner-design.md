# Bandeau d'annonce par session — Design

## Contexte

On veut pouvoir pousser un message admin (maintenance, nouveauté, incident) visible par tous les joueurs connectés, via un bandeau qui réapparaît à chaque nouvelle session. Le message peut optionnellement renvoyer vers une entrée du système `changelog` existant ("Nouveautés").

## Objectif

Fournir à l'admin un outil simple pour diffuser une annonce courte (type "tweet") en haut de l'interface joueur, avec dismiss persistant pendant la session courante mais réapparition à chaque nouveau login.

## Non-objectifs (v1)

- Annonces ciblées (par joueur, alliance, segment).
- Expiration automatique (`expiresAt`).
- Annonces multiples simultanées.
- Lien vers une URL libre (on lie uniquement à un changelog pour v1).
- Tests frontend (cohérent avec le reste du repo).

## Décisions de design

| Sujet | Décision |
|---|---|
| Entité | Table dédiée `announcements`, séparée de `changelogs`. Lien optionnel via `changelogId`. |
| Déclenchement | Dismiss stocké en `sessionStorage` → réapparaît au prochain login/onglet. |
| Multiplicité | **Une seule annonce active à la fois**. Créer/activer une annonce désactive automatiquement la précédente. |
| Champs | `message` (≤280 chars), `variant` (`info`/`warning`/`success`), `changelogId` (uuid, nullable). |
| Placement UI | Entre `TopBar`/`OfflineBanner` et `ResourceBar` dans `Layout.tsx`, en flux normal (non-fixed). |
| Unicité active | Garantie **en logique applicative** (transaction dans le service), pas par contrainte DB. |

## Architecture

### 1. Schéma DB — `packages/db/src/schema/announcements.ts`

```ts
import { pgTable, uuid, varchar, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { changelogs } from './changelogs.js';

export const announcementVariantEnum = pgEnum('announcement_variant', ['info', 'warning', 'success']);

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: varchar('message', { length: 280 }).notNull(),
  variant: announcementVariantEnum('variant').notNull().default('info'),
  changelogId: uuid('changelog_id').references(() => changelogs.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Index : aucun n'est strictement nécessaire — le volume reste très faible (historique d'annonces, quelques dizaines max sur la durée). `getActive()` fait un `WHERE active = true LIMIT 1`, Postgres scan trivial.

Export à ajouter dans `packages/db/src/schema/index.ts`.

### 2. API — `apps/api/src/modules/announcement/`

Deux fichiers sur le même pattern que `changelog/` :

**`announcement.service.ts`** (`createAnnouncementService(db)`) :

- `getActive()` : `SELECT * FROM announcements WHERE active = true LIMIT 1`. Le bandeau joueur n'a besoin que de `id`, `message`, `variant`, `changelogId` — pas de join nécessaire (le lien `Voir →` navigue vers `/changelog/<id>` quel que soit le titre).
- `adminList()` : toutes les annonces, triées `createdAt DESC`.
- `adminCreate({ message, variant, changelogId, activate })` :
  - Si `changelogId` fourni, vérifier que le changelog existe (sinon `BAD_REQUEST`).
  - Transaction :
    - Si `activate = true` → `UPDATE announcements SET active = false, updated_at = now() WHERE active = true`.
    - `INSERT INTO announcements (...) VALUES (...) RETURNING *` avec `active = activate`.
- `adminUpdate(id, { message?, variant?, changelogId? })` : maj des champs éditables (pas `active`, géré par `adminSetActive`). Met à jour `updated_at`.
- `adminSetActive(id, active)` :
  - Vérifier que l'annonce existe (sinon `NOT_FOUND`).
  - Si `active = true` → transaction : désactiver toutes les autres, puis activer celle-ci.
  - Si `active = false` → `UPDATE … SET active = false WHERE id = ?`.
- `adminDelete(id)` : `DELETE FROM announcements WHERE id = ?`. Si c'était l'active, elle disparaît simplement (pas de promotion auto d'une autre).

**`announcement.router.ts`** :

```ts
export function createAnnouncementRouter(service, adminProcedure) {
  const adminRouter = router({
    list: adminProcedure.query(() => service.adminList()),
    create: adminProcedure
      .input(z.object({
        message: z.string().min(1).max(280),
        variant: z.enum(['info', 'warning', 'success']),
        changelogId: z.string().uuid().optional(),
        activate: z.boolean().default(false),
      }))
      .mutation(({ input }) => service.adminCreate(input)),
    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        message: z.string().min(1).max(280).optional(),
        variant: z.enum(['info', 'warning', 'success']).optional(),
        changelogId: z.string().uuid().nullable().optional(),
      }))
      .mutation(({ input }) => service.adminUpdate(input.id, input)),
    setActive: adminProcedure
      .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
      .mutation(({ input }) => service.adminSetActive(input.id, input.active)),
    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ input }) => service.adminDelete(input.id)),
  });

  return router({
    active: protectedProcedure.query(() => service.getActive()),
    admin: adminRouter,
  });
}
```

Câblage : dans le root router tRPC (là où `changelogRouter` est monté), ajouter `announcement: createAnnouncementRouter(...)`.

### 3. Client web — `apps/web/src/components/layout/AnnouncementBanner.tsx`

```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { trpc } from '@/trpc';

const VARIANT_CLASSES = {
  info: 'bg-primary/90 text-primary-foreground',
  warning: 'bg-destructive/90 text-destructive-foreground',
  success: 'bg-emerald-600/90 text-white',
} as const;

export function AnnouncementBanner() {
  const { data } = trpc.announcement.active.useQuery(undefined, { staleTime: 60_000 });
  const [dismissedTick, setDismissedTick] = useState(0); // forces re-render on dismiss

  if (!data) return null;

  const key = `announcement_dismissed_${data.id}`;
  if (sessionStorage.getItem(key) === '1') return null;

  const handleDismiss = () => {
    sessionStorage.setItem(key, '1');
    setDismissedTick((n) => n + 1);
  };

  return (
    <div className={`flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium ${VARIANT_CLASSES[data.variant]}`}>
      <span className="flex-1 text-center">{data.message}</span>
      {data.changelogId && (
        <Link to={`/changelog/${data.changelogId}`} className="whitespace-nowrap underline hover:no-underline">
          Voir →
        </Link>
      )}
      <button onClick={handleDismiss} aria-label="Fermer" className="opacity-70 hover:opacity-100">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
```

**Intégration dans `Layout.tsx`** : après `<OfflineBanner />` (ligne 72), ajouter `<AnnouncementBanner />`. Flux normal → s'empile proprement sous `TopBar`, pousse `ResourceBar` vers le bas. Se superpose avec `OfflineBanner` (qui est `fixed`) uniquement si les deux sont actifs — la superposition visuelle est acceptable (cas rare).

### 4. Admin — `apps/admin/src/pages/Announcements.tsx`

Pattern copié de `apps/admin/src/pages/Changelogs.tsx` :

- **Header** : titre "Annonces", bouton "+ Nouvelle annonce" (ouvre la modale).
- **Table** : colonnes `Message` (tronqué 80 chars, tooltip complet), `Variant` (badge coloré), `Lien` (titre changelog ou "—"), `Statut` (pill "Active" / "Inactive", cliquable = toggle), `Créé le`, `Actions` (Éditer, Supprimer).
- **Modale création** :
  - `<textarea>` message avec compteur `X / 280`.
  - `<select>` variant : `Info` / `Avertissement` / `Succès`.
  - `<select>` changelog : peuplé via `trpc.changelog.admin.list` filtré sur `published = true`, première option "Aucun".
  - Checkbox "Activer immédiatement" (visible uniquement en création).
  - Boutons Annuler / Créer.
- **Modale édition** : mêmes champs sauf la checkbox d'activation (utiliser le toggle de statut dans la table à la place).
- **Suppression** : `ConfirmDialog` existant.

**Routing** :
- Ajouter `/announcements` dans `apps/admin/src/router.tsx`.
- Ajouter le lien dans la sidebar admin, juste après "Journal de développement".

## Data flow

```
Admin (modale "Nouvelle annonce", "Activer immédiatement" coché)
  └─> tRPC: announcement.admin.create({ message, variant, changelogId?, activate: true })
        └─> Service transaction:
              - UPDATE announcements SET active=false WHERE active=true
              - INSERT … RETURNING * (active=true)

Joueur connecté
  └─> tRPC: announcement.active (query, staleTime 60s)
        └─> SELECT … WHERE active=true LIMIT 1
  └─> AnnouncementBanner:
        - data null → rien
        - sessionStorage[announcement_dismissed_<id>] === '1' → rien
        - sinon → rendu

Joueur clique ×
  └─> sessionStorage.setItem('announcement_dismissed_<id>', '1')
  └─> bandeau disparaît (state local)

Joueur se déconnecte / ferme l'onglet
  └─> sessionStorage effacé
  └─> prochain login → bandeau revient (si annonce toujours active)
```

## Edge cases

| Cas | Comportement |
|---|---|
| Changelog lié supprimé | `ON DELETE SET NULL` → annonce reste, sans lien `Voir →`. |
| Admin désactive l'active | `getActive()` renvoie `null` au prochain fetch → bandeau disparaît (dans la minute, `staleTime` 60s). |
| Admin supprime l'active | Idem, bandeau disparaît. |
| 2 admins activent en parallèle | Dernière `UPDATE` gagne. Possible fenêtre de quelques ms avec 2 lignes `active=true` → `getActive` en renvoie une ; au prochain write tout redevient cohérent. Acceptable. |
| Utilisateur non authentifié | `announcement.active` est `protectedProcedure` → la query n'est jamais émise en dehors du `Layout` (qui est derrière la garde d'auth). |
| Annonce préparée à l'avance | `active = false` → listée dans l'admin comme "Inactive", invisible côté joueur. L'admin toggle `active` quand il veut publier. |
| Plusieurs onglets joueur ouverts | Chaque onglet a son propre `sessionStorage` → dismiss dans l'onglet A ne ferme pas l'onglet B. Acceptable (chaque onglet = session visuelle indépendante). |

## Tests

- **Service** (`vitest`, même style que les services existants) :
  - `adminCreate` avec `activate: true` désactive toute annonce précédemment active.
  - `adminCreate` avec `activate: false` ne touche pas aux autres annonces.
  - `adminSetActive(id, true)` désactive les autres.
  - `getActive` retourne `null` si aucune active.
  - `changelogId` inexistant → `BAD_REQUEST`.
  - `ON DELETE SET NULL` : supprimer un changelog lié → `changelogId` devient `null` sur l'annonce.
- **Frontend** : manuel (pattern repo).

## Migrations

Générer une migration Drizzle : `pnpm --filter @exilium/db db:generate` (crée le type enum `announcement_variant` et la table `announcements`), puis appliquer via `pnpm --filter @exilium/db db:migrate`.

## Fichiers touchés

**Créés** :
- `packages/db/src/schema/announcements.ts`
- `apps/api/src/modules/announcement/announcement.service.ts`
- `apps/api/src/modules/announcement/announcement.router.ts`
- `apps/api/src/modules/announcement/announcement.service.test.ts`
- `apps/web/src/components/layout/AnnouncementBanner.tsx`
- `apps/admin/src/pages/Announcements.tsx`
- Migration SQL Drizzle générée.

**Modifiés** :
- `packages/db/src/schema/index.ts` (export de la nouvelle table).
- Root tRPC router côté API (montage du nouveau router).
- `apps/api/src/index.ts` ou équivalent (instanciation du service si pattern DI).
- `apps/web/src/components/layout/Layout.tsx` (intégration du bandeau).
- `apps/admin/src/router.tsx` (route `/announcements`).
- Sidebar admin (lien).

## Suite

Une fois cette spec validée : passage à `writing-plans` pour générer le plan d'implémentation détaillé (étapes ordonnées, points de contrôle, migration).
