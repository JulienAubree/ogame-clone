# Redesign du marche galactique — sidebar + separation ressources/rapports

## Contexte

Le marche galactique a grandi organiquement : 4 onglets a plat (Acheter / Vendre / Mes offres / Rapports) dans un seul fichier de 470 lignes. L'ajout recent des rapports d'exploration rend la navigation confuse — ressources et rapports sont melanges dans la meme barre d'onglets sans distinction visuelle.

L'objectif est de separer clairement les deux sections du marche (ressources vs rapports) via un redesign de la navigation, tout en profitant pour eclater le fichier monolithique en composants propres.

## Principes

- **Separation nette** : deux sections visuellement distinctes avec leur propre identite couleur
- **Desktop sidebar** : navigation permanente a gauche, contenu a droite — pattern classique pour une page a 5+ sous-vues
- **Mobile onglets empiles** : deux lignes (section toggle + sous-onglets contextuels) — compact et lisible
- **Zero changement backend** : refactoring purement UI, meme endpoints tRPC, meme data
- **Extraction de composants** : le monolithe Market.tsx est eclate en composants focalises

## Navigation

### Etat

```ts
type MarketView =
  | 'resource-buy'
  | 'resource-sell'
  | 'resource-my'
  | 'report-buy'
  | 'report-my';
```

La section active se derive : `view.startsWith('resource') ? 'resources' : 'reports'`.

### Desktop (>= lg / 1024px)

Sidebar gauche fixe (~180px) avec deux groupes separes visuellement :

```
┌────────────┬────────────────────────────────────┐
│ RESSOURCES │                                    │
│  Acheter   │        Contenu de la               │
│  Vendre    │        sous-page active             │
│  Mes offres│                                    │
│────────────│                                    │
│ RAPPORTS   │                                    │
│  Acheter   │                                    │
│  Mes rapp. │                                    │
└────────────┴────────────────────────────────────┘
```

### Mobile (< lg)

Deux lignes d'onglets empiles en haut du contenu :

```
[ Ressources ] [ Rapports ]        ← toggle section
[ Acheter ] [ Vendre ] [ Mes offres ]  ← sous-onglets contextuels
```

Les sous-onglets changent quand la section change :
- Ressources → Acheter / Vendre / Mes offres
- Rapports → Acheter / Mes rapports

## Composants

### Fichiers a creer

| Fichier | Role | Taille approx |
|---------|------|---------------|
| `MarketSidebar.tsx` | Sidebar desktop avec 5 items en 2 groupes | ~80 lignes |
| `MarketMobileTabs.tsx` | Deux lignes d'onglets pour mobile | ~70 lignes |
| `ResourceBuy.tsx` | Extraction du contenu "Acheter ressources" | ~100 lignes |
| `ResourceSell.tsx` | Extraction du formulaire "Vendre" | ~120 lignes |
| `ResourceMyOffers.tsx` | Extraction de "Mes offres" | ~80 lignes |

Tous dans `apps/web/src/components/market/`.

### Fichiers a modifier

| Fichier | Changement |
|---------|------------|
| `Market.tsx` | Refactored : layout wrapper (sidebar + mobile tabs + contenu), state `MarketView`, prerequis batiment. Passe de ~470 lignes a ~80 lignes. |

### Fichiers inchanges

`MarketReportsBuy.tsx` et `MarketReportsInventory.tsx` — deja extraits, pas besoin de les toucher.

## Style

### Sidebar (desktop)

- Container : `w-[180px] flex-shrink-0 bg-black/30 border-r border-cyan-500/10`
- Headers de section : `text-[10px] uppercase tracking-wider px-4 pt-4 pb-1`
  - Ressources : `text-orange-400/70`
  - Rapports : `text-purple-400/70`
- Separateur entre sections : `border-t border-white/10 mx-4 my-2`
- Items : `block w-full text-left px-4 py-2.5 text-sm transition-colors`
  - Actif : `bg-cyan-500/10 text-primary border-l-2 border-primary`
  - Inactif : `text-muted-foreground hover:bg-white/5 border-l-2 border-transparent`

### Onglets mobiles

- Ligne 1 (section toggle) : deux boutons `flex-1`, style segmented control
  - Actif : `bg-primary/10 text-primary border border-primary/50`
  - Inactif : `text-muted-foreground border border-border`
- Ligne 2 (sous-onglets) : `flex flex-wrap gap-2`, meme style pill que les filtres actuels du marche

### Identite couleur

- **Ressources** : accent orange (`text-orange-400`, `border-orange-*`). Coherent avec minerai = couleur dominante des ressources.
- **Rapports** : accent violet (`text-purple-400`, `border-purple-*`). Coherent avec le badge de rarete "epic" et la vibe exploration/intelligence.

Les accents couleur apparaissent uniquement sur les headers de section dans la sidebar et sur le toggle mobile — le contenu des sous-pages garde ses propres couleurs (les cards de ressources gardent leurs couleurs par type, les cards de rapports gardent leurs badges de rarete).

## Props des composants extraits

### MarketSidebar

```ts
interface MarketSidebarProps {
  view: MarketView;
  onViewChange: (view: MarketView) => void;
}
```

### MarketMobileTabs

```ts
interface MarketMobileTabsProps {
  view: MarketView;
  onViewChange: (view: MarketView) => void;
}
```

### ResourceBuy

```ts
interface ResourceBuyProps {
  planetId: string;
}
```

Contient ses propres queries (`market.list`), state de filtre, et le handler d'achat. Extrait tel quel de Market.tsx.

### ResourceSell

```ts
interface ResourceSellProps {
  planetId: string;
  commissionPercent: number;
}
```

Contient le formulaire, les mutations, le preview de commission. Extrait tel quel.

### ResourceMyOffers

```ts
interface ResourceMyOffersProps {
  planetId: string;
}
```

Contient la query `market.myOffers` et les boutons d'annulation. Extrait tel quel. Note : ne montre que les offres de ressources (pas les rapports — ceux-ci sont dans MarketReportsInventory).

## Layout dans Market.tsx apres refactoring

```tsx
<div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
  <PageHeader title="Marche Galactique" />

  {marketLevel < 1 ? (
    <MarketLockedPlaceholder />
  ) : (
    <div className="flex gap-0 lg:gap-0">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <MarketSidebar view={view} onViewChange={setView} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Mobile tabs */}
        <div className="lg:hidden mb-4">
          <MarketMobileTabs view={view} onViewChange={setView} />
        </div>

        {/* Content */}
        <div className="glass-card p-4 lg:p-5">
          {view === 'resource-buy' && <ResourceBuy planetId={planetId!} />}
          {view === 'resource-sell' && <ResourceSell planetId={planetId!} commissionPercent={commissionPercent} />}
          {view === 'resource-my' && <ResourceMyOffers planetId={planetId!} />}
          {view === 'report-buy' && <MarketReportsBuy planetId={planetId!} />}
          {view === 'report-my' && <MarketReportsInventory planetId={planetId!} />}
        </div>
      </div>
    </div>
  )}
</div>
```

## Hors scope

- Changements backend (routes, services, endpoints)
- Ajout de nouvelles fonctionnalites (recherche, tri, stats)
- Modification de MarketReportsBuy ou MarketReportsInventory
- Animation de transition entre sous-pages
