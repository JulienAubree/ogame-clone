# Refonte des rapports de mission — Design Spec

## Contexte

Les rapports de combat actuels ne reflètent pas le nouveau système de combat (shotCount, armure plate, FP). De plus, les missions pirates ne génèrent aucun rapport structuré — seulement un message système texte. La page rapports utilise un split view vieillissant avec le détail chargé via query param `?id=`.

Cette refonte couvre :
- Tous les rapports de combat (PvP attaque + PvE pirate) avec le nouveau format
- Une page liste modernisée avec filtres et notifications
- Des pages détail dédiées (route séparée) par type de rapport
- Les rapports mine et espionnage conservent leur contenu actuel dans le nouveau template

## 1. Routes

| Route | Description |
|-------|-------------|
| `/reports` | Liste paginée de tous les rapports avec filtres |
| `/reports/:id` | Page détail dédiée (contenu adapté au type) |

L'ancien système avec `?id=` en query param est remplacé par une vraie route de détail.

## 2. Backend

### 2.1 Pirate handler → rapport complet

Le `pirate.handler.ts` doit créer un rapport de combat structuré comme `attack.handler.ts`. Actuellement il ne crée qu'un message système via `messageService.createSystemMessage()`.

**Approche :** Modifier `processPirateArrival()` dans `pirateService` pour qu'il retourne le `CombatResult` complet (rounds, stats, pertes) en plus de ce qu'il retourne déjà (outcome, survivingShips, loot, bonusShips). Le pirate handler utilisera ensuite ce résultat pour créer un rapport via `reportService.create()` avec le même format que les attaques PvP.

**Changements nécessaires :**
- `pirateService.processPirateArrival()` retourne le `CombatResult` complet
- Le pirate handler appelle `reportService.create()` avec le résultat structuré
- Le loot (pillage) et les vaisseaux bonus sont inclus dans le résultat JSONB
- Le message système est conservé en complément (notification rapide)

### 2.2 Format du résultat JSONB étendu

Le `result` JSONB des rapports de combat (attaque + pirate) est étendu avec :

```typescript
{
  // Existant (inchangé)
  outcome: 'attacker' | 'defender' | 'draw',
  roundCount: number,
  attackerFleet: Record<string, number>,
  attackerLosses: Record<string, number>,
  attackerSurvivors: Record<string, number>,
  attackerStats: CombatSideStats,
  defenderFleet: Record<string, number>,
  defenderDefenses: Record<string, number>,
  defenderLosses: Record<string, number>,
  defenderSurvivors: Record<string, number>,
  defenderStats: CombatSideStats,
  repairedDefenses: Record<string, number>,
  debris: { minerai: number; silicium: number },
  rounds: RoundResult[],
  pillage?: { minerai: number; silicium: number; hydrogene: number },

  // Nouveau
  attackerFP: number,          // FP total de la flotte attaquante
  defenderFP: number,          // FP total de la flotte défenseur
  shotsPerRound: {             // Tirs par round par camp
    attacker: number;
    defender: number;
  }[],
  bonusShips?: Record<string, number>,  // Vaisseaux bonus (pirate uniquement)
}
```

Le `CombatSideStats` existant inclut déjà `shieldAbsorbed`, `armorBlocked`, `overkillWasted` et `damageDealtByCategory`. Pas besoin de le modifier.

### 2.3 Auto-cleanup

Le `cleanupOldReports` supprime les rapports non-`attack` après 3 jours. Maintenant que les rapports pirate sont des rapports de combat complets, il faut aussi exclure le type `pirate` du cleanup automatique.

### 2.4 API tRPC

Endpoints existants : `list`, `detail`, `byMessage`, `delete`, `unreadCount`.

**Nouveau :**
- `report.markAllRead` — mutation pour marquer tous les rapports non lus comme lus

**Inchangé :**
- `report.list` — retourne déjà tous les champs nécessaires (missionType, title, read, result, coordinates, createdAt)
- `report.detail` — retourne le rapport complet et le marque comme lu

### 2.5 Suppression des anciens rapports

Script SQL ou migration pour supprimer tous les rapports existants. Les nouveaux rapports seront générés avec le nouveau format. Pas de backward compatibility.

## 3. Frontend — Page liste (`/reports`)

### Structure

- `PageHeader` "Rapports" avec à droite un bouton "Tout marquer comme lu"
- Filtres par type : pills cliquables (Tous | Combat | Mine | Espionnage)
- Liste de `ReportCard` scrollable avec pagination curseur (existante)
- Point bleu sur les rapports non lus

### Composant ReportCard

Chaque carte affiche :
- **Icône type** : épée (combat), pioche (mine), oeil (espionnage)
- **Titre** : ex "Attaque pirate [2:45:8]"
- **Badge résultat** : Victoire (vert) / Défaite (rouge) / Nul (jaune) / Terminée (bleu) selon le type
- **Infos clés** :
  - Combat : "450 FP vs 320 FP · 3 rounds"
  - Mine : "M: 12 500 · S: 8 200"
  - Espionnage : nombre de sections visibles
