> **📦 Archivé** — Ce document est conservé pour son contexte historique.
> Pour la doc à jour, voir [`docs/reference/`](../reference/) et [`docs/patchnotes/`](../patchnotes/).

# Codex Exilium — Document de travail

> Ce document consigne les réflexions autour du Codex. C'est une base de travail, pas une spec finalisée.
> A reprendre et affiner avant implémentation.

## Concept

Le Codex est le guide de référence du jeu. Il permet aux joueurs de comprendre les mécaniques sans exposer les formules exactes dans le jeu.

Deux niveaux de lecture :
- **In-game (dépliants)** : résumés factuels courts, intégrés dans chaque page du jeu
- **Codex complet** : hébergé sur un sous-domaine dédié, avec narratif, explications détaillées, formules et exemples

## Nom et hébergement

- Nom : **Codex**
- Sous-domaine prévu : `codex.exilium-game.com`
- Langue : français uniquement pour le moment

## Ton des textes

Chaque entrée du Codex suit une structure en deux temps :

1. **Encart narratif/roleplay** — ancre l'explication dans l'univers du jeu
2. **Section factuelle** — apporte les connaissances utiles au joueur

Exemple pour l'espionnage :

> *Les exilés ont vite compris que le savoir est la meilleure arme. Envoyer des sondes en territoire ennemi permet d'évaluer ses forces — mais gare à ne pas se faire repérer...*
>
> **Ce qui influence le rapport :**
> - Le nombre de sondes envoyées
> - L'écart de technologie d'espionnage
> - Les informations se débloquent par paliers : ressources, flotte, défenses, batiments, recherches
>
> Attention : plus vous envoyez de sondes, plus le risque de détection augmente.

Dans le Codex complet, on ajoute en plus les formules exactes et des exemples chiffrés avec des valeurs simples et parlantes.

## Structure du contenu

### Catégories envisagées

- Economie (ressources, production, mines)
- Batiments
- Recherche
- Flotte (vaisseaux, missions, consommation, cargo)
- Combat
- Espionnage
- Défenses
- Colonisation
- Classement
- (Diplomatie/Alliances à terme)

### Structure d'une entrée

Chaque entrée du Codex contient :
- **Résumé court** : utilisé par les dépliants in-game
- **Intro narrative** : encart roleplay
- **Explication factuelle** : mécaniques, facteurs, paliers
- **Formules** : formules exactes (Codex uniquement)
- **Exemples** : cas concrets avec des chiffres simples (Codex uniquement)

## Dépliants in-game

- Un ou plusieurs dépliants par page du jeu (contextuels à la page)
- Fermé par défaut : juste le titre (ex: "Comment fonctionne l'espionnage ?")
- Ouvert : affiche le résumé court factuel
- Lien "En savoir plus dans le Codex" en bas de chaque dépliant, renvoyant vers la page complète

## Source de contenu unique

Le Codex est la **source de vérité unique**. Les dépliants in-game récupèrent leur contenu (résumé court) depuis le Codex. Cela évite de maintenir deux versions et les risques de désynchronisation.

Cela implique une API ou un système de contenu partagé entre le Codex et le jeu.

## Recherche

Le Codex intègre une barre de recherche :
- Recherche instantanée (fuzzy si possible, tolérante aux fautes)
- Suggestions de résultats liés (ex: chercher "sonde" propose "Espionnage", "Sonde d'espionnage (vaisseau)", "Technologie espionnage")

## Navigation Codex / Jeu

- Depuis le jeu : lien vers le Codex via les dépliants
- Depuis le Codex : bandeau contextuel "Retourner au jeu" pour garder un lien fluide

## SEO

Le Codex étant public et sur un sous-domaine, il peut être indexé par les moteurs de recherche. C'est une opportunité de visibilité : un joueur qui cherche des infos sur les mécaniques de jeu spatial pourrait découvrir Exilium via le Codex.

## Timing

Le Codex ne sera implémenté qu'une fois les mécaniques principales du jeu stabilisées. Rédiger du contenu sur des features qui bougent encore serait contre-productif.
