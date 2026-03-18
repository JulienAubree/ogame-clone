# Buildings Page Redesign — Intégration illustrations & style rétro-futuriste

## Contexte

Le projet dispose de ses premières illustrations (3 mines en pixel art) et a besoin d'un redesign progressif pour les intégrer. Cette spec couvre la première itération : refonte de la page Buildings avec un nouveau design system rétro-futuriste subtil, une pipeline d'optimisation d'images, et une stratégie de placeholders pour les bâtiments sans illustration.

## Décisions de design

| Question | Décision |
|----------|----------|
| Scope | Progressif — page Buildings uniquement pour cette itération |
| Direction visuelle | Rétro-futuriste **subtil** |
| Layout | Hybride : cartes compactes en grid + overlay détail avec hero image |
| Mobile | Liste avec mini-thumbnails + EntityDetailOverlay (bottom-sheet responsive) |
| Tailles d'images | Hero (1200px), Card/Thumb (400px), Icon (64px) — WebP |
| Intensité rétro | Subtil — mono pour chiffres, glow léger au hover, pas de scanlines/CRT |

## 1. Pipeline d'images

### Conversion

- **Source** : PNG originaux (`~/Desktop/Exilium Artworks/`)
- **Destination** : `apps/web/public/assets/{category}/` (WebP)
- **Script** : `scripts/optimize-images.ts` (nouveau)
- **Outil** : `sharp` (ajouté en devDependency **à la racine** du monorepo, car le script est dans `scripts/`)

### Tailles générées

| Variante | Largeur | Qualité | Suffixe fichier | Usage |
|----------|---------|---------|-----------------|-------|
| hero/full | 1200px | 85% | `.webp` | Overlay détail, bannière |
| thumb | 400px | 80% | `-thumb.webp` | Cartes dans la grid (72px affiché) |
| icon | 64px (carré, crop centre) | 75% | `-icon.webp` | Liste mobile (44px), refs compactes |

### Naming

Convention existante maintenue (`assets.ts`) :
- `minerai-mine.webp`, `minerai-mine-thumb.webp`, `minerai-mine-icon.webp`
- `silicium-mine.webp`, etc.

### Mapping bâtiment → illustration

Pour cette itération, 3 illustrations disponibles :

| Building ID | Fichier source |
|-------------|---------------|
| `mineraiMine` | `mine-minerai.png` |
| `siliciumMine` | `mine-silicium.png` |
| `hydrogeneSynth` | `mine-hydrogene.png` |

Tous les autres bâtiments utilisent le fallback placeholder (composant `GameImage` existant).

**Attention au naming** : les fichiers source sont nommés `mine-minerai.png` mais l'output doit être `minerai-mine.webp` (car `toKebab('mineraiMine')` → `minerai-mine`). Le script de conversion gère ce mapping explicitement.

## 2. Design system — Tokens rétro-futuristes

### Principe

Le style rétro vient principalement des illustrations pixel art et de la typographie monospace sur les données. L'UI reste sobre et lisible. Les couleurs d'accent sont légèrement désaturées par rapport aux valeurs Tailwind vives.

### Ajouts CSS / Tailwind

**Couleurs d'accent ajustées** (dans `global.css` ou `tailwind.config.js`) :

Les couleurs de ressource existantes (`minerai`, `silicium`, `hydrogene`, `energy`) restent identiques dans Tailwind. Les valeurs désaturées sont appliquées via les composants de la page Buildings directement (pas de changement global pour ne pas impacter les autres pages).

**Nouvelle classe `retro-card`** (remplace `glass-card` sur Buildings) :

```css
.retro-card {
  @apply bg-card border border-border rounded-md transition-colors;
}
.retro-card:hover {
  border-color: rgba(103, 212, 232, 0.3);
  box-shadow: 0 0 10px rgba(103, 212, 232, 0.08);
}
```

Variantes de glow par ressource (classes utilitaires, valeurs rgba basées sur les hex existants) :

