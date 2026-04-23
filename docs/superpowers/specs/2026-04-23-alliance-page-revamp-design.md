# Alliance Page Revamp — Design

**Goal:** Remplacer la page `/alliance` actuelle (un long empilement de 4 onglets avec l'activité reléguée en bas) par un hub condensé qui tient au-dessus de la ligne de flottaison, avec des sous-pages dédiées pour chaque approfondissement (activité, membres, chat, gestion).

**Scope v1 :** Refonte du rendu de l'alliance pour un joueur qui en a une. Inclut un nouveau feed préview, une stat "bilan militaire 7j" côté API, et le déplacement de "Quitter l'alliance" dans un menu kebab du hero. **Hors scope :** `NoAllianceView` (l'écran pré-alliance) reste intact. Le système d'annonces épinglées et la diplomatie font l'objet de specs ultérieurs.

**Non-goals :**
- Pas de toucher à `NoAllianceView` ni au flux de création/candidature.
- Pas de changement au modèle de données `alliance_logs`, `alliances`, `alliance_members` (feature Alliance Logs vient juste de shipper).
- Pas d'ajout d'un système d'annonces épinglées (spec séparé).

---

## 1. Architecture

### Routing

La page Alliance passe d'une route unique à un petit routeur interne :

| Route | Composant | Rôle |
|---|---|---|
| `/alliance` | `AllianceHub` | Hub condensé (hero + 4 cartes preview) |
| `/alliance/activite` | `AllianceActivityPage` | Feed complet (composant `ActivityFeed` déjà existant, pleine largeur) |
| `/alliance/membres` | `AllianceMembersPage` | Table complète des membres + actions contextuelles (invite, gestion rôles) |
| `/alliance/chat` | `AllianceChatPage` | Vue plein écran du chat d'alliance |
| `/alliance/gestion` | `AllianceManagePage` | Candidatures, blason, description, devise, rôles, dissolution (leaders uniquement) |

Les routes sont ajoutées dans `apps/web/src/router.tsx` à côté de `alliance` existant via des routes enfants et le pattern `lazyLoad` déjà en place. Les non-leaders qui naviguent vers `/alliance/gestion` sont redirigés vers `/alliance` (même logique de garde que les onglets actuels).

L'overlay de chat global (accessible depuis la barre du haut) reste inchangé : la sous-page `/alliance/chat` est un point d'entrée alternatif pour les joueurs qui veulent le voir en plein écran.

### Structure de fichiers

Le fichier actuel `apps/web/src/pages/Alliance.tsx` (487 lignes) dépasse la taille raisonnable. On le découpe :

```
apps/web/src/pages/alliance/
  AlliancePage.tsx            ← route container (gère loading, no-alliance)
  AllianceHub.tsx             ← hub (hero + 4 cartes preview)
  AllianceActivityPage.tsx    ← sous-page activité
  AllianceMembersPage.tsx     ← sous-page membres
  AllianceChatPage.tsx        ← sous-page chat
  AllianceManagePage.tsx      ← sous-page gestion

apps/web/src/components/alliance/
  AllianceHero.tsx            ← hero avec blason, stats, [Gérer] + kebab
  AllianceHeroStats.tsx       ← les 5 pills de stats
  ActivityPreviewCard.tsx     ← carte hub : 5 derniers logs + "Voir tout →"
  MembersPreviewCard.tsx      ← carte hub : fondateur + officiers + "Voir tous →"
  ChatPreviewCard.tsx         ← carte hub : 3-5 derniers messages + "Ouvrir →"
  ManageShortcutCard.tsx      ← carte hub : badge candidatures, lien gestion
  NoAllianceView.tsx          ← extrait du Alliance.tsx actuel, identique fonctionnellement
```

`NoAllianceView.tsx` est un simple déplacement (pas de refonte). Les autres composants sont nouveaux.

`ActivityFeed` (déjà en place pour Alliance Logs v1) est réutilisé tel quel dans `AllianceActivityPage`.

### Backend

Une seule évolution côté API : un nouveau champ `recentMilitary: { wins: number, losses: number, windowDays: 7 }` ajouté à la réponse de `alliance.myAlliance`, calculé depuis `alliance_logs` filtré par `type LIKE 'combat.%'` sur les 7 derniers jours. La requête exploite l'index existant `(alliance_id, created_at DESC)`.

Le reste (membres, rôle, blason, devise, description, unread count, activity feed, applications) utilise les procédures tRPC existantes. Aucune migration.

---

## 2. Hub — Layout détaillé

### 2.1 Hero (`AllianceHero`)

Toujours en haut, pleine largeur.

**Contenu :**
- Blason (`AllianceBlason` existant, taille 64–80)
- Nom + tag `[GDX]`
- Devise (si présente, italique, petite)
- Barre de stats (`AllianceHeroStats`) : 5 pills horizontales :
  1. Nombre de membres — ex. `12 membres`
  2. Rang — ex. `Rang #4` (depuis le classement alliance existant)
  3. Total points — ex. `142 380 pts`
  4. Date de fondation — ex. `Fondée 14 mars 2026` (`alliances.createdAt`, format `d MMMM yyyy` en fr)
  5. Bilan militaire 7j — ex. `7j : 8V / 2D` (nouveau)
- Actions à droite : bouton `[Gérer]` (visible si officier/fondateur), et un menu kebab (icône `MoreIcon` existante) qui ouvre un popover avec l'unique action "Quitter l'alliance"

**Comportement :**
- Le bouton `[Gérer]` navigue vers `/alliance/gestion`.
- Le menu kebab ouvre un popover léger (pattern existant). "Quitter l'alliance" ouvre le `ConfirmDialog` déjà utilisé.
- Sur mobile, les pills stats passent en wrap ; le nom reste en haut, les actions `[Gérer]` + kebab passent sous le blason.

**Icônes :** réutiliser `@/lib/icons`. Tout icône manquante (p.ex. une icône "membres") doit être ajoutée au kit SVG existant — jamais d'emoji.

### 2.2 Grid 2 colonnes sous le hero (desktop)

```
┌──────────────────────────┬───────────────────┐
│ ActivityPreviewCard      │ ChatPreviewCard   │
│ (5 derniers logs)        │ (3-5 messages)    │
├──────────────────────────┼───────────────────┤
│ MembersPreviewCard       │ ManageShortcutCard│
│ (fondateur + officiers)  │ (candidatures)    │
└──────────────────────────┴───────────────────┘
```

Ratio colonnes : `2fr 1fr` (Tailwind `lg:grid-cols-[2fr_1fr]`). En dessous de `lg`, les 4 cartes s'empilent (1fr). Les cartes héritent du look `glass-card` déjà en usage.

### 2.3 ActivityPreviewCard

- Header : libellé "Activité récente" + badge unread (s'il y en a) + lien "Voir tout →" à droite.
- Corps : les 5 derniers items du feed, rendus via le même formatter que `ActivityFeed` (extraire la fonction `renderLogLine` dans un helper partagé si elle ne l'est pas déjà).
- Cliquer sur la carte (ou sur "Voir tout →") navigue vers `/alliance/activite`.
- État vide : "Pas encore d'activité."

**Unread behavior :** le compteur utilise `alliance.activityUnreadCount` existant ; la marque "vu" est déclenchée quand l'utilisateur arrive sur `/alliance/activite` (comportement actuel, inchangé).

### 2.4 ChatPreviewCard

- Header : "Chat" + lien "Ouvrir →".
- Corps : les 3 derniers messages d'alliance (username + première ligne tronquée). La source est le store chat existant côté front (même source que l'overlay), consommé via un hook `useAllianceChatRecent(3)` ajouté dans ce scope. Pas de nouvelle procédure tRPC.
- État vide : "Silence radio."
- Cliquer navigue vers `/alliance/chat`.

**Note implémentation :** l'overlay chat global continue de servir le cas "je veux papoter sans quitter mon écran". La sous-page `/alliance/chat` et la preview n'introduisent pas de duplication de state — elles lisent le même store/query.

### 2.5 MembersPreviewCard

- Header : "État-major" + lien "Voir tous les membres →".
- Corps : fondateur (en tête, marqué) + tous les officiers, triés par points desc. Pour chaque : username, rôle (mini-label), points.
- Limite : pas de cap strict côté UI — le nombre d'officiers est borné par les règles métier (quelques-uns). Si une alliance a >6 officiers, on tronque à 6 + "+N autres".
- Cliquer navigue vers `/alliance/membres`.

### 2.6 ManageShortcutCard

- Visible uniquement si `myRole ∈ { founder, officer }`. Si non-leader, la carte est omise : la `ChatPreviewCard` prend toute la hauteur de la colonne droite et la `MembersPreviewCard` passe sous l'activité comme aujourd'hui (grid `2fr 1fr` inchangé, la cellule vide est absorbée par l'item du dessus).
- Header : "Gestion" + badge candidatures pendantes si > 0 (couleur accent rouge, style pill déjà utilisé pour les notifs).
- Corps : un-liner qui compte les candidatures (`3 candidatures en attente`) et un lien "Ouvrir la gestion →".
- Cliquer navigue vers `/alliance/gestion`.

---

## 3. Sous-pages

### 3.1 `/alliance/activite`

Header de page `PageHeader` avec titre "Activité". Dessous : `<ActivityFeed />` plein largeur, sans wrapper additionnel. Comportement unread identique à aujourd'hui (mark-seen au mount).

### 3.2 `/alliance/membres`

Header "Membres". Table actuelle (extrait de `renderMembersSection` dans le fichier existant), plus :
- Au-dessus de la table, si `isLeader` : un champ + bouton **"Inviter un joueur"** (extrait de `renderManageSection`). C'est un raccourci contextuel : l'action appartient à la gestion, mais se consomme au même endroit que la liste des membres.
- Les actions par-ligne (promote/demote/kick) restent identiques.

### 3.3 `/alliance/chat`

Header "Chat d'alliance". Conteneur plein écran qui monte le même composant `<AllianceChat />` que l'overlay (à extraire s'il n'est pas déjà séparé). Layout : liste messages + input ancré en bas, hauteur `calc(100vh - header)`.

### 3.4 `/alliance/gestion`

Header "Gestion". Garde : si `!isLeader`, redirect `/alliance`. Contenu, regroupé dans des `glass-card` :
1. **Candidatures** (toujours affiché si leader, avec `(N)` dans le titre). Liste extraite de `renderManageSection`.
2. **Identité** : blason editor + devise + description. Bouton "Enregistrer" quand dirty (`blasonDirty`).
3. **Rôles & membres** : lien "→ Membres" (les actions sont là-bas, on évite la duplication).
4. **Zone dangereuse** : dissolution de l'alliance (fondateur uniquement). Action destructrice derrière `ConfirmDialog`.

Le bouton "Quitter l'alliance" **n'est plus ici** : il vit dans le kebab du hero et il est accessible depuis toutes les routes Alliance.

---

## 4. Nouveau : `recentMilitary` côté API

### 4.1 Procédure

Option retenue : extension de `alliance.myAlliance` pour renvoyer un champ `recentMilitary: { wins: number, losses: number, windowDays: 7 }`. Pas de procédure séparée (la data est petite et liée au contexte alliance).

### 4.2 Calcul

Les types de log combat sont `combat.attack` et `combat.defense` (cf. `packages/shared/src/alliance-log.ts`). Le résultat du combat vit dans `payload.outcome: 'victory' | 'defeat' | 'draw'` — il n'y a **pas** de suffixe `.won`/`.lost` dans le `type`.

```sql
SELECT
  SUM(CASE WHEN payload->>'outcome' = 'victory' THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN payload->>'outcome' = 'defeat'  THEN 1 ELSE 0 END) AS losses
FROM alliance_logs
WHERE alliance_id = $1
  AND created_at >= now() - interval '7 days'
  AND type LIKE 'combat.%'
```

Les matchs nuls (`draw`) ne sont comptés ni en W ni en L. Le service `alliance.service.ts` expose une méthode `getRecentMilitary(allianceId)` qui exécute cette requête via `drizzle`+`sql` templating. Résultat injecté dans la réponse `myAlliance`.

### 4.3 Performance

L'index existant `(alliance_id, created_at DESC)` suffit. La plage 7j sur une alliance active = quelques dizaines de rows max (combat events). Négligeable. Pas de cache nécessaire.

---

## 5. État vides, erreurs, edge cases

| Cas | Rendu |
|---|---|
| Aucun combat en 7j | Pill affiche `7j : 0V / 0D` (pas masquée) |
| 0 candidatures | Pas de badge sur `ManageShortcutCard`, texte "Aucune candidature en attente" |
| 0 activité | Card preview affiche "Pas encore d'activité." |
| 0 messages chat | Card preview affiche "Silence radio." |
| Membre simple (pas leader) | `ManageShortcutCard` masquée. Bouton `[Gérer]` du hero masqué. Kebab reste (pour "Quitter") |
| Fondateur seul dans l'alliance | `MembersPreviewCard` n'affiche que lui, sans section "officiers" |
| Route directe vers `/alliance/gestion` en tant que membre | Redirect vers `/alliance` |
| Route directe vers `/alliance/*` sans alliance | Redirect vers `/alliance` qui affiche `NoAllianceView` |

---

## 6. Navigation et conservation de l'état

- Le sidebar / bottom bar pointent toujours sur `/alliance` (entrée dans le hub). Aucun changement dans `Sidebar.tsx` ni `BottomTabBar.tsx`.
- Les sous-pages Alliance ne sont pas listées dans le sidebar (c'est du drill-down), mais chaque sous-page a un bouton "← Alliance" dans son `PageHeader` pour revenir au hub (pattern cohérent avec d'autres sous-pages du jeu).
- `useSSE` et l'invalidation sur `alliance-log:new` continuent de fonctionner comme avant : toutes les routes `/alliance/*` s'abonnent via les mêmes hooks tRPC.

---

## 7. Mobile

- Pas de tabs. Chaque carte du hub est tappable et mène à sa sous-page en plein écran.
- Sous-pages mobile : header + contenu plein largeur, scroll vertical. Le chat plein écran utilise `100dvh`.
- Le hero s'empile : blason + nom + devise sur la 1ʳᵉ ligne, stats en 2ᵉ ligne (wrap), actions `[Gérer] ⋮` en 3ᵉ ligne.

---

## 8. Tests

- **Unitaires (web) :** rendu conditionnel de `ManageShortcutCard` selon `myRole`, troncature "État-major" à 6 officiers, formatage `recentMilitary` (0/0, gros nombres, absence).
- **Unitaires (api) :** `getRecentMilitary` retourne `{0, 0}` pour une alliance sans logs, retourne les bons compteurs avec un jeu de fixtures.
- **E2E smoke (manuel) :** connecter 2 comptes, déclencher un combat gagné puis perdu, vérifier que le hero affiche `7j : 1V / 1D` et que la carte activité reflète les 2 événements. Vérifier la navigation hub → sous-pages → retour.

---

## 9. Migration / rollout

- Pas de feature flag. La refonte remplace le fichier existant.
- Migration douce : la route `/alliance` change de rendu du jour au lendemain ; les URLs externes éventuelles (il n'y en a pas connues) continueraient de fonctionner puisqu'on garde `/alliance` comme entrée.
- Nettoyage : supprimer `renderInfoSection`, `renderMembersSection`, `renderActivitySection`, `renderManageSection` de `Alliance.tsx` une fois que les composants ont été extraits vers le nouveau découpage.

---

## 10. Récapitulatif des décisions

| Décision | Choix | Raison |
|---|---|---|
| Layout | Hub + sous-pages | Lisibilité au-dessus de la ligne de flottaison, mobile plus court, pas de tabs |
| Stats hero | 5 pills (membres, rang, pts, fondation, 7j W/L) | Identité + signal d'activité récente, sans surcharger |
| Bilan 7j | Compteur SQL dédié côté API | Stat d'identité → doit être exacte, coût négligeable |
| Chat | Preview + sous-page + overlay global | Preview pour awareness, sous-page pour immersion, overlay pour papoter en naviguant |
| Gestion | Hub shortcut + sous-page + raccourcis contextuels | Catchall sans fragmenter, "Inviter" reste près des membres |
| Membres preview | Fondateur + officiers | État-major > top points (plus utile politiquement) |
| Quitter | Kebab du hero | Action de compte, cachée des fat-fingers, accessible partout |
| NoAllianceView | Hors scope | Focus sur les alliancés, le pré-alliance fait son job |

---

## 11. Livrables non inclus (specs futurs)

- **Annonces épinglées** (message sticky visible par tous, édité par fondateur/officiers) — spec séparé.
- **Système de diplomatie** (alliances alliées/ennemies/neutres, pactes de non-agression) — spec séparé, dépend de nouveaux modèles de données.
