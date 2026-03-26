# Spec — Refonte du système de combat spatial

**Date :** 2026-03-26
**Statut :** Validé (brainstorming)

---

## 1. Objectif

Remplacer le système de combat OGame classique (rapid fire probabiliste, ciblage aléatoire, armor-PV) par un système original reposant sur trois piliers :

- **Les boucliers absorbent les premiers dégâts**
- **Le blindage réduit chaque impact atteignant la coque**
- **Les petits tirs saturent, les gros tirs percent**

Le système doit être simple, lisible dans un rapport de combat, et créer une vraie différence entre types de vaisseaux et compositions de flotte.

---

## 2. Principes de design

- Lisibilité du rapport de combat
- Simulation facile et rapide côté serveur
- Distinction claire entre armes à saturation et armes à perçage
- Flottes mixtes naturellement intéressantes
- Pas d'état complexe à persister après combat
- Profondeur tactique légère via la priorité de cible
- Tout est configurable via le game config (catégories, stats, constantes)

---

## 3. Statistiques d'une unité de combat

Chaque vaisseau ou défense possède 5 statistiques :

| Stat | Description | Bonus recherche |
|------|-------------|-----------------|
| **Bouclier** | Protection temporaire, absorbe les dégâts en premier. Régénéré à 100% au début de chaque round. | +10% par niveau tech bouclier |
| **Blindage** | Réduction fixe appliquée à chaque tir atteignant la coque. Ne protège pas le bouclier. Propriété intrinsèque du vaisseau. | Aucun (intrinsèque) |
| **Coque** | Points de vie réels. Ne se régénère pas. À 0 = destruction. | +10% par niveau tech blindage |
| **Armement** | Dégâts infligés par un tir unique. | +10% par niveau tech armes |
| **Nombre de tirs** | Nombre d'impacts par round. Propriété intrinsèque. | Aucun (intrinsèque) |

---

## 4. Catégories

Les unités sont classées en catégories définies dans le game config. Les catégories ne sont **pas hardcodées** — le moteur les traite de manière générique.

Catégories initiales :

| Catégorie | Ciblable en priorité | Ordre de débordement | Description |
|-----------|---------------------|----------------------|-------------|
| **Léger** | Oui | 1 | Petits vaisseaux rapides, saturation |
| **Moyen** | Oui | 2 | Ligne principale, polyvalence |
| **Lourd** | Oui | 3 | Grosses unités, perçage |
| **Support** | Non | 4 | Utilitaires, ciblés en dernier |

### Configuration d'une catégorie

```typescript
interface ShipCategory {
  id: string
  name: string
  targetable: boolean     // sélectionnable comme priorité de cible
  targetOrder: number     // ordre de débordement (plus bas = ciblé d'abord en fallback)
}
```

---

## 5. Structure d'un combat

### Paramètres globaux (game config)

```typescript
interface CombatConfig {
  maxRounds: number              // 4
  debrisRatio: number            // 0.30
  defenseRepairRate: number      // 0.70
  pillageRatio: number           // 0.33
  minDamagePerHit: number        // 1
  researchBonusPerLevel: number  // 0.10
  categories: ShipCategory[]
}
```

### Entrées du simulateur

```typescript
interface CombatInput {
  attackerFleet: Record<string, number>
  defenderFleet: Record<string, number>
  defenderDefenses: Record<string, number>
  attackerTechLevels: { weapons: number; shielding: number; armor: number }
  defenderTechLevels: { weapons: number; shielding: number; armor: number }
  attackerTargetPriority: string          // categoryId
  defenderTargetPriority: string          // categoryId
  combatConfig: CombatConfig
  shipConfigs: ShipCombatConfig[]
  rngSeed?: number                        // replay déterministe
}
```

### Déroulement