```css
.retro-card-minerai:hover {
  border-color: rgba(251, 146, 60, 0.35);  /* #fb923c */
  box-shadow: 0 0 10px rgba(251, 146, 60, 0.1);
}
.retro-card-silicium:hover {
  border-color: rgba(52, 211, 153, 0.35);  /* #34d399 */
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.1);
}
.retro-card-hydrogene:hover {
  border-color: rgba(96, 165, 250, 0.35);  /* #60a5fa */
  box-shadow: 0 0 10px rgba(96, 165, 250, 0.1);
}
.retro-card-energy:hover {
  border-color: rgba(240, 192, 64, 0.35);  /* #f0c040 */
  box-shadow: 0 0 10px rgba(240, 192, 64, 0.1);
}
```

**Typographie** :
- Chiffres, stats, production, coûts, timers : `font-mono` (déjà configuré dans Tailwind)
- Titres de bâtiments : `font-bold text-foreground` (blanc chaud, pas cyan)
- Labels/catégories : `font-mono uppercase tracking-wider text-muted-foreground`

**Badges de niveau** :
- `bg-primary/12 text-primary border border-primary/20 font-mono text-xs font-semibold`

**Boutons** :
- Nouveau variant `retro` du composant `Button` existant : fond dégradé sombre, bordure primary, texte primary, monospace, uppercase
- Hover : fond légèrement plus clair + box-shadow subtil

### Category headers

Les headers de catégorie sont refaits :
- `font-mono uppercase tracking-widest text-sm font-semibold text-muted-foreground`
- Bordure bottom fine
- Pas de background gradient (trop flashy)

## 3. Layout page Buildings — Desktop

### Structure

```
┌─────────────────────────────────────────────┐
│ Page header: "Bâtiments"                    │
├─────────────────────────────────────────────┤
│ Category: MINES & PRODUCTION                │
├──────────┬──────────┬──────────┐            │
│ Card     │ Card     │ Card     │            │
│ [thumb]  │ [thumb]  │ [thumb]  │            │
│ name+lvl │ name+lvl │ name+lvl │            │
│ prod/h   │ prod/h   │ prod/h   │            │
│ costs    │ costs    │ costs    │            │
│ [btn]    │ [btn]    │ [btn]    │            │
├──────────┴──────────┴──────────┘            │
│ Category: INSTALLATIONS                     │
│ ...                                         │
└─────────────────────────────────────────────┘
```

### Carte compacte (desktop)

```
┌─────────────────────────────────┐
│ ┌──────┐  Nom du bâtiment  Niv.5│
│ │ thumb│  1,120/h               │
│ │ 72px │  → Niv.6 : +464/h     │
│ └──────┘                        │
│ [● 2,048] [● 512]    [Niv.6 ↑] │
└─────────────────────────────────┘
```

- Grid : `lg:grid-cols-2 xl:grid-cols-3 gap-4`
- Image thumb : 72x72px, `rounded object-cover`
- Production actuelle + delta prochain niveau
- Resource pills compacts en bas
- Bouton d'amélioration compact aligné à droite
- Clic sur la carte → ouvre l'overlay détail

### Overlay détail (réutilise `EntityDetailOverlay`)

```
┌──────────────────────────────────────────┐
│ ┌─────────────────┐ Nom           Niv.5  │
│ │                 │ Description          │
│ │   Hero image    │ ┌──────┐ ┌──────┐   │
│ │   (full size)   │ │Prod  │ │Niv.6 │   │
│ │                 │ │1120/h│ │1584/h│   │
│ └─────────────────┘ └──────┘ └──────┘   │
│                     Coût: [pills]        │
│                     ⏱ 12m 34s  [Btn]    │
└──────────────────────────────────────────┘
```

- Réutilise `EntityDetailOverlay` existant mais avec un nouveau contenu interne
- Hero image à gauche (ou en haut si viewport étroit)
- Stats en blocs structurés à droite
- Le `BuildingDetailContent` est enrichi avec l'image hero et les stats formatées

## 4. Layout page Buildings — Mobile

### Liste compacte

