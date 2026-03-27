# Integration des repos de domaine

## Repos de domaine

| Domaine | Repo | Package | Statut |
|---------|------|---------|--------|
| Core | exilium-core | @exilium/core | Initialise |
| Economie | exilium-economie | @exilium/economie | Initialise |
| Construction | exilium-construction | @exilium/construction | Initialise |
| Flotte | exilium-flotte | @exilium/flotte | Initialise |
| Combat PvP | exilium-combat-pvp | @exilium/combat-pvp | Initialise |
| PvE | exilium-pve | @exilium/pve | Initialise |
| Social | exilium-social | @exilium/social | Initialise |
| Univers | exilium-univers | @exilium/univers | Initialise |

## Strategie d'integration

1. Chaque equipe developpe dans son repo
2. Quand un package est pret, l'ajouter comme submodule :
   ```bash
   git submodule add <repo-url> packages/<domaine>
   ```
3. Ajouter au pnpm-workspace.yaml si necessaire
4. Mettre a jour les imports dans apps/api et apps/web

## Migration progressive

Le code existant dans packages/game-engine et packages/shared reste en place.
Au fur et a mesure que les packages de domaine sont prets, on migre les imports :
- `@ogame-clone/game-engine` → `@exilium/economie`, `@exilium/flotte`, etc.
- `@ogame-clone/shared` → `@exilium/core`
