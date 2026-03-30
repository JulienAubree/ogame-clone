# Commission marche payee par le vendeur - Design Spec

## Contexte

Actuellement la commission du marche (5% par defaut) est payee par l'acheteur en plus du prix affiche. Les montants de commission sont calcules sur chaque composante du prix (minerai, silicium, hydrogene) et detruits a la completion du trade.

## Nouveau comportement

La commission est payee par le **vendeur** au moment ou il depose son offre. Elle est calculee sur la **quantite de ressource vendue**, dans la **meme ressource**, et **detruite immediatement**. L'acheteur paie exactement le prix affiche, sans surplus.

## Regles metier

1. **Commission a la creation** : `Math.ceil(quantity * adjustedPercent / 100)` preleve en plus de l'escrow, dans la meme ressource que celle vendue.
2. **Talent `market_fee`** : s'applique au vendeur. Formule : `adjustedPercent = commissionPercent / (1 + talentBonus)`. Un talent de 0.5 reduit la commission de 5% a ~3.33%.
3. **Non remboursable** : en cas d'annulation ou d'expiration, seule la quantite escrow est rendue. La commission est perdue definitivement.
4. **Acheteur** : paie exactement le prix affiche par le vendeur. Aucune commission cote acheteur.
5. **Sink economique** : la commission est detruite (non creditee a qui que ce soit), preservant le role de sink du marche.

## Exemple

- Vendeur poste 10 000 minerais, commission 5%
- Commission = `Math.ceil(10000 * 5 / 100)` = 500 minerais
- Total preleve de la planete du vendeur : 10 500 minerais
- 10 000 sont en escrow (retournables si annulation/expiration)
- 500 sont detruits immediatement
- L'acheteur envoie une flotte avec exactement le prix demande en cargo

## Changements par fichier

### `packages/game-engine/src/formulas/market.ts`

- Supprimer `calculateCommission(price, percent)` (3 composantes, cote acheteur)
- Ajouter `calculateSellerCommission(quantity: number, commissionPercent: number): number` qui retourne `Math.ceil(quantity * commissionPercent / 100)`
- `maxMarketOffers` : inchange

### `apps/api/src/modules/market/market.service.ts`

- Dans `createOffer` :
  - Recuperer le talent context du vendeur via `talentService.computeTalentContext(userId)`
  - Calculer `adjustedPercent = commissionPercent / (1 + (talentCtx['market_fee'] ?? 0))`
  - Calculer `commission = calculateSellerCommission(quantity, adjustedPercent)`
  - `spendResources` avec `quantity + commission` au lieu de `quantity` seul
- Annulation/expiration : inchange (seul `quantity` est rembourse)

### `apps/api/src/modules/fleet/handlers/trade.handler.ts`

- **`validateFleet`** : supprimer tout le bloc de calcul de commission (lignes 73-88). Le cargo requis = prix de l'offre uniquement. Supprimer l'import et l'appel a `calculateCommission`. Supprimer le calcul de talent `market_fee` cote acheteur.
- **`processArrival`** : inchange (vendeur recoit le prix, acheteur recoit la marchandise)

### `apps/web/src/pages/Market.tsx`

- **Tab Acheter** : supprimer l'affichage de la commission sur les cartes d'offre. Le bouton "Acheter" envoie le cargo = prix exact (sans `+ commission`). Supprimer les variables `commMi`, `commSi`, `commH2`.
- **Tab Vendre** : dans le formulaire de creation, afficher un recap :
  - Quantite mise en vente : X [ressource]
  - Commission (Y%) : Z [ressource]
  - Total preleve : X + Z [ressource]
  - Supprimer l'ancien texte "Commission payee par l'acheteur"

### `packages/game-engine/src/formulas/market.test.ts` (a creer)

- Tests pour `calculateSellerCommission` :
  - Cas nominal (10000, 5%) → 500
  - Arrondi ceil (101, 5%) → 6
  - Quantite 0 → 0
  - Commission 0% → 0
- Tests pour `maxMarketOffers` : existants ou a ajouter

## Hors scope

- Changement de schema DB (aucun champ ajoute/supprime)
- Modification du systeme de reservation/annulation/expiration
- Modification du calcul de fuel ou du transport
