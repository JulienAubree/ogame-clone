# Biomes actifs/inactifs a la colonisation

## Contexte

Actuellement, quand un joueur colonise une position, TOUS les biomes du pool deterministe sont inseres dans `planet_biomes` et appliquent leurs effets sur la production. L'exploration pre-colonisation n'a aucun impact sur les biomes obtenus — un joueur qui colonise a l'aveugle recoit les memes bonus qu'un joueur qui a entierement cartographie la position.

L'objectif est de rendre l'exploration strategiquement importante : seuls les biomes que le joueur a decouverts via `discovered_biomes` deviennent actifs a la colonisation. Les biomes non decouverts sont inseres mais inactifs (invisibles, sans effet). Un mecanisme de redecouverte (hors scope) permettra de les activer plus tard.

## Principes

- **Seuls les biomes explores sont actifs** : a la colonisation, on croise le pool deterministe avec les `discovered_biomes` du joueur. Match → active. Pas match → inactive.
- **Les biomes inactifs sont invisibles** : le joueur ne voit pas les biomes inactifs dans l'UI. Il voit simplement moins de biomes que le maximum possible.
- **Les biomes inactifs n'ont aucun effet** : pas de bonus de production, pas de bonus de stockage. La planete produit moins que son potentiel tant que les biomes restent inactifs.
- **Pas de penalite retroactive** : les planetes existantes gardent tous leurs biomes actifs. La nouvelle regle ne s'applique qu'aux NOUVELLES colonisations.
- **Le homeworld n'est pas impacte** : il n'a pas de biomes mineurs.

## Modele de donnees

### Modification de `planet_biomes`

Ajouter une colonne :

```sql
ALTER TABLE planet_biomes ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
```

`DEFAULT true` garantit que les lignes existantes (toutes les planetes deja colonisees) conservent leurs biomes actifs. Aucune migration de donnees necessaire.

## Logique de colonisation

### Fichier concerne

Le handler de colonisation dans `apps/api/src/modules/fleet/handlers/colonize.handler.ts` (ou le service qui insere les biomes a la colonisation).

### Comportement actuel

A la colonisation, le code genere le pool deterministe de biomes via `pickBiomes(catalogue, planetClassId, count, rng)` et insere TOUTES les lignes dans `planet_biomes` sans distinction.

### Nouveau comportement

1. Generer le pool complet de biomes (inchange)
2. Charger les `discovered_biomes` du joueur colonisateur pour la position `(galaxy, system, position)`
3. Pour chaque biome du pool :
   - Si le biome ID est dans les `discovered_biomes` du joueur → insert avec `active = true`
   - Sinon → insert avec `active = false`

Le set de biomes insere est toujours le MEME (le pool deterministe complet). Seul le flag `active` change selon l'exploration du joueur.

## Impact sur la production

### Fichier concerne

Le game engine, partout ou les biomes d'une planete sont lus pour calculer la production. Typiquement dans le service de ressources ou le calcul de production rates.

### Modification

Ajouter un filtre `active = true` a toutes les requetes qui lisent `planet_biomes` pour le calcul de production :

```sql
SELECT biomeId FROM planet_biomes WHERE planetId = ? AND active = true
```

Les biomes inactifs sont ignores dans le calcul de production, stockage, et tout autre effet derive des biomes.

## Impact sur l'affichage

Les biomes inactifs sont **invisibles** dans toute l'UI :
- Page Overview (liste des biomes de la planete)
- Galaxy detail panel (biomes d'une planete possedee)
- Tout autre endroit qui affiche les biomes d'une planete colonisee

Filtrer sur `active = true` dans les requetes API qui retournent les biomes d'une planete.

## Ce qui ne change pas

- Le pool deterministe de biomes par position (meme seed, meme catalogue, meme resultat)
- Les planetes existantes (toutes en `active = true` par defaut via DEFAULT)
- La table `discovered_biomes` (per-player, meme mecanisme d'exploration)
- L'exploration elle-meme (missions, probabilites, etc.)
- Le homeworld (pas de biomes mineurs)
- Les rapports d'exploration vendables (ils snapshotent `discovered_biomes`, pas `planet_biomes`)

## Scope

### Dans le scope
- Migration : ajout colonne `active` sur `planet_biomes`
- Schema Drizzle : mettre a jour la definition de `planet_biomes`
- Handler de colonisation : croiser le pool avec `discovered_biomes` pour determiner le flag
- Production : filtrer `active = true` dans les requetes de biomes pour le calcul
- API planete : filtrer `active = true` quand on retourne les biomes d'une planete au front

### Hors scope
- Mecanisme de redecouverte des biomes inactifs (recherche, mission, cout)
- Affichage des biomes verrouilles/grises sur la planete
- Notification au joueur du nombre de biomes inactifs
