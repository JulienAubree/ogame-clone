# Process de création d'une capacité active

Ce process est utilisé quand on veut ajouter une nouvelle capacité active (comme le scan) sur une coque.

## Différence talent passif vs capacité active

- **Talent passif** : effet permanent (tant que le talent est investi). Configuré en admin.
- **Capacité active** : action déclenchée par le joueur avec un cooldown. Nécessite du code dédié.

## Etape 1 : Design de la capacité

Répondre à ces questions :
- **Nom** et description
- **Quelle coque** (ou configurable en admin sur n'importe quelle coque)
- **Que fait-elle concrètement ?** (action précise)
- **Cooldown** (en secondes)
- **Paramètres** (key/value dans la config, ex: espionageBonus pour le scan)
- **Condition d'activation** : flagship stationné ? autre ?

## Etape 2 : Ajouter l'ability dans la config (admin ou seed)

Type `active` dans les abilities de la coque :
```json
{
  "id": "mon_ability",
  "name": "Ma capacite",
  "description": "...",
  "type": "active",
  "cooldownSeconds": 3600,
  "params": { "monParam": 42 }
}
```

## Etape 3 : Implémenter le backend

1. Ajouter une méthode dans `flagship.service.ts` :
   - Valider le flagship (existe, stationné)
   - Trouver l'ability dans la config : `hullConfig.abilities.find(a => a.id === 'mon_ability')`
   - Vérifier le cooldown dans `flagship_cooldowns`
   - Exécuter la logique
   - Poser le cooldown
   - Retourner le résultat

2. Ajouter la route dans `flagship.router.ts`

## Etape 4 : Implémenter le frontend

Dans `FlagshipProfile.tsx` → `ActiveAbilityCard` :
- Ajouter un bloc `if (ability.id === 'mon_ability')` pour le UI spécifique
- Le cooldown et la carte sont déjà gérés de façon générique

## Etape 5 : Tester

1. Vérifier que la capacité apparaît sur le profil flagship
2. Activer et vérifier l'effet
3. Vérifier que le cooldown fonctionne
4. Vérifier qu'une coque sans cette ability ne la voit pas
