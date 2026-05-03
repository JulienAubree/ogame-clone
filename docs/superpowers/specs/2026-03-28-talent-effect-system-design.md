> 🗄️ **ARCHIVÉ** — Le système de Talents a été retiré le 2026-05-03. Voir [`2026-05-03-talents-removal-design.md`](2026-05-03-talents-removal-design.md) pour la migration.

---

# Talent Effect System — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Faire en sorte que les talents du flagship aient des effets concrets sur les 13 systemes du jeu (production, combat, construction, recherche, flotte, marche, PvE, defenses, pillage, stockage, chantier naval, propulsion, flagship stats).

**Architecture:** Approche B — TalentBonusContext pre-calcule. Une fonction `computeTalentContext(userId, planetId?)` retourne un `Record<string, number>` avec tous les bonus actifs. Chaque service le recoit et l'applique a cote des bonus research/building existants. Stacking additif. Pas de changement de schema DB.

**Tech Stack:** TypeScript, tRPC, Drizzle ORM, game-engine (formulas)

---

## 1. Mecanisme central : `computeTalentContext()`

### Signature

```typescript
async computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>>
```

### Emplacement

Nouvelle methode dans `talent.service.ts` (retournee par `createTalentService()`).

### Logique

1. Fetch flagship (`id`, `planetId`, `status`) via query existante
2. Fetch talent ranks via `getTalentRanks(flagshipId)` existant
3. Fetch game config via `gameConfigService.getFullConfig()` (cached)
4. Fetch cooldowns actifs via query `flagshipCooldowns`
5. Pour chaque talent investi (rank > 0), selon `effectType` :
   - **`global_bonus`** : toujours ajoute → `ctx[key] += perRank * rank`
   - **`planet_bonus`** : ajoute seulement si `flagship.status === 'active' && flagship.planetId === planetId` → `ctx[key] += perRank * rank`
   - **`timed_buff`** : ajoute seulement si le buff est actif (`expiresAt > now` dans cooldowns ET talent toujours investi) → `ctx[key] += perRank * rank`
   - **`modify_stat`** : ignore (deja gere par `getStatBonuses()` existant)
   - **`unlock`** : ajoute avec valeur = `rank` (permet `ctx[key] > 0` pour feature gates)
6. Retourne `Record<string, number>`

### Convention des valeurs

Toutes les valeurs sont des fractions additives positives representant une amelioration :
- `0.10` = +10% d'amelioration
- `1` = +1 (pour les compteurs comme les builds paralleles)
- `> 0` = debloque (pour les unlocks)

### Edge cases

| Cas | Comportement |
|---|---|
| Pas de flagship | Retourne `{}` — zero bonus, zero crash |
| Flagship incapacite | `planet_bonus` desactive (status !== 'active'), `global_bonus` reste actif |
| Flagship en mission | `planet_bonus` desactive (pas stationne), `global_bonus` reste actif |
| Aucun talent investi | Retourne `{}` |
| Talent respec pendant un buff actif | Le buff expire naturellement, `computeTalentContext` verifie que le talent est toujours investi avant d'inclure le buff |
| Cle inconnue dans un service | `ctx[key] ?? 0` = pas d'effet, pas d'erreur |
| Plusieurs talents sur la meme cle | Somme additive automatique |

### Performance

2-3 queries DB (flagship, ranks, cooldowns) + 1 config cached. Meme cout que l'actuel `getStatBonuses()` deja appele a chaque `flagship.get()`. Pas de regression.

---

## 2. Convention des cles de bonus

Les cles ne sont pas hardcodees — l'admin cree un talent avec la `key` qu'il veut dans `effectParams`. Les services cherchent les cles qui les concernent via `ctx[key] ?? 0`.

### Cles par systeme

| Systeme | Cles de bonus | Scope | Fichier d'integration | Formule |
|---|---|---|---|---|
| **Production** | `production_minerai`, `production_silicium`, `production_hydrogene` | planet_bonus | `game-engine/formulas/resources.ts` | `rate * (1 + ctx[key])` |
| **Stockage** | `storage_minerai`, `storage_silicium`, `storage_hydrogene` | planet_bonus | `game-engine/formulas/resources.ts` | `capacity * (1 + ctx[key])` |
| **Construction** | `building_time` | planet_bonus | `building.service.ts` | `time / (1 + ctx[key])` |
| **Chantier naval** | `ship_build_time`, `shipyard_parallel` | planet_bonus | `shipyard.service.ts` | temps: `/ (1 + ctx[key])`, parallele: `1 + floor(ctx[key])` |
| **Recherche** | `research_time` | global_bonus | `research.service.ts` | `time / (1 + ctx[key])` |
| **Combat** | `combat_weapons`, `combat_shield`, `combat_armor` | global_bonus | `fleet.types.ts` | `multiplier * (1 + ctx[key])` |
| **Flotte** | `fleet_speed`, `fleet_cargo`, `fleet_fuel` | global_bonus | `fleet.service.ts` | speed/cargo: `* (1 + ctx[key])`, fuel: `/ (1 + ctx[key])` |
| **Marche** | `market_fee` | global_bonus | `market.service.ts` | `fee / (1 + ctx[key])` |
| **PvE** | `pve_loot`, `pve_discovery` | global_bonus | `pve.service.ts` | `loot * (1 + ctx[key])` |
| **Defenses** | `defense_strength` | planet_bonus | calculs de combat/defense | `strength * (1 + ctx[key])` |
| **Pillage** | `pillage_protection` | planet_bonus | calculs de pillage | `protection * (1 + ctx[key])` |
| **Propulsion** | `unlock_drive_*` | unlock | `flagship.service.ts` | `ctx[key] > 0` |
| **Flagship stats** | *(deja en place via modify_stat)* | modify_stat | `flagship.service.ts` | inchange |