1. Créer les unités des deux camps (bonus recherche appliqués)
2. Pour chaque round (1 → maxRounds) :
   a. Snapshot des unités vivantes des deux camps
   b. Camp attaquant tire (basé sur le snapshot)
   c. Camp défenseur tire (basé sur le même snapshot)
   d. Appliquer les destructions (hull ≤ 0 → destroyed)
   e. Régénérer les boucliers des survivants à maxShield
   f. Enregistrer le résultat du round
   g. Si un camp est anéanti → fin
3. Déterminer l'issue (attacker / defender / draw)
4. Post-combat : débris, pillage, réparation défenses

**Combat simultané :** Les étapes 2b et 2c utilisent le même snapshot de début de round. Un vaisseau détruit en 2b tire quand même en 2c — sa salve était déjà préparée.

### Résolution d'une salve (un vaisseau)

```
Pour chaque tir (1 → shotCount) :
  1. Choisir une cible vivante :
     - D'abord dans la catégorie prioritaire (aléatoire)
     - Si vide → catégorie suivante par targetOrder (aléatoire)
  2. Appliquer le tir :
     a. Si shield > 0 : dégâts absorbés par le bouclier
        - Si weaponDamage ≤ shield → shield -= weaponDamage, fin
        - Sinon → surplus = weaponDamage - shield, shield = 0
     b. Dégâts coque = max(surplus - armor, minDamagePerHit)
     c. hull -= dégâts coque
  3. Si hull ≤ 0 → marquer destroyed
     - Les tirs restants (shotCount non utilisés) sont redirigés vers une nouvelle cible
     - Le surplus de dégâts du tir fatal est perdu (coût d'overkill)
```

### Bonus recherche

- `maxShield = baseShield × (1 + researchBonusPerLevel × shieldTechLevel)`
- `maxHull = baseHull × (1 + researchBonusPerLevel × armorTechLevel)`
- `weaponDamage = baseWeaponDamage × (1 + researchBonusPerLevel × weaponsTechLevel)`
- `armor = baseArmor` (intrinsèque)
- `shotCount = baseShotCount` (intrinsèque)

---

## 6. Conséquences de design : saturation vs perçage

### Armes à multi-tirs (légers)
- **Forces :** font tomber les boucliers vite, nettoient les cibles fragiles
- **Faiblesses :** perdent de l'efficacité contre le blindage (chaque petit tir est réduit)

### Armes à gros tir unique (lourds)
- **Forces :** percent les boucliers, traversent le blindage
- **Faiblesses :** gaspillent sur petites cibles (overkill), moins efficaces contre les essaims

### Exemple

**Cible :** Bouclier 20, Blindage 4, Coque 50

| Arme | Tirs | Dégâts/tir | Bouclier absorbé | Blindage bloqué | Dégâts coque |
|------|------|-----------|------------------|-----------------|-------------|
| A (gros) | 1 × 50 | 50 | 20 | 4 | **26** |
| B (saturation) | 10 × 5 | 5 | 20 (4 tirs) | 4 × 6 = 24 | **6** (min 1 × 6) |

---

## 7. Roster des vaisseaux

### Vaisseaux de combat

| Vaisseau | Catégorie | Bouclier | Blindage | Coque | Armement | Tirs | Rôle |
|----------|-----------|----------|----------|-------|----------|------|------|
| **Intercepteur** | Léger | 8 | 1 | 12 | 4 | 3 | Saturation, anti-léger, nettoyage |
| **Frégate** | Moyen | 16 | 2 | 30 | 12 | 2 | Polyvalence, tenue de ligne |
| **Croiseur** | Lourd | 28 | 4 | 55 | 45 | 1 | Perçage, anti-lourd |
| **Cuirassé** | Lourd | 40 | 6 | 100 | 70 | 1 | Briseur de ligne, siège |

### Vaisseaux utilitaires (support)

Petit Cargo, Grand Cargo, Recycleur, Sonde d'espionnage, Vaisseau de colonisation, Explorateur, Prospecteur.

Stats de combat très faibles (bouclier 1-2, blindage 0, coque minimale, 1 tir faible). Le satellite solaire ne participe pas au combat.

---

## 8. Roster des défenses

