# Combat — Documentation de référence

> **🚧 À rédiger** — La refonte combat du 2026-04-25 a remplacé le système précédent (rapidfire, bounce rule, priorité de cible). En attendant la version consolidée, voir :
>
> - **Patchnote refonte** : [`patchnotes/2026-04-25-refonte-combat.md`](../patchnotes/2026-04-25-refonte-combat.md) — explication produit complète (multi-batteries, catégories Léger/Moyen/Lourd, traits Rafale + Enchaînement)
> - **Code source** : [`packages/game-engine/src/formulas/combat.ts`](../../packages/game-engine/src/formulas/combat.ts) — implémentation actuelle
> - **Tests scenarios** : [`packages/game-engine/src/formulas/combat.scenarios.test.ts`](../../packages/game-engine/src/formulas/combat.scenarios.test.ts) — 12 snapshots qui décrivent le comportement attendu round par round
> - **Archive des analyses** : [`archive/`](../archive/) — toutes les itérations d'analyse balance qui ont mené à la refonte
>
> Une fois ce doc rédigé, supprimer ce bandeau et le contenu deviendra la source de vérité.

## TODO de rédaction

Sections à couvrir (inspiration depuis le patchnote + code) :

1. **Vue d'ensemble** — déroulement d'un combat round par round
2. **Profils d'armes** — `weaponProfiles` jsonb sur `ship_definitions` + `defense_definitions` (migration `0059_weapon_profiles.sql`)
3. **Catégories de cibles** — Léger / Moyen / Lourd, comment elles sont assignées
4. **Traits** — Rafale N Catégorie, Enchaînement
5. **Calcul des dégâts** — formule armes × bonus recherche × résistance
6. **Boucliers et armure** — régen, bounce, blindage
7. **Bouclier planétaire** — bonus recherche Blindage (depuis `8e0d2b4`)
8. **Réparation des défenses** — cf. anciennes notes archive
9. **Rapports de combat** — ce que voit le joueur

Ne pas oublier d'enlever le bandeau ⚠️ de `reference/game-mechanics.md` section combat une fois ce doc terminé.
