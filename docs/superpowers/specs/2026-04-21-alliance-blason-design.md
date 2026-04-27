# Alliance — Blason et devise

Spec v1 du système d'identité visuelle d'alliance. Issue de `docs/proposals/2026-04-21-alliance-improvements.md` section 1.

## Objectif

Donner à chaque alliance un blason distinctif composé d'une forme, d'une icône et de deux couleurs, visible dans tous les contextes où l'alliance apparaît (galaxie, profil, chat, classement, page d'alliance). Ajouter une devise courte sur la page publique.

## Décisions clés

- **Permissions** : seul le fondateur peut éditer, à tout moment, sans cooldown ni coût.
- **Blason obligatoire** à la création de l'alliance. Les alliances existantes sont migrées avec un blason auto-généré déterministe (dérivé du tag).
- **Devise optionnelle**, 100 caractères max, affichée uniquement sur le hero de la page d'alliance publique.
- **Couleurs en picker libre** (hex `#RRGGBB`). Warning non bloquant sur contraste faible.
- **Schéma fixe** : `{ shape, icon, color1, color2 }`. Pas de layering, pas d'upload, pas de couche cosmétique additionnelle en v1.

## Catalogue

### Formes (12)
`shield-classic`, `shield-pointed`, `shield-heater`, `circle`, `hexagon`, `diamond`, `rounded-square`, `chevron`, `star-4`, `star-6`, `split-horizontal`, `split-diagonal`.

- Les formes `split-*` utilisent color1 et color2 en deux moitiés ; l'icône est rendue en noir ou blanc selon le contraste moyen.
- Les autres formes utilisent color1 pour le fond et color2 pour la bordure et l'icône.

### Icônes (17)
`crossed-swords`, `skull`, `planet`, `star`, `moon`, `rocket`, `satellite`, `galaxy`, `crosshair`, `crown`, `lightning`, `eye`, `atom`, `gear`, `crystal`, `trident`, `book`.

Toutes rendues en SVG vectoriel via `<g>`, centrées et scalées dans la forme.

## Modèle de données

Ajouts à `packages/db/src/schema/alliances.ts` sur la table `alliances` :

```ts
blasonShape: varchar('blason_shape', { length: 32 }).notNull(),
blasonIcon: varchar('blason_icon', { length: 32 }).notNull(),
blasonColor1: varchar('blason_color1', { length: 7 }).notNull(),
blasonColor2: varchar('blason_color2', { length: 7 }).notNull(),
motto: varchar('motto', { length: 100 }),
```

- Pas d'enum Postgres pour `shape`/`icon` : validation côté app via Zod. Ajouter un shape/icon = ajouter une entrée dans le catalog, sans migration DB.
- `motto` nullable (optionnel).
- Validation couleur : regex `^#[0-9a-fA-F]{6}$`.
- Migration SQL : ajout des colonnes en `NOT NULL` via deux passes : ajout nullable → backfill via `generateDefaultBlason(tag)` appliqué sur toutes les rows existantes → `SET NOT NULL`.

## Module partagé `packages/shared/src/alliance-blason/`

Source de vérité consommée par l'API (validation) et le web (rendu).

```
packages/shared/src/alliance-blason/
├── catalog.ts          # BLASON_SHAPES, BLASON_ICONS, BlasonSchema (Zod)
├── shapes.tsx          # 12 composants SVG (<g> paths)
├── icons.tsx           # 17 composants SVG (<g> paths)
├── generate-default.ts # generateDefaultBlason(tag) déterministe via FNV-1a
└── index.ts            # exports
```

**`catalog.ts`** expose :
- `BLASON_SHAPES`, `BLASON_ICONS` (const arrays + types dérivés)
- `BlasonSchema` Zod : `{ shape, icon, color1, color2 }` avec validation enum + regex hex

**`shapes.tsx` / `icons.tsx`** : chaque forme/icône est un composant qui prend `color1`/`color2` (shapes) ou `color` (icons) et rend un `<g>` SVG. Pas de `<svg>` wrapper — la composition se fait côté consommateur.

