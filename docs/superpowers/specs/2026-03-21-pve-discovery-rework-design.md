# PvE Mission Discovery Rework

**Date**: 2026-03-21
**Status**: Approved
**Motivation**: Retour joueur — le Centre de Missions manque de raison d'exister a long terme. Pas assez d'incitation a l'upgrader.

## Objectif

Remplacer le systeme de pool de missions a la demande par un systeme de **decouverte passive de gisements** : le Centre de Missions trouve automatiquement un gisement toutes les X heures, avec un cooldown reduit par le niveau du batiment et du RNG sur la taille/composition.

Les missions pirate sont hors scope — elles restent dans le code mais ne sont plus generees. Elles seront rattachees a un autre batiment plus tard.

## Modele de donnees

### Nouvelle table `mission_center_state`

| Colonne | Type | Description |
|---------|------|-------------|
| `userId` | UUID (PK) | Reference vers `users`, cascade delete |
| `nextDiscoveryAt` | timestamp with tz | Prochain moment de decouverte |
| `updatedAt` | timestamp with tz | Dernier rattrapage |

Creee quand le joueur construit son premier Centre de Missions. Initialisee avec `nextDiscoveryAt = now + cooldown(level)`.

### Table `pve_missions` (inchangee)

Les gisements decouverts sont des entrees `pve_missions` standard avec `missionType = 'mine'` et `status = 'available'`. Le frontend ne change pas de contrat.

## Logique de decouverte lazy

### Fonction `materializeDiscoveries(userId)`

Pattern identique a `materializeResources` — rattrapage du temps ecoule au moment de la lecture.

Appelee a chaque interaction PvE : ouverture page Missions, envoi de flotte mine.

**Algorithme** :

1. Lire `mission_center_state` du joueur
2. Si `nextDiscoveryAt > now` → rien a faire, return
3. Calculer le cooldown actuel : `cooldown = discoveryCooldown(centerLevel)`
4. Calculer le nombre de decouvertes ecoulees : `n = floor((now - nextDiscoveryAt) / cooldown)`
5. Compter les gisements `available` actuels du joueur
6. Creer `min(n, CAP - currentCount)` nouveaux gisements
7. Avancer `nextDiscoveryAt += n * cooldown` (pas `now`)

### Constantes

- **Cap fixe** : 3 gisements max en attente, quel que soit le niveau
- **Comportement au cap** : les decouvertes sont perdues, le timer avance quand meme

## Cooldown par niveau

Formule : `max(5, 8 - 0.3 * (level - 1))` heures

| Niveau | Cooldown |
|--------|----------|
| 1 | 8h |
| 3 | 7.4h |
| 5 | 6.8h |
| 7 | 6.2h |
| 10 | 5.3h |
| 11+ | 5h (plancher) |

## Generation de gisement (RNG)

### Taille

- Base : `15000 + 5000 * (centerLevel - 1)`
- Variance : multiplicateur uniforme entre 0.6 et 1.6

| Niveau | Min | Moy | Max |
|--------|-----|-----|-----|
| 1 | 9k | 15k | 24k |
| 5 | 21k | 35k | 56k |
| 10 | 36k | 60k | 96k |

### Composition

Distribution aleatoire autour de la moyenne cible 60/30/10 :

- `mineraiRatio = 0.60 + random(-0.15, +0.15)` → 45% a 75%
- `siliciumRatio = 0.30 + random(-0.10, +0.10)` → 20% a 40%
- `hydrogeneRatio = 1 - mineraiRatio - siliciumRatio` (clampe >= 0.02)
- Normalisation pour somme = 1

### Position

- Niveau 1-2 : position 8 uniquement
- Niveau 3+ : position 8 ou 16 (aleatoire)

### Slag rates (mis a jour)

- Position 8 : **45%** (etait 30%)
- Position 16 : **30%** (etait 15%)
- Reduction par `deepSpaceRefining` inchangee : `slagRate * 0.85^level`

## Impact sur le Centre de Missions

| Effet | Formule |
|-------|---------|
| Cooldown de decouverte | `max(5, 8 - 0.3 * (level - 1))` heures |
| Taille des gisements | `(15000 + 5000 * (level - 1)) * random(0.6, 1.6)` |
| Position 16 debloquee | Niveau 3+ |
| Extraction de base | `2000 + 800 * (level - 1)` par prospecteur (inchange) |
| Duree de minage | `max(5, 16 - level)` minutes * bonus recherche (inchange) |
| Cap de gisements stockes | 3 (fixe, tous niveaux) |

Upgrader le Centre donne : decouvertes plus frequentes, gisements plus gros, extraction plus efficace. Trois raisons de monter en niveau.

## Missions pirate

**Hors scope**. Le code existant reste en place mais `refreshPool()` ne genere plus de missions pirate. Elles seront rattachees a un autre batiment dans un futur rework.

## Ce qui change vs l'existant

| Avant | Apres |
|-------|-------|
| Pool rempli a la demande (refreshPool) | Decouverte passive lazy (materializeDiscoveries) |
| Pool size scale avec le niveau (3-6) | Cap fixe de 3 |
| FIFO remplacement au cap | Decouvertes perdues au cap |
| Composition fixe par position (weights) | RNG autour de 60/30/10 |
| Slag 30%/15% | Slag 45%/30% |
| 60% mine / 40% pirate | 100% mine (pirates hors scope) |
| Pas de cooldown explicite | Timer passif par joueur |

## Notes d'implementation

- **Slag rates** : les valeurs `slag_rate.pos8` et `slag_rate.pos16` dans `seed-game-config.ts` / `universe_config` DB doivent etre mises a jour (0.45 et 0.30)
- **Position 16** : le seuil passe de niveau 2 a niveau 3 (mettre a jour `pve.service.ts`)
- **Joueurs existants** : `materializeDiscoveries` doit creer la ligne `mission_center_state` au premier appel si elle n'existe pas (pour les joueurs qui ont deja un Centre de Missions)
- **Expiration** : le mecanisme existant `expireOldMissions` (TTL 7 jours) reste actif pour les gisements decouverts passivement

## Extensibilite future

Le systeme est concu pour accueillir des ameliorations transverses :
- **Nouveaux minerais** (ex: "gamma rayon") : ajouter au RNG de composition avec une probabilite faible, debloques par une recherche
- **Tiers de rarete** : ajouter un roll de rarete au moment de la decouverte, le Centre de Missions influencant les chances
- **Rattachement des pirates** a un autre batiment avec son propre timer de decouverte
