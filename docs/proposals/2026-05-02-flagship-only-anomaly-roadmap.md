# Refonte Anomalie & Flagship — Roadmap

**Date :** 2026-05-02
**Origine :** discussion Discord Zecharia / l_n4y du 2026-05-01 nuit + suite client crash anomaly à dizaines de milliers de vaisseaux.

## Pivot

Le modèle actuel "flotte complète vs flotte ennemie" en anomalie ne tient pas à grande échelle : la simulation combat avec des dizaines de milliers de vaisseaux fait crasher le client (JS bloqué). On bascule sur **flagship-only** : seul le vaisseau amiral est engagé, équipé de **modules** lootés via anomalie.

## Décomposition en 5 sous-projets

L'ensemble est trop gros pour une seule spec. Découpage en 5 sous-projets indépendamment exécutables :

### 1. Système de modules (fondation)
- 9 slots fixes : 1 épique + 3 rares + 5 communs
- Liés à la coque du flagship (chaque coque = pool de modules différents)
- Effets thématiques par spécialité (scientifique / attaque / explo-minage / espionnage)
- Acquisition : loot anomalie (initialement)
- Loot rare : modules d'autres coques

**Pré-requis pour : 2, 4**

### 2. Anomaly V4 — flagship-only
- Engage : flagship seul (pas de flotte)
- Combat refondu (flagship vs ennemi solo, ou DPS-vs-HP simplifié)
- Loot = modules + ressources + Exilium
- Hull tracking permanent (régen par points dans la run)
- Choix multi-cap : certaines actions débloquées par tech (ex : espionnage 4)
- Refonte des 30 events seedés (les outcomes "gain/perte de vaisseaux" deviennent obsolètes)

**Pré-requis pour : 4 (loot pirates communs)**

### 3. Talents → Tech tree
- L'arbre de talents actuel (level-up + branches) devient un **arbre de techs unlock-only**
- Plus de points à dépenser : juste débloquer/non-débloquer
- Migration : les joueurs ayant investi reçoivent l'équivalent en techs débloquées
- Impacte : modules gated par techs (ex : module espionnage avancé requiert tech "Scan profond")

**Indépendant de 1, 2, 4**

### 4. Pirates IG → loot modules communs
- Les pirates standards (PvE missions, asteroid raids) drop occasionnellement des modules communs
- Permet une source alternative au early-game sans forcer l'anomaly
- Drop rate : faible mais non-nul

**Pré-requis : 1 (modules existent)**

### 5. Missions d'exploration — refonte ou suppression
- "Vire les missions explo" → repenser le centre de mission relai
- Soit suppression, soit refonte autour de l'XP flagship / loot modules

**Largement indépendant des autres**

## Ordre de brainstorm validé

1. Modules (fondation)
2. Anomaly V4 (consomme les modules)
3. Tech tree (refactor parallèle)
4. Pirates loot
5. Missions explo

Chaque sous-projet aura sa propre spec dans `docs/superpowers/specs/` puis son plan d'implémentation dans `docs/superpowers/plans/`.

## Hors-scope de cette roadmap

- Migration data des anomalies en cours (à traiter au moment de l'implémentation V4)
- UI mockups (à voir dans chaque spec individuelle)
- Re-balance économie (à observer post-implémentation, tunable via universe_config)
