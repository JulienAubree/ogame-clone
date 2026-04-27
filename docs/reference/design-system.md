# Design System — Exilium

_Référence pour designers et développeurs front. Mise à jour : 2026-04-25._

Ce document liste les tokens (couleurs, espacements, typographie), les composants UI réutilisables et les patterns récurrents du jeu. **Source de vérité** :
- Tokens : `apps/web/tailwind.config.js` + `apps/web/src/styles/global.css`
- Composants : `apps/web/src/components/common/` et `apps/web/src/components/ui/`
- Icônes : `apps/web/src/lib/icons.tsx` + `apps/web/src/components/common/ResourceIcons.tsx`

---

## 1. Philosophie

Exilium est un jeu de gestion spatiale au style **rétro-futuriste sombre**. L'interface vise :

- **Lisibilité** : fond sombre, texte clair, typographie sans-serif moderne (Inter)
- **Hiérarchie visuelle** par couleurs sémantiques (chaque ressource a sa teinte)
- **Effets subtils** : glassmorphism léger, lueurs (glows) sur les ressources, animations courtes
- **Mobile-first** : tap targets 44px min, animations rapides (200-300ms)

---

## 2. Palette de couleurs

### Couleurs sémantiques (HSL via CSS variables)

| Token Tailwind | Variable CSS | Valeur HSL | Usage |
|---|---|---|---|
| `background` | `--background` | `220 55% 3%` | Fond principal (très sombre, bleu profond) |
| `foreground` | `--foreground` | `210 20% 85%` | Texte principal |
| `card` | `--card` | `220 50% 8%` | Cartes, panels |
| `card-foreground` | `--card-foreground` | `210 20% 85%` | Texte sur cartes |
| `popover` | `--popover` | `222 47% 9%` | Popovers, dropdowns |
| `primary` | `--primary` | `200 85% 65%` | Boutons d'action principaux (cyan clair) |
| `secondary` | `--secondary` | `222 30% 18%` | Boutons secondaires |
| `muted` | `--muted` | `222 30% 14%` | Backgrounds neutres, séparateurs |
| `muted-foreground` | `--muted-foreground` | `215 15% 55%` | Texte secondaire, labels |
| `accent` | `--accent` | `222 30% 18%` | Hovers, selections |
| `destructive` | `--destructive` | `0 72% 51%` | Erreurs, suppressions |
| `border` | `--border` | `222 30% 18%` | Bordures par défaut |
| `ring` | `--ring` | `210 80% 55%` | Focus rings |

Tous les composants UI doivent utiliser **uniquement ces tokens** plutôt que des couleurs hexa hard-codées (sauf cas spécifiques listés ci-dessous).

### Couleurs ressources

Couleurs fixes pour les ressources du jeu. **À utiliser systématiquement** pour tout indicateur lié à une ressource.

| Token | Hexa | Usage |
|---|---|---|
| `minerai` | `#fb923c` | Orange — minerai partout |
| `silicium` | `#34d399` | Vert — silicium partout |
| `hydrogene` | `#60a5fa` | Bleu — hydrogène partout |
| `energy` | `#f0c040` | Jaune — énergie |
| `shield` | `#22d3ee` | Cyan — boucliers, défenses |

### Couleurs de stats combat (par convention)

| Stat | Classe Tailwind | Couleur |
|---|---|---|
| Armes / dégâts | `text-red-400` | Rouge |
| Bouclier | `text-sky-400` | Bleu ciel |
| Coque | `text-yellow-400` | Jaune |
| Armure | `text-amber-400` | Ambre |
| Tirs / round | `text-amber-400` | Ambre |
| Vitesse | `text-slate-500` | Gris |
| Capacité cargo | `text-slate-500` | Gris |

### Glows (effets de lueur)

CSS variables disponibles pour des effets `text-shadow` sur les ressources :
- `--glow-minerai`, `--glow-silicium`, `--glow-hydrogene`, `--glow-energy`

Classes utilitaires : `.glow-minerai`, `.glow-silicium`, `.glow-hydrogene`, `.glow-energy`.

---

## 3. Typographie

- **Famille principale** : `'Inter', system-ui, -apple-system, sans-serif`
- **Mono (fonts numériques tabulaires)** : utiliser `font-mono` Tailwind pour les chiffres alignés (stats, coordonnées, ressources)

### Échelle de tailles (Tailwind)

