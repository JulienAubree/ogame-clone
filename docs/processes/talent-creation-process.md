> 🗄️ **ARCHIVÉ** — Le système de Talents a été retiré le 2026-05-03. Voir [`../superpowers/specs/2026-05-03-talents-removal-design.md`](../superpowers/specs/2026-05-03-talents-removal-design.md) pour la migration.

---

# Process de création d'un talent

Ce process est utilisé à chaque fois qu'on veut créer un nouveau talent pour le flagship.

## Etape 1 : Design du talent

Répondre à ces questions :
- **Branche** : Scientifique / Militaire / Industriel
- **Tier** : 1-5 (détermine le coût en Exilium et le seuil de déverrouillage)
- **Type d'effet** : `modify_stat` | `global_bonus` | `planet_bonus` | `unlock`
- **Scope** : Global (toujours actif) | Planétaire (flagship stationné sur la planète)
- **Clé** : identifiant unique (ex: `mine_production_bonus`)
- **Formule** : comment la clé s'applique (ex: `production = base × (1 + bonus)`)
- **Rang max** : 1-3
- **Prérequis** : talent parent (ou aucun)

## Etape 2 : Implémenter le consommateur

AVANT d'ajouter le talent au seed :
1. Identifier le fichier service qui doit lire la clé
2. Ajouter la lecture de `talentCtx['ma_cle']` avec la formule définie
3. Vérifier que la valeur par défaut (0) ne change rien au comportement existant

## Etape 3 : Ajouter le talent au seed

Dans `packages/db/src/seed-game-config.ts`, ajouter la définition du talent avec :
- `effectType` correspondant au type d'effet
- `effectParams` avec `key` et `perRank`

## Etape 4 : Mettre à jour la page admin "Clés de gameplay"

Ajouter la nouvelle clé dans `apps/admin/src/pages/GameplayKeys.tsx` avec :
- Clé, label, description
- Source et consommateur
- Formule et exemple

## Etape 5 : Tester

1. Re-seed la DB
2. Investir dans le talent en jeu
3. Vérifier que l'effet s'applique bien
4. Vérifier que sans le talent, le comportement est inchangé

## Types d'effets

### modify_stat
Modifie une stat du flagship directement (weapons, shield, hull, etc.)
- Lu par `flagship.service.ts getStatBonuses()`
- Formule : `stat = base + (perRank × rank)`

### global_bonus
Bonus toujours actif (tant que le talent est investi)
- Lu par `computeTalentContext()` → injecté dans `talentCtx`
- Disponible dans tous les services qui reçoivent le talentCtx

### planet_bonus
Bonus actif uniquement quand le flagship est stationné sur la planète
- Lu par `computeTalentContext(userId, planetId)` → vérifie flagship.planetId === planetId
- Ne s'applique PAS quand le flagship est en mission

### unlock
Déverrouille une fonctionnalité (propulsion, etc.)
- Lu par `flagship.service.ts get()` pour les unlocks de drive

## Branches

- **Scientifique** : recherches, espionnage, information
- **Militaire** : combat, attaque, défense
- **Industriel** : minage, recyclage, production, commerce