**`generate-default.ts`** : `generateDefaultBlason(tag: string) → Blason`. Hash FNV-1a 32-bit du tag, puis :
- `shape = BLASON_SHAPES[hash % 12]`
- `icon = BLASON_ICONS[(hash >> 4) % 17]`
- `color1 = DEFAULT_PALETTE[(hash >> 8) % 16]`
- `color2 = DEFAULT_PALETTE[(hash >> 12) % 16]` (si identique à color1, on shift d'un cran)

`DEFAULT_PALETTE` : 16 couleurs (mix de teintes profondes et d'accents) choisies pour donner un contraste mutuel moyen acceptable. Liste figée dans `catalog.ts` au moment de l'implémentation. Cette palette n'est utilisée **que** par `generateDefaultBlason` — le picker d'édition reste libre (hex).

Déterministe : même tag = même blason. Utilisé par la migration et comme fallback à la création avant que le fondateur personnalise.

## Composant de rendu `<AllianceBlason>`

Nouveau fichier `apps/web/src/components/alliance/AllianceBlason.tsx`.

```tsx
type Props = {
  blason: Blason;
  size: number;
  className?: string;
  title?: string;
};
```

- Rend un `<svg viewBox="0 0 100 100" width={size} height={size}>` contenant la forme + l'icône.
- Lit le catalog et monte le composant shape + le composant icon correspondants.
- `title` est injecté en `<title>` SVG pour tooltip natif et accessibilité.
- Pas d'optim `<symbol>`/`<use>` en v1. Si le classement (50+ blasons) montre des perfs dégradées, introduire un `<AllianceBlasonDefs>` monté une fois en haut de l'arbre avec les `<symbol>` des alliances visibles.

## UI d'édition (page Alliance)

Nouvelle section **"Blason & devise"** dans l'onglet **Gestion** de `apps/web/src/pages/Alliance.tsx`, visible uniquement pour `alliance.myRole === 'founder'`.

**Layout 2 colonnes** :
- **Gauche — Preview live** : `<AllianceBlason size={128}>` + nom/tag/devise, reproduisant le hero public.
- **Droite — Contrôles** :
  - Grille des 12 formes (cliquables, sélection unique)
  - Grille des 17 icônes (cliquables, sélection unique)
  - `<input type="color">` × 2, synchronisés à un input hex texte
  - `<textarea>` devise, max 100 chars, compteur visible
  - Bouton **Enregistrer**, désactivé tant que rien n'a changé
  - Warning non bloquant "Lisibilité faible" si ratio de contraste color1/color2 < 3:1

**Mutation tRPC** `alliance.updateBlason` :
- Input : `{ shape, icon, color1, color2, motto: string | null }`
- Validation : `BlasonSchema.extend({ motto: z.string().max(100).nullable() })`
- Autorisation : `requireRole(['founder'])`
- Invalidation : `alliance.myAlliance`, `alliance.get`

**À la création** : le form de création d'alliance pré-remplit les 4 champs du blason via `generateDefaultBlason(tag)` dès que le tag est saisi. Le fondateur peut valider tel quel ou affiner avec les mêmes contrôles. Un seul submit.

## Intégration dans les contextes d'affichage

5 points, par ordre de déploiement :

| # | Emplacement | Fichier | Taille | Source |
|---|---|---|---|---|
| 1 | Page alliance (hero) | `apps/web/src/pages/Alliance.tsx` | 96px | `alliance.myAlliance` / `alliance.get` |
| 2 | Carte alliance sur profil | `apps/web/src/components/profile/ProfileAllianceCard.tsx` | 48px | `profile.get` (à élargir) |
| 3 | Classement alliances | `apps/web/src/pages/AllianceRanking.tsx` | 32px | endpoint alliance ranking (à élargir) |
| 4 | Chat | `apps/web/src/components/chat/ChatOverlayWindow.tsx` | 16px | payload SSE (à élargir) |
| 5 | Galaxie (tag planète) | `apps/web/src/components/galaxy/GalaxySystemView/...` | 14px | payload planet/system (à élargir) |

**Helper backend** `selectAllianceBlasonFields` dans le module db, factorisant la sélection des 4 colonnes blason + tag pour toutes les queries Drizzle qui joignent une alliance. Pas de join supplémentaire — les 4 colonnes sont déjà sur la row d'alliance jointée.

**Chat** : le blason servi est celui de l'alliance actuellement (pas snapshot au moment du post). Un membre qui change de blason voit ses anciens messages rerendus avec le nouveau blason. Acceptable vu l'édition libre.

**Devise** : affichée uniquement sur le hero de la page alliance publique. Pas dans le classement, pas dans le profil, pas dans le chat.

## Plan de déploiement suggéré

1. **PR 1 — Socle** : migration DB + module `packages/shared/alliance-blason` + composant `<AllianceBlason>` + création avec blason auto + UI d'édition (Gestion). Intégration uniquement sur le hero de la page Alliance.
2. **PR 2 — Propagation** : intégrations #2 à #5 (profil, classement, chat, galaxie).

## Hors scope v1

- Layering (plusieurs icônes, ornements, bordures décoratives)
- Upload d'image / SVG custom
- Cosmétiques débloqués par prestige (couleurs rares, cadres spéciaux)
- Bannière d'alliance (image large hero)
- Snapshot du blason au moment du post (messages chat, logs)
- Cooldown ou coût pour l'édition
- Devise dans d'autres contextes que la page publique