```
┌───────────────────────────────────┐
│ MINES & PRODUCTION                │
├───────────────────────────────────┤
│ [img44] Mine de Minerai    Niv.5  │
│         [● 2,048] [● 512]    [↑]  │
├───────────────────────────────────┤
│ [img44] Mine de Silicium   Niv.3  │
│         [● 1,024] [● 512]    [↑]  │
├───────────────────────────────────┤
│ [ ☀ ]   Centrale Solaire  Niv.7  │
│         [● 4,096] [● 1,024]  [↑]  │
└───────────────────────────────────┘
```

- Thumbnail 44x44px (icon size ou thumb redimensionné)
- Nom + badge niveau sur la première ligne
- Coûts compacts sur la deuxième ligne
- Bouton ↑ compact à droite
- Clic sur l'item → ouvre le détail via `EntityDetailOverlay` (qui se comporte déjà en bottom-sheet sur mobile)

### Détail mobile (via EntityDetailOverlay)

`EntityDetailOverlay` est déjà responsive : il s'affiche en bottom-sheet slide-up sur mobile et en modal centrée sur desktop. On réutilise ce composant unique pour les deux viewports.

Sur mobile, le contenu du détail s'adapte :
- Hero image en haut (pleine largeur, ~140px de haut)
- Gradient overlay sur le bas de l'image avec nom + niveau
- Stats en blocs 2 colonnes dessous
- Coûts + timer + bouton d'amélioration

Le même `BuildingDetailContent` enrichi sert desktop et mobile, avec un layout responsive interne (grid 2 colonnes sur desktop, stack vertical sur mobile).

## 5. Stratégie de placeholders

**Composant existant** : `GameImage` gère déjà les fallbacks (lettre initiale + couleur déterministe).

**Améliorations** :
- Le placeholder garde le même style mais avec une bordure dashed `border-border` pour signaler visuellement qu'il s'agit d'un placeholder
- La lettre initiale reste en `font-mono`
- Aucun changement structurel — quand une illustration sera ajoutée, le placeholder disparaît automatiquement

**Pas de changement nécessaire à `GameImage`** — le fallback existant fonctionne déjà. On ajoute simplement la bordure dashed dans le CSS du fallback.

## 6. Fichiers impactés

### Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `scripts/optimize-images.ts` | Script de conversion PNG → WebP 3 tailles |
| `apps/web/public/assets/buildings/minerai-mine*.webp` | Images optimisées (3 variants x 3 mines) |

### Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `apps/web/src/pages/Buildings.tsx` | Refonte layout desktop (cartes compactes) + mobile (liste avec thumbs) |
| `apps/web/src/components/entity-details/BuildingDetailContent.tsx` | Ajout hero image + stats en blocs |
| `apps/web/src/styles/global.css` | Ajout classes `.retro-card`, `.retro-card-{resource}` |
| `apps/web/src/components/common/GameImage.tsx` | Ajout bordure dashed sur le fallback placeholder |
| `apps/web/src/components/ui/button.tsx` | Nouveau variant `retro` |
| `package.json` (racine monorepo) | Ajout `sharp` + `@types/sharp` en devDependency |

### Fichiers inchangés

- `apps/web/src/lib/assets.ts` — la convention de nommage et les types sont déjà corrects
- `apps/web/tailwind.config.js` — les couleurs de ressource restent identiques
- Composants layout (`Layout.tsx`, `TopBar.tsx`, etc.) — pas impactés

## Vérification

1. **Script d'images** : exécuter `npx tsx scripts/optimize-images.ts` et vérifier que les 9 fichiers WebP sont générés dans `public/assets/buildings/`
2. **Page Buildings desktop** : vérifier la grid de cartes avec images, le glow au hover, l'overlay détail avec hero
3. **Page Buildings mobile** : vérifier la liste avec thumbnails, le bottom sheet avec hero
4. **Placeholders** : vérifier qu'un bâtiment sans image (ex: Centrale Solaire) affiche le fallback avec bordure dashed
5. **Performance** : vérifier que les images lazy-loadent et que les tailles sont correctes (pas de chargement du hero pour les cartes)
