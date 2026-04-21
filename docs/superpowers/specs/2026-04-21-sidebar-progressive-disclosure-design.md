# Sidebar à divulgation progressive

## Résumé

La sidebar actuelle affiche 6 sections et ~18 items dès l'arrivée d'un nouveau joueur, ce qui crée une charge cognitive forte. On va dévoiler les items progressivement selon la progression du tutoriel et quelques actions clés, avec une animation + badge "Nouveau" au déblocage. Aucune régression pour les joueurs existants : la logique dérive de l'état courant (chapitre tutoriel, tutoriel complet, nombre de colonies).

## Règle de visibilité

Chaque item de sidebar a une **condition de déblocage** évaluée à chaque render (fonction pure, pas de migration). Un item est affiché si sa condition est vraie, sinon il est complètement caché (pas grisé).

| Item | Path | Condition |
|---|---|---|
| Vue d'ensemble | `/` | Toujours |
| Bâtiments | `/buildings` | Toujours |
| Énergie | `/energy` | Toujours |
| Messages | `/messages` | Toujours |
| Nouveautés | `/changelog` | Toujours |
| Feedback | `/feedback` | Toujours |
| Recherche | `/research` | `chapterOrder >= 2` |
| Chantier spatial | `/shipyard` | `chapterOrder >= 2` |
| Vaisseau amiral | `/flagship` | `chapterOrder >= 3` |
| Galaxie | `/galaxy` | `chapterOrder >= 3` |
| Flotte | `/fleet` | `chapterOrder >= 3` |
| Missions | `/missions` | `chapterOrder >= 3` |
| Centre de commandement | `/command-center` | `chapterOrder >= 4` |
| Défense | `/defense` | `chapterOrder >= 4` |
| Marché | `/market` | `isComplete` |
| Alliance | `/alliance` | `isComplete` |
| Classement | `/ranking` | `isComplete` |
| Classement Alliances | `/alliance-ranking` | `isComplete` |
| Empire | `/empire` | `isComplete && colonyCount >= 2` |

`chapterOrder` est la valeur `order` du chapitre courant de `tutorial_chapters` (1 à 4). `isComplete` vient de `trpc.tutorial.getCurrent`. `colonyCount` est le nombre de colonies actives du joueur.

**Pages toujours accessibles par URL directe** : seule la visibilité dans la sidebar change. Un joueur qui a le lien d'une page peut toujours l'ouvrir — c'est uniquement de la simplification UI.

## Auto-hide des sections

Un header de section (`Empire`, `Planète`, `Production`, `Espace`, `Communauté`, `Développement`) est masqué si **tous** ses items sont masqués. Le séparateur visuel du dessus est également supprimé.

Au démarrage d'un nouveau joueur, la sidebar contient donc :

- **Planète** : Vue d'ensemble, Bâtiments, Énergie
- **Communauté** : Messages
- **Développement** : Nouveautés, Feedback

Les autres sections apparaissent au fil des chapitres et du post-tutoriel.

## Feedback visuel au déblocage

Quand un item (ou un header de section) passe de caché à visible :

- **Animation d'apparition** : fade-in + léger glow pendant ~1.5s
- **Badge "Nouveau"** : pastille colorée discrète sur l'item qui persiste jusqu'au **premier clic** sur cet item
- Pas de toast, pas de modal — le feedback est purement dans la sidebar, aligné avec la narration déjà portée par le journal du tutoriel dans la TopBar

## Architecture

### Données

- `chapterOrder` et `isComplete` : déjà fournis par `trpc.tutorial.getCurrent` (utilisé par la TopBar).
- `colonyCount` : à récupérer via la session/contexte utilisateur. Le point exact à brancher sera identifié lors du plan d'implémentation (probablement un store existant de planètes).

### Module de visibilité

Nouveau module `apps/web/src/components/layout/sidebarVisibility.ts` :

```ts
export type SidebarContext = {
  chapterOrder: number;
  isComplete: boolean;
  colonyCount: number;
};

export function isItemVisible(path: string, ctx: SidebarContext): boolean;
```

Fonction pure, sans dépendance React. Testable unitairement. La table de correspondance `path → condition` vit dans ce module, à côté de la définition des items (ou importée depuis `Sidebar.tsx`).

### Persistance des badges "Nouveau"

- Clé `localStorage` : `exilium.sidebar.seenItems` → `string[]` (liste des paths déjà cliqués).
- À la 1ʳᵉ fois qu'un path passe visible, il entre dans un état "unseen" et affiche le badge. Au clic, il passe dans `seenItems` et le badge disparaît.
- Simple, pas de nouvelle table DB. Un joueur qui change d'appareil reverra les badges — acceptable pour cet MVP.
- Pour les **joueurs existants au moment du déploiement** : on initialise `seenItems` avec tous les paths actuellement visibles dans leur état, pour qu'ils ne voient pas une vague de badges "Nouveau" sur les items qu'ils utilisent déjà.

### Détection des nouveaux items

Un hook `useSidebarNewItems(visibleSet)` :

- Compare `visibleSet` au `visibleSet` du render précédent (ref).
- Les paths nouvellement visibles et absents de `seenItems` sont marqués "à animer + badge".
- Dès qu'un item est cliqué, il rentre dans `seenItems` (write localStorage), badge disparaît.

### Sidebar.tsx

- Lit `chapterOrder`, `isComplete`, `colonyCount` via les hooks existants.
- Calcule `visibleSet` via `getVisibleSidebarItems(ctx)`.
- Filtre items et sections (auto-hide).
- Applique classes CSS d'animation sur les items nouvellement visibles.
- Affiche le badge "Nouveau" selon `useSidebarNewItems`.

## Tests

- **Unit** : `sidebarVisibility.test.ts` — table de cas `(ctx) → set d'items visibles`. Couvre :
  - Nouveau joueur (chap 1) : seuls les 6 items "toujours" sont visibles.
  - Chap 2 : + Recherche, Chantier spatial.
  - Chap 3 : + Vaisseau amiral, Galaxie, Flotte, Missions.
  - Chap 4 : + Centre de commandement, Défense.
  - Tutoriel complet sans 2ᵉ colonie : + Marché, Alliance, Classement, Classement Alliances (pas Empire).
  - Tutoriel complet + 2 colonies : + Empire.
- **Component** (optionnel, selon la pratique existante) : Sidebar render dans les 4 états clés, snapshot des items affichés.

## Hors scope

- Sidebar mobile / bottom nav : même logique applicable en suivi si la structure existe.
- Verrouillage fonctionnel des pages (accès URL direct reste permis).
- Refonte des noms ou regroupements de sections.
- Persistance serveur-side des badges "Nouveau" (upgrade futur si besoin multi-device).

## Fichiers touchés

- `apps/web/src/components/layout/Sidebar.tsx` — consomme la logique de visibilité, applique animation + badges.
- `apps/web/src/components/layout/sidebarVisibility.ts` (nouveau) — fonction pure + table de conditions.
- `apps/web/src/components/layout/sidebarVisibility.test.ts` (nouveau) — tests unitaires.
- `apps/web/src/components/layout/useSidebarNewItems.ts` (nouveau) — hook diff + localStorage.