### Formules d'application

- **"Plus = mieux"** (production, combat, cargo, vitesse, loot, defense, stockage, pillage) : `base * (1 + ctx[key])`
- **"Moins = mieux"** (temps de construction/recherche, frais, fuel) : `base / (1 + ctx[key])` — diminishing returns naturels, ne descend jamais a zero
- **Compteurs** (builds paralleles) : `baseCount + Math.floor(ctx[key])`
- **Feature gates** (unlocks) : `(ctx[key] ?? 0) > 0`

---

## 3. Timed Buffs — Activation et cycle de vie

### Infrastructure existante

Deja en place dans `talent.service.ts` : `activate()` et `getActiveBuffs()`. Le schema `flagshipCooldowns` gere `activatedAt`, `expiresAt`, `cooldownEnds`. **Aucun changement de schema DB necessaire.**

### Cycle de vie

```
Joueur active le buff (page flagship)
  → check: flagship stationne (status === 'active')
  → check: talent debloque (rank >= 1)
  → check: pas en cooldown (now > cooldownEnds)
  → insert/update flagshipCooldowns
  → buff actif pendant durationSeconds

[pendant la duree]
  computeTalentContext() inclut le buff dans le Record
  → services appliquent le bonus normalement

[apres expiration]
  computeTalentContext() ignore le buff (expiresAt < now)
  → cooldown continue jusqu'a cooldownEnds

[apres cooldown]
  → joueur peut reactiver
```

### effectParams d'un timed_buff

```json
{
  "key": "production_minerai",
  "perRank": 0.25,
  "durationSeconds": 3600,
  "cooldownSeconds": 14400
}
```

Le bonus du buff est `perRank * rank` (comme les autres). Un buff rank 3 avec `perRank: 0.25` donne +75% pendant sa duree. Se cumule additivement avec les global/planet bonus sur la meme cle.

---

## 4. Pattern d'integration dans les services

### Pattern standard (3 lignes par point d'integration)

```typescript
// 1. Fetch le contexte (1 appel par operation)
const talentCtx = await talentService.computeTalentContext(userId, planetId);

// 2. Lookup la cle
const talentBonus = talentCtx['building_time'] ?? 0;

// 3. Appliquer
const finalTime = Math.ceil(baseTime * researchMultiplier / (1 + talentBonus));
```

### Coexistence avec les bonus existants

Les bonus research/building continuent d'etre resolus via `resolveBonus()` dans `game-engine/bonus.ts`. Les bonus talents sont un multiplicateur supplementaire applique apres. Les deux systemes sont independants :

```typescript
// Bonus existants (inchange)
const researchMultiplier = resolveBonus('building_time', null, buildingLevels, config.bonuses);
// Bonus talents (nouveau)
const talentMultiplier = 1 / (1 + (talentCtx['building_time'] ?? 0));
// Resultat final
const finalTime = Math.ceil(baseTime * researchMultiplier * talentMultiplier);
```

### Injection du talentService

Les services qui ont besoin de `computeTalentContext()` recoivent `talentService` en parametre de leur factory function (meme pattern que `gameConfigService`, `exiliumService`, etc. deja utilise partout dans le code).

---

## 5. Ce qui ne change PAS

- **Schema DB** : aucune migration, aucune nouvelle table
- **`resolveBonus()`** dans game-engine : inchange, continue de gerer building/research
- **`getStatBonuses()`** : inchange, continue de gerer les modify_stat du flagship
- **`activate()`** et `getActiveBuffs()` : inchanges dans leur logique, seul `computeTalentContext` les consomme
- **Admin panel** : le CRUD talents existant suffit deja (effectType + effectParams sont editables)
- **Frontend talent tree** : pas de changement (affichage des talents/ranks inchange)

---

## 6. Systemes a integrer (liste exhaustive des fichiers)

1. `packages/game-engine/src/formulas/resources.ts` — production rates + storage capacity
2. `apps/api/src/modules/building/building.service.ts` — building construction time
3. `apps/api/src/modules/shipyard/shipyard.service.ts` — ship/defense build time + parallel builds
4. `apps/api/src/modules/research/research.service.ts` — research time
5. `apps/api/src/modules/fleet/fleet.types.ts` — combat multipliers (getCombatMultipliers)
6. `apps/api/src/modules/fleet/fleet.service.ts` — fleet speed, cargo, fuel
7. `apps/api/src/modules/pve/pve.service.ts` — PvE loot/discovery bonuses
8. `apps/api/src/modules/flagship/flagship.service.ts` — propulsion unlocks (+ modify_stat deja fait)
9. `apps/api/src/modules/market/market.service.ts` — market fee reduction
10. Combat/defense calculs — defense strength + pillage protection

**Chaque integration = 3-5 lignes de code** (fetch context si pas deja fait, lookup cle, appliquer formule).