| Défense | Catégorie | Bouclier | Blindage | Coque | Armement | Tirs | Rôle |
|---------|-----------|----------|----------|-------|----------|------|------|
| **Lance-roquettes** | Léger | 6 | 1 | 10 | 5 | 2 | Anti-léger, en masse |
| **Laser léger** | Léger | 8 | 1 | 12 | 7 | 3 | Saturation améliorée |
| **Laser lourd** | Moyen | 18 | 3 | 35 | 15 | 2 | Polyvalent |
| **Canon électromagnétique** | Lourd | 30 | 5 | 60 | 50 | 1 | Anti-lourd, perçage |
| **Tourelle à plasma** | Lourd | 50 | 7 | 120 | 80 | 1 | Défense ultime, anti-cuirassé |
| **Petit bouclier** | Lourd | 60 | 2 | 40 | 1 | 1 | Tank absorbeur (max 1/planète) |
| **Grand bouclier** | Lourd | 150 | 4 | 80 | 1 | 1 | Tank absorbeur (max 1/planète) |

70% de réparation automatique post-combat pour toutes les défenses.

---

## 9. Sorties du simulateur

```typescript
interface CombatResult {
  rounds: RoundResult[]
  outcome: 'attacker' | 'defender' | 'draw'
  attackerLosses: Record<string, number>
  defenderLosses: Record<string, number>
  debris: Record<string, number>
  repairedDefenses: Record<string, number>
  attackerStats: CombatSideStats
  defenderStats: CombatSideStats
}

interface CombatSideStats {
  damageDealtByCategory: Record<string, number>
  damageReceivedByCategory: Record<string, number>
  shieldAbsorbed: number
  armorBlocked: number
  overkillWasted: number
}

interface RoundResult {
  round: number
  attackerShips: Record<string, number>
  defenderShips: Record<string, number>
  attackerStats: CombatSideStats
  defenderStats: CombatSideStats
}
```

---

## 10. Approche d'implémentation

**Simulation unité par unité.** Chaque vaisseau est une entité individuelle. Chaque tir est résolu séquentiellement. Fidélité maximale au design, simple à coder/debugger, performant pour les tailles de flotte attendues.

---

## 11. Périmètre des modifications

### Réécriture
- `packages/game-engine/src/formulas/combat.ts` — moteur complet
- `packages/game-engine/src/formulas/combat.test.ts` — tests complets
- `packages/db/src/seed-game-config.ts` — nouvelles stats, catégories, suppression rapid fire

### Modification
- `apps/api/src/modules/fleet/handlers/attack.handler.ts` — nouvelle interface simulateur, priorité de cible
- `apps/api/src/modules/fleet/handlers/pirate.handler.ts` — idem PvE
- `apps/api/src/modules/fleet/fleet.service.ts` — priorité de cible dans les données de mission
- `packages/db/src/schema/fleet-events.ts` — champ priorité de cible
- `packages/db/src/schema/planet-ships.ts` — nouveaux identifiants vaisseaux
- `packages/db/src/schema/planet-defenses.ts` — nouveaux identifiants défenses
- `apps/web/src/pages/Reports.tsx` — nouveau format de rapport avec stats par catégorie
- UI d'envoi de flotte — sélecteur de priorité de cible
- Pages de construction — nouveaux noms

### Inchangé
- Mécaniques de déplacement de flotte (vitesse, fuel, distance)
- Espionnage
- Système de ressources
- Formules post-combat (débris 30%, pillage 1/3, réparation 70%) — mêmes ratios, branchées sur la nouvelle sortie

---

## 12. Lecture joueur

> **Les petites armes font tomber les boucliers.**
> **Le blindage réduit les petits impacts.**
> **Les grosses armes percent le blindage.**
> **La coque est la vraie vie du vaisseau.**

---

## 13. Boucle tactique centrale

1. Faire tomber les boucliers
2. Traverser le blindage
3. Détruire la coque

C'est cette logique qui structure les rôles des vaisseaux et l'intérêt des compositions de flotte.
