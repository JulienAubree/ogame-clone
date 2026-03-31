# Technologie de semi-conducteurs

## Contexte

Nouvelle recherche qui reduit la consommation d'energie de tous les batiments. Permet aux joueurs d'optimiser leur bilan energetique via la progression technologique plutot qu'uniquement en construisant des centrales/satellites.

## Recherche

- **Nom** : Technologie de semi-conducteurs
- **Identifiant** : `semiconductors`
- **Description** : "Ameliore l'efficacite des circuits de tous les systemes, reduisant leur consommation energetique."
- **Effet** : -2% de consommation d'energie globale par niveau
- **Niveau max** : aucun (couts exponentiels suffisent)
- **Prerequis** : Laboratoire de recherche niveau 3 + Technologie energetique niveau 1
- **Couts de base** : 800 minerai, 400 silicium, 200 hydrogene
- **Facteur de cout** : 2.0 (standard)

## Bonus

Un seul bonus global applique a toute la consommation d'energie :

- **sourceType** : `research`
- **sourceId** : `semiconductors`
- **stat** : `energy_consumption`
- **percentPerLevel** : -2
- **category** : null (s'applique a tout)

Formule du bonus (recherche lineaire) : `1 + (-2 / 100) * level`
- Niveau 5 : 0.90 (10% de reduction)
- Niveau 10 : 0.80 (20% de reduction)
- Niveau 20 : 0.60 (40% de reduction)
- Niveau 50 : 0.01 (clamp min du systeme resolveBonus)

## Impact sur le calcul d'energie

Dans `calculateProductionRates()`, apres le calcul brut de chaque consommation d'energie :

```
energyEfficiency = resolveBonus('energy_consumption', null, researchLevels, bonusDefs)

mineraiMineEnergy = floor(rawMineraiEnergy * percent * energyEfficiency)
siliciumMineEnergy = floor(rawSiliciumEnergy * percent * energyEfficiency)
hydrogeneSynthEnergy = floor(rawHydrogeneEnergy * percent * energyEfficiency)
shieldEnergy = floor(rawShieldEnergy * percent * energyEfficiency)
```

## Changements techniques

### Base de donnees
- Ajouter colonne `semiconductors` (smallint, default 0) dans la table `user_research`
- Migration necessaire

### Seed game config
- Ajouter la definition de recherche dans `researches`
- Ajouter les prerequis (lab niveau 3 + energyTech niveau 1)
- Ajouter le bonus `semiconductors__energy_consumption`

### Game engine
- Modifier `calculateProductionRates()` dans `resources.ts` pour appliquer le bonus `energy_consumption` sur chaque consommation d'energie

### API
- Le service de recherche utilise deja le systeme generique — pas de changement dans le router/service
- Le service de ressources passe deja les bonus au game engine — il faut juste que le nouveau bonus soit dans la config

### Frontend
- Aucun changement necessaire — la page Energie lit les valeurs de consommation calculees cote serveur
- La recherche apparaitra automatiquement dans la page Recherche via le systeme generique