- **Date relative** : "il y a 2h"
- **Indicateur non lu** : point bleu à gauche ou texte en bold
- Clic → `navigate(/reports/${id})`

## 4. Frontend — Page détail combat

### Route `/reports/:id` pour les rapports de type `attack` et `pirate`

De haut en bas :

### 4.1 En-tête
- Bouton retour "← Rapports" (navigate back)
- Titre : type + coordonnées (ex: "Attaque pirate [2:45:8]")
- Date complète (ex: "27 mars 2026 à 14h32")
- Badge résultat (Victoire/Défaite/Nul) avec couleur

### 4.2 Barre FP
- Barre proportionnelle : bleu (attaquant) vs rouge (défenseur)
- Labels : "Votre flotte : 450 FP" à gauche, "Pirates : 320 FP" à droite
- Ratio visuel basé sur `attackerFP / (attackerFP + defenderFP)`

### 4.3 Stats clés
Grille 4 colonnes :
- **Rounds** : nombre total
- **Tirs** : somme de tous les tirs (toutes les entrées de `shotsPerRound`)
- **Bouclier absorbé** : total des deux camps
- **Armure bloquée** : total des deux camps

### 4.4 Pertes
Deux colonnes :
- **Vos pertes** (bleu) : liste des unités perdues avec quantité
- **Pertes ennemies** (rouge) : idem

### 4.5 Butin et débris
Deux colonnes :
- **Butin** (jaune) : minerai, silicium, hydrogène pillés (si applicable)
- **Débris** (gris) : minerai, silicium récupérables

### 4.6 Vaisseaux bonus (pirate uniquement)
Section spéciale avec fond vert/emerald :
- Icône + "Vaisseaux capturés"
- Liste des vaisseaux bonus avec quantité

### 4.7 Défenses réparées (attaque PvP avec défenses)
Section conditionnelle si `repairedDefenses` non vide.

### 4.8 Replay du combat
Section dépliable (fermée par défaut) :
- Titre cliquable : "▶ Voir le replay du combat (N rounds)"
- Contenu déplié : composant `RoundDisplay` du combat guide en mode manuel (`autoPlayDelay=0`)
- Bouton "▶ Lancer le replay" pour passer en auto-play
- Les données `initialAttacker`/`initialDefender` viennent de `attackerFleet`/`defenderFleet` du résultat
- Les rounds viennent directement de `result.rounds`

### Style
Cohérent avec le reste de l'app : `glass-card`, couleurs thématiques, textes en `text-xs`/`text-sm`.

## 5. Frontend — Pages détail mine et espionnage

Même template (en-tête avec retour + titre + date) mais contenu inchangé :
- **Mine** : pipeline 4 étapes (voyage → extraction → chargement → retour)
- **Espionnage** : niveaux de visibilité, comparaison tech, chance de détection

Le composant de détail est extrait de l'actuel `Reports.tsx` monolithique (1052 lignes) en composants dédiés.

## 6. Composants

### Nouveaux
- `apps/web/src/pages/Reports.tsx` — refonte complète, page liste uniquement
- `apps/web/src/pages/ReportDetail.tsx` — page wrapper qui charge le rapport et dispatch au bon composant de détail
- `apps/web/src/components/reports/ReportCard.tsx` — carte résumé pour la liste
- `apps/web/src/components/reports/CombatReportDetail.tsx` — détail combat (attaque + pirate)
- `apps/web/src/components/reports/MineReportDetail.tsx` — détail mine (contenu extrait de l'actuel)
- `apps/web/src/components/reports/SpyReportDetail.tsx` — détail espionnage (contenu extrait de l'actuel)

### Réutilisés
- `apps/web/src/components/combat-guide/RoundDisplay.tsx` — replay animé round par round

## 7. Fichiers impactés

### Backend
- `apps/api/src/modules/fleet/handlers/pirate.handler.ts` — génération rapport complet
- `apps/api/src/modules/fleet/handlers/attack.handler.ts` — ajout FP + shotsPerRound au résultat
- `apps/api/src/modules/report/report.service.ts` — ajout méthode `markAllRead`
- `apps/api/src/modules/report/report.router.ts` — ajout endpoint `markAllRead`

### Frontend
- `apps/web/src/pages/Reports.tsx` — refonte complète (liste seule)
- `apps/web/src/pages/ReportDetail.tsx` — nouveau
- `apps/web/src/components/reports/*.tsx` — nouveaux composants
- `apps/web/src/router.tsx` — ajout route `/reports/:id`

### Base de données
- Aucune migration de schéma (le JSONB est flexible)
- Script SQL pour supprimer les anciens rapports

## 8. Ce qui ne change pas

- Le schéma de la table `mission_reports` (colonnes identiques)
- Le `CombatResult` du game-engine (pas de modification du moteur de combat)
- Les rapports de transport et recyclage (hors scope)
- Le système de messages (les messages système restent en complément des rapports)
