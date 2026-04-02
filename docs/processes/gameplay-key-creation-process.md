# Process de création d'une clé de gameplay

Ce process est utilisé quand on veut qu'un nouveau bonus ou effet soit exploitable dans le jeu.

## Principe

Une clé de gameplay = un identifiant string qui circule dans le système de bonus.
Pour qu'une clé ait un effet, elle doit être :
1. **Injectée** (par un talent, une coque, un bâtiment, une recherche...)
2. **Consommée** (lue par un service pour modifier un calcul)

Si une clé est injectée mais pas consommée → elle ne fait rien.
Si une clé est consommée mais pas injectée → elle vaut 0 (aucun effet).

## Etape 1 : Définir la clé

- **Nom** : snake_case, descriptif (ex: `mine_production_bonus`)
- **Scope** : global | planétaire
- **Formule d'application** : comment le service l'utilise
  - Multiplicateur additif : `result = base × (1 + bonus)` (ex: +10% production)
  - Diviseur : `result = base / (1 + bonus)` ou `result = base × (1 - bonus)` (ex: -20% temps)
  - Additif : `result = base + bonus` (ex: +1 slot)

## Etape 2 : Implémenter le consommateur

Dans le service concerné, ajouter la lecture :
```typescript
const bonus = talentCtx['ma_cle'] ?? 0;
const result = base * (1 + bonus); // adapter la formule
```

Vérifier que `talentCtx` est disponible dans le service (injecté via `computeTalentContext`).

## Etape 3 : Créer la source (talent, coque, etc.)

- Talent `global_bonus` ou `planet_bonus` avec `effectParams: { key: 'ma_cle', perRank: 0.10 }`
- Ou coque `passiveBonuses: { ma_cle: 0.20 }`

## Etape 4 : Documenter dans l'admin

Ajouter dans `GameplayKeys.tsx` pour que la clé apparaisse dans la référence admin.

## Convention de nommage

| Pattern | Usage | Exemple |
|---------|-------|---------|
| `*_production_bonus` | Bonus de production | `mine_production_bonus` |
| `*_time_reduction` | Réduction de temps (coque) | `research_time_reduction` |
| `*_build_time` | Réduction de temps (talent) | `ship_build_time` |
| `fleet_*` | Bonus de flotte | `fleet_speed`, `fleet_cargo` |
| `bonus_*` | Stat du flagship | `bonus_weapons`, `bonus_armor` |
| `*_slot*` | Slots additionnels | `fleet_slot_global` |