| Classe | Pixels | Usage |
|---|---|---|
| `text-[9px]` | 9px | Tags très petits (badges traits combat) |
| `text-[10px]` | 10px | Labels minuscules (sections internes) |
| `text-[11px]` | 11px | Texte secondaire dense |
| `text-xs` | 12px | Description courte, body dense |
| `text-sm` | 14px | Body standard |
| `text-base` | 16px | Body large, **min sur inputs mobile** |
| `text-lg` | 18px | Titres de cartes, h3 |
| `text-xl` | 20px | Headers de sections, h2 |

### Poids

- `font-normal` : body
- `font-medium` : labels, valeurs importantes
- `font-semibold` : titres, headers de cartes
- `font-bold` : très rare, à éviter sauf cas spécifique

---

## 4. Espacements et radius

### Espacements (Tailwind standard)

L'app utilise les tokens Tailwind standards (`p-1` à `p-8`, `gap-1` à `gap-6`). Conventions :

- **Padding interne carte** : `p-3` à `p-5` (selon densité)
- **Padding bouton** : `px-3 py-2` (small) ou `px-4 py-2` (default)
- **Gap entre cartes** : `gap-2` à `gap-4`
- **Gap entre sections** : `space-y-4` à `space-y-6`

### Radius

| Token | Valeur | Usage |
|---|---|---|
| `rounded-sm` | 2px | Très subtil (badges) |
| `rounded` | 4px | Inputs, boutons compact |
| `rounded-md` | 6px | Boutons, cartes denses |
| `rounded-lg` | 8px | Cartes principales, modals |
| `rounded-xl` | 12px | Hero cards, FacilityHero |
| `rounded-full` | 9999px | Pastilles, indicateurs |

`--radius: 0.5rem` (8px) est la base. `rounded-md` = `calc(var(--radius) - 2px)`, etc.

### Ombres

- **Carte standard** : `shadow-lg`
- **Glassmorphism** : classe `.glass-card` (combine bg + border + box-shadow custom)
- **Hover/active** : `shadow-xl` ou ombres colorées via `.retro-card-*`
- **Modals/popovers** : `shadow-xl` + `border-border` + `bg-popover`

---

## 5. Composants utility CSS

Définis dans `apps/web/src/styles/global.css`.

### `.glass-card`
Carte avec effet verre (background, border, ombre cyan subtile). À utiliser comme conteneur principal de section.

```html
<section class="glass-card p-4 space-y-2">
  <h3 class="text-sm font-semibold text-primary">Titre</h3>
  ...
</section>
```

### `.retro-card`
Carte rétro avec border + hover cyan. Variantes par ressource : `.retro-card-minerai`, `.retro-card-silicium`, `.retro-card-hydrogene`, `.retro-card-energy`.

### `.bg-stars`
Pattern de fond étoilé (SVG en background-image). À utiliser sur les écrans immersifs (login, hero pages).

### `.glow-minerai|silicium|hydrogene|energy`
Effets `text-shadow` colorés pour mettre en valeur les chiffres de ressources.

