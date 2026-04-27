# Documentation Exilium

Cette documentation suit une convention simple : **le dossier indique le statut**. Pas besoin d'ouvrir un fichier pour savoir s'il est à jour, en discussion ou archivé.

## Carte des dossiers

| Dossier | Contenu | Quand consulter |
|---|---|---|
| **`reference/`** | La vérité actuelle sur le fonctionnement du jeu et de l'infra | Toujours. Si un doc est ici, il est à jour. |
| **`processes/`** | How-to actuels (« comment ajouter une mission », etc.) | Quand tu fais quelque chose qui correspond au how-to. |
| **`proposals/`** | Brainstorms / propositions encore ouvertes (rien d'implémenté) | Backlog d'idées game design ou techniques. Lis avant de proposer une nouvelle feature pour éviter les doublons. |
| **`plans/`** | Specs techniques avant implémentation | Si tu vas coder un truc déjà spécifié. |
| **`patchnotes/`** | Changelog des features livrées (immuable) | Pour comprendre ce qui a changé à telle date. |
| **`announcements/`** | Annonces in-game | Reference pour les annonces côté joueurs. |
| **`archive/`** | Tout ce qui est superseded, abandonné ou intégré | Contexte historique uniquement. Préfixé `📦 Archivé` en tête. |
| **`integration/`** | Notes d'intégration techniques | Notes ponctuelles. |
| **`superpowers/`** | Specs/plans générés par l'agent Superpowers | Historique de travail AI. |

## Convention de nommage

| Type de dossier | Format de nom | Date dans le nom ? |
|---|---|---|
| `reference/`, `processes/` | descriptif (`combat.md`) | **Non** — c'est toujours la version courante |
| `proposals/`, `plans/`, `patchnotes/`, `announcements/`, `archive/` | `YYYY-MM-DD-<topic>.md` | **Oui** — la date marque le contexte temporel |

## Comment savoir où trouver l'info

Quelques cas typiques :

- **« Comment marche le combat aujourd'hui ? »** → `reference/combat.md` (en cours de rédaction post-refonte) ou le patchnote le plus récent dans `patchnotes/`.
- **« Comment fonctionne X mécanique de jeu ? »** → `reference/game-mechanics.md` ou `reference/game-engine.md`.
- **« Comment j'ajoute Y ? »** → `processes/`.
- **« On avait pas une idée pour Z ? »** → `proposals/`.
- **« Qu'est-ce qui a changé en avril ? »** → `patchnotes/`.
- **« Y a-t-il eu une discussion / analyse sur W ? »** → cherche dans `archive/` (ancien) ou `proposals/` (récent).
- **« Comment je gère un incident prod ? »** → `reference/runbook.md`.

## Comment ajouter un doc

1. **C'est une nouveauté de gameplay/infra qui vient d'être implémentée ?**
   → Patchnote dans `patchnotes/YYYY-MM-DD-<topic>.md` + mettre à jour le doc référence correspondant dans `reference/` si nécessaire.

2. **C'est une idée pas encore décidée ?**
   → `proposals/YYYY-MM-DD-<topic>.md`. Quand l'idée est implémentée → déplace vers `archive/` et crée un patchnote.

3. **C'est une spec technique avant impl ?**
   → `plans/YYYY-MM-DD-<topic>.md`. Une fois implémenté, soit l'archive soit on la garde comme reference si elle a vocation pédagogique.

4. **C'est un how-to ?**
   → `processes/<topic>.md` (sans date — il évoluera dans le temps).

5. **C'est de la doc de référence (mécanique, schema, infra) ?**
   → `reference/<topic>.md` (sans date).

## Maintenir la convention

- Quand tu modifies une mécanique → vérifie que le `reference/` correspondant suit. Si t'as la flemme, ajoute un bandeau ⚠️ « partiellement obsolète depuis [patchnote] » en tête.
- Quand un proposal est implémenté → déplace-le dans `archive/` (préfixe `📦 Archivé` en tête) + crée le patchnote.
- Quand un doc devient obsolète → bandeau ⚠️ ou déplacement vers `archive/`.

C'est tout.