### `.h-viewport`
Hauteur 100vh avec fallback dvh (gère bien la barre d'adresse iOS).

### `.touch-feedback`
Animation tactile : scale + opacity au tap. Pour boutons et zones cliquables sur mobile.

---

## 6. Animations

Animations Tailwind disponibles via `animate-*` :

| Classe | Durée | Usage |
|---|---|---|
| `animate-fade-in` | 200ms | Apparition générale |
| `animate-slide-up` | 300ms | Apparition par le bas (toasts, banners) |
| `animate-slide-up-sheet` | 300ms | Bottom sheets mobile |
| `animate-slide-down-sheet` | 250ms | Headers/notifications |
| `animate-slide-in-right` | 300ms | Drawers latéraux |
| `animate-pulse-glow` | 2s ∞ | Indicateurs actifs |
| `animate-flow-pulse` | 2s ∞ | Flux de production en cours |
| `animate-skeleton-shimmer` | 1.5s ∞ | Skeletons de chargement |

**Convention** : transitions `200-300ms` pour les changements d'état, `2s` pour les effets perpétuels (glow, pulse).

---

## 7. Système d'icônes

### `apps/web/src/lib/icons.tsx`
22 icônes de navigation/UI standardisées (Overview, Resources, Building, Ship, Fleet, etc.). Toutes basées sur le wrapper `<Icon>` interne avec defaults : 24×24, stroke currentColor 2px.

```tsx
import { OverviewIcon, FleetIcon } from '@/lib/icons';
<OverviewIcon size={20} className="text-primary" />
```

### `apps/web/src/components/common/ResourceIcons.tsx`
4 icônes ressources : `MineraiIcon`, `SiliciumIcon`, `HydrogeneIcon`, `EnergieIcon`.

### `apps/web/src/components/common/ExiliumIcon.tsx`
Icône spéciale du score Exilium (cristal).

### `apps/web/src/components/icons/` *(nouveau)*
Icônes utilitaires fréquemment réutilisées (close, clock, chevron, etc.) extraites des SVG inline. Voir section dédiée.

### Lucide React
Pour les icônes admin et certaines UI génériques, on utilise [`lucide-react`](https://lucide.dev) (`Pencil`, `Plus`, `Trash2`, `X`, `ChevronRight`, etc.).

**Règle** : nouvelles icônes → préférer **Lucide** d'abord. Si une icône custom est nécessaire (style spécifique au jeu), l'ajouter dans `lib/icons.tsx`.

---

## 8. Composants UI réutilisables

### `components/common/`

Composants spécifiques au jeu, à privilégier avant de créer du custom.

| Composant | Usage |
|---|---|
| `<FacilityHero>` | Bandeau de tête de bâtiment (image + niveau + actions) |
| `<FacilityQueue>` | File de construction (bâtiments, vaisseaux) |
| `<FacilityHelp>` | Bandeau d'aide repliable |
| `<BuildingUpgradeCard>` | Carte d'upgrade de bâtiment (niveau, coût, bouton) |
| `<KpiTile>` | Mini-carte stat (label + valeur + icône) |
| `<ResourceCost>` | Affichage de coût en ressources |
| `<ResourceIcons>` (composants individuels) | Icônes des 4 ressources |
| `<PrerequisiteList>` | Liste de prérequis (bâtiments + recherches) |
| `<Timer>` | Compte à rebours avec barre de progression |
| `<QuantityStepper>` | Input numérique avec ±/-+ |
| `<Skeleton>`, `<PageSkeleton>` | Placeholders de chargement |
| `<Breadcrumb>` | Fil d'ariane |
| `<EmptyState>` | État vide avec icône + message |
| `<ConfirmDialog>` | Modal de confirmation |
| `<ErrorBoundary>`, `<QueryError>` | Gestion d'erreurs |
| `<EntityDetailOverlay>` | Overlay full-screen pour détails (ship/defense/building) |
| `<PageHeader>`, `<PageTransition>` | Header/transition de page |
| `<GameImage>` | Wrapper image avec gestion variants planet types |
| `<CoordinateInput>`, `<CoordsLink>` | Inputs et liens de coordonnées galactiques |

### `components/ui/`

Composants génériques basés sur shadcn/ui (Button, Input, Badge, Tabs, Sheet, Dialog…). À utiliser avant de créer ses propres primitives.

### `components/entity-details/`

Composants spécifiques aux fiches d'entité :
- `<ShipDetailContent>`, `<DefenseDetailContent>`, `<BuildingDetailContent>`, `<ResearchDetailContent>`
- `<WeaponBatteryList>` : affichage des batteries d'armes (refonte combat)
- `<CombatTraitPopover>` : popover sur les traits Rafale/Enchaînement
- `<EffectiveStatCell>`, `<StatCell>` : cellules stat avec/sans bonus de recherche
- `<CostPills>` : pastilles de coût en ressources

---

## 9. Patterns récurrents

### Section glass-card

```tsx
<section className="glass-card p-4 space-y-2">
  <h3 className="text-sm font-semibold text-primary">Titre de la section</h3>
  <div className="text-xs text-muted-foreground">
    Contenu...
  </div>
</section>
```

### Header avec icône colorée

```tsx
<SectionHeader
  icon={<ShieldIcon size={14} className="text-sky-400" />}
  label="Défense"
  color="text-sky-400"
/>
```

### Cellule de stat avec bonus

```tsx
<EffectiveStatCell
  icon={<HullIcon />}
  label="Coque"
  base={50}
  effective={75}
  multiplier={1.5}
  variant="hull"
/>
```
Affiche : `75 (base 50 · +50%)`. Utilisé pour les fiches vaisseau/défense.

### Popover au hover (style biome)

Voir `<BiomePopover>` (pages/Energy.tsx) ou `<CombatTraitPopover>` (entity-details/).
Pattern : trigger inline + portal vers `document.body` + position calculée via `getBoundingClientRect()`. Pas de librairie externe.

### Overlay détail entité

```tsx
<EntityDetailOverlay open={!!selected} onClose={() => setSelected(null)}>
  <ShipDetailContent shipId={selected} researchLevels={...} />
</EntityDetailOverlay>
```
Sheet bottom sur mobile, dialog centré sur desktop.

### Coût en ressources

Toujours utiliser `<ResourceCost>` ou `<CostPills>` :
```tsx
<CostPills cost={{ minerai: 1000, silicium: 500, hydrogene: 0 }} />
```

---

## 10. Variantes de boutons

Définies dans `components/ui/button.tsx` (shadcn).

| Variant | Usage |
|---|---|
| `default` | Action principale (couleur primary) |
| `outline` | Action secondaire |
| `ghost` | Action subtile (texte sans fond) |
| `destructive` | Suppression, action dangereuse |
| `retro` | Style rétro custom du jeu (orange bordé) |
| `link` | Lien stylisé bouton |

| Size | Hauteur |
|---|---|
| `sm` | h-7 (28px) — actions denses |
| `default` | h-9 (36px) — standard |
| `lg` | h-10 (40px) — actions principales |

---

## 11. Conventions de nommage

### Fichiers
- Composants : `PascalCase.tsx` (ex: `BuildingUpgradeCard.tsx`)
- Hooks : `useXxx.ts` (ex: `useGameConfig.ts`)
- Utils/lib : `kebab-case.ts` ou `camelCase.ts`
- CSS : `kebab-case.css`

### Composants
- Props interface : `Props` ou `XxxProps`
- Export nommé pour les composants : `export function Xxx()`

### Classes Tailwind
- Préférer les tokens (`bg-card`, `text-primary`) aux couleurs hexadécimales
- Utiliser `cn()` (de `@/lib/utils`) pour conditionner des classes
- Ordonner les classes par catégorie : layout → spacing → background → text → border → effects

---

## 12. Mobile et accessibilité

### Mobile
- Tap targets : **min 44×44px** sur tout élément cliquable
- Inputs : **font-size ≥ 16px** pour éviter le zoom auto iOS
- `min-h-[44px]` appliqué automatiquement aux inputs via `global.css`
- Tester avec une dévtool en mode mobile portrait

### Accessibilité
- Toutes les images interactives ont un `alt` ou `aria-label`
- Modals : `role="dialog"` + `aria-modal="true"` (géré par shadcn)
- Focus rings : utiliser `focus-visible:ring-2 focus-visible:ring-ring`
- Contraste : tester text/background sur les zones critiques (recommandation : 4.5:1 min)

---

## 13. Pour un designer qui arrive

### Lecture rapide
1. Ce document (vue d'ensemble)
2. `apps/web/tailwind.config.js` (tokens techniques)
3. `apps/web/src/styles/global.css` (utilities CSS custom)
4. Clic sur n'importe quelle page du jeu et inspect → comparer avec les composants `common/`

### Faire des changements visuels
- **Modifier une couleur sémantique** : éditer `--xxx` dans `global.css`
- **Modifier une couleur ressource** : éditer `tailwind.config.js` (clés `minerai`, `silicium`, etc.) + glow CSS variables
- **Ajouter une icône custom** : la créer dans `lib/icons.tsx` (utiliser le wrapper `<Icon>`)
- **Nouveau composant réutilisable** : le placer dans `components/common/`

### Storybook ?
Pas encore en place. Si besoin de visualiser tous les composants en isolation, utiliser une page admin dédiée plutôt que d'introduire la dépendance Storybook.

---

## 14. État du système (2026-04-25)

### ✅ Ce qui est bien
- Tokens centralisés (HSL via CSS vars)
- Couleurs ressources cohérentes
- Bibliothèque `common/` riche, bien réutilisée
- Animations standardisées
- Mobile-first respecté

### ⚠️ Points d'attention
- ~31 fichiers avec icône horloge SVG inline (à centraliser → `components/icons/`)
- Quelques SVG icônes custom dispersés dans certains composants
- Pas de documentation visuelle (Storybook ou page catalogue)

### 🔮 Chantiers possibles
- Catalogue visuel admin (`/admin/design-system`) listant tous les composants `common/`
- Tests visuels (Chromatic-like) pour éviter régressions
- Migration progressive vers `lucide-react` pour les icônes génériques
