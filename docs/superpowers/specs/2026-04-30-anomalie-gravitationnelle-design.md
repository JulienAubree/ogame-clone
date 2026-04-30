# Anomalie Gravitationnelle — V1 MVP — Design

**Goal :** Introduire un gameplay rogue-lite asynchrone où le joueur engage son vaisseau mère + une flotte dans une succession de combats à profondeur croissante. À chaque palier vaincu, il décide de pousser plus loin (plus de risque, plus de loot) ou de rentrer avec son butin. Wipe = perte sèche. C'est un *vrai* rogue-lite : tu paies l'entrée, tu joues, tu prends ton risque.

**Scope V1 :** mécanique de base avec combats uniquement, map linéaire, scaling difficulté/loot, récompenses ressources + vaisseaux ennemis récupérés. Pas de boons, pas d'événements narratifs, pas de thèmes, pas de map ramifiée — tout ça est documenté en *V2 et au-delà* dans la dernière section.

**Non-goals V1 :**
- Pas de boons (buffs temporaires de run)
- Pas d'événements narratifs / choix textuels
- Pas de thèmes (Anciens, Pirates, etc.)
- Pas de récompenses uniques (vaisseaux ancestraux, tech permanente, blueprints)
- Pas de map à embranchements
- Pas de carburant entre nœuds
- Pas de méta-progression (renommée d'explorateur)

---

## 1. Concept

Un joueur lance une **mission "Anomalie Gravitationnelle"** depuis la page Missions ou la vue Empire. Cette mission :
- Exige le **vaisseau mère**
- Coûte **5 Exilium** au lancement (récupéré sur retour, perdu sur wipe)
- Engage la flotte sélectionnée — bloquée jusqu'au retour

Une fois engagé, le joueur entre dans un **run rogue-lite** : succession de combats indéfiniment plus durs, avec décision binaire à chaque nœud (*continuer ou rentrer*).

```
[Activation 5 Exilium + flotte engagée]
       ↓
[Combat profondeur 1] — facile  ─── Win → loot ×1, choix continuer/rentrer
       ↓
[Combat profondeur 2] — mid     ─── Win → loot ×1.4
       ↓
[Combat profondeur 3] — mid+    ─── Win → loot ×2
       ↓
       ...
       ↓
       [WIPE = perte tout]                [Rentrer = ramène loot + flotte survivante]
```

---

## 2. Économie & balance

### Coût d'engagement

- **5 Exilium fixe** par anomalie ouverte
- 100% remboursé si succès (rentrer ou abandonner volontairement)
- **0% remboursé** si wipe (perte sèche, vrai sink)

### Scaling difficulté/loot par profondeur

À chaque nœud `N` (commence à 1) :

| Métrique | Formule |
|---|---|
| FP ennemi | `playerFleetFP_currentlyAlive × 0.5 × (1.3)^(N-1)` |
| Loot ressources de base | `5000 × 1.4^(N-1)` (réparti minerai/silicium/hydrogène) |
| Vaisseaux ennemis récupérés | `floor(0.15 × (defeated_fleet_count))` à chaque combat gagné |

> **Note** : `playerFleetFP_currentlyAlive` est *recalculé à chaque nœud* sur la flotte vivante. Si tu perds des vaisseaux, le ratio devient défavorable plus vite. C'est l'effet roguelite recherché.

### Configuration (universe seed)

```ts
{ key: 'anomaly_entry_cost_exilium', value: 5 },
{ key: 'anomaly_difficulty_growth', value: 1.3 },     // exposant difficulté/profondeur
{ key: 'anomaly_loot_base', value: 5000 },            // loot ressources nœud 1
{ key: 'anomaly_loot_growth', value: 1.4 },           // exposant loot/profondeur
{ key: 'anomaly_enemy_recovery_ratio', value: 0.15 }, // % vaisseaux ennemis récupérés
{ key: 'anomaly_node_travel_seconds', value: 600 },   // 10min entre nœuds
```

---

## 3. Architecture

### Schéma DB

Une nouvelle table `anomalies` :

```sql
CREATE TABLE anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_planet_id uuid NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'active', -- active | completed | wiped
  current_depth smallint NOT NULL DEFAULT 0,    -- nb of nodes already cleared (0 = nothing yet)
  fleet jsonb NOT NULL,                          -- {[shipId]: count} — ships still alive in the run
  loot_minerai numeric(20,2) NOT NULL DEFAULT 0,
  loot_silicium numeric(20,2) NOT NULL DEFAULT 0,
  loot_hydrogene numeric(20,2) NOT NULL DEFAULT 0,
  loot_ships jsonb NOT NULL DEFAULT '{}',        -- bonus enemy ships recovered
  exilium_paid integer NOT NULL,
  next_node_at timestamptz,                      -- when the next combat can be resolved
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX anomalies_one_active_per_user
  ON anomalies (user_id) WHERE status = 'active';
```

> **Index notable** : `anomalies_one_active_per_user` (partial index PostgreSQL) empêche d'engager 2 anomalies simultanément. Le flagship étant unique, c'est cohérent.

**Sémantique `current_depth`** :
- `0` au démarrage (rien fait encore)
- `1` après avoir vaincu le nœud 1
- `next_node_at` est le timestamp à partir duquel le nœud `current_depth + 1` peut être résolu via `advance`

**Sémantique `fleet`** : un compteur de ships restants. **Pas de tracking de hull partiel** entre nœuds en V1 — chaque combat repart avec les ships à pleine vie (mais en effectif réduit par les pertes accumulées). Ça simplifie énormément l'implémentation et reste fidèle à l'esprit roguelite.

### Module structure

```
apps/api/src/modules/anomaly/
  anomaly.service.ts        ← engage / advance / retreat / abandon
  anomaly.router.ts         ← tRPC endpoints
  anomaly.combat.ts         ← génération ennemi + résolution combat (réutilise simulateCombat)

packages/game-engine/src/formulas/
  anomaly.ts                ← scaling formulas (pure functions, testable)

apps/web/src/pages/
  Anomaly.tsx               ← page dédiée run en cours
apps/web/src/components/anomaly/
  AnomalyEngageModal.tsx    ← écran de configuration initiale
  AnomalyRunView.tsx        ← affichage flotte / loot / next combat
  AnomalyHistoryCard.tsx    ← historique runs terminés
```

### Flux principal

```
1. Joueur ouvre AnomalyEngageModal
   - Sélectionne ships (flagship obligatoire)
   - Confirme : POST anomaly.engage
2. Server :
   - Vérifie 5 Exilium dispo, flagship sur planète mère, status=active
   - Spend Exilium, lock flagship (status='in_mission')
   - Lock ships engagés sur planète d'origine (move out of planetShips)
   - Insert row anomalies, current_depth=0, next_node_at=now+10min
   - Retourne anomalyId
3. Joueur consulte régulièrement (page /anomaly)
   - Quand next_node_at est passé → frontend appelle anomaly.advance
4. Server anomaly.advance :
   - Génère ennemi scalé (FP target = currentFleetFP × 0.5 × 1.3^(depth-1))
   - simulateCombat existant
   - Applique pertes
   - Si attacker survives :
     - currentDepth++, ajoute loot, ajoute enemy ships
     - Reset next_node_at = now+10min
     - Retourne 'survived' + nouvelles stats
   - Si attacker wiped :
     - status='wiped', ships perdus, loot perdu, exilium perdu
     - Flagship status='incapacitated' (réparation classique)
     - Retourne 'wiped'
5. Joueur voit le résultat, choisit :
   - 'Continuer' = rien à faire, le timer next_node_at fait son taf
   - 'Rentrer' (anomaly.retreat) :
     - status='completed', completed_at=now
     - Crédite ressources sur homeworld
     - Réinjecte ships survivants dans planet_ships du homeworld
     - Refund 5 Exilium
     - Flagship libéré (status='active', planetId=homeworld)
```

**Note flagship** : pendant le run, le flagship.status est mis à `in_mission`. Si un combat tue le flagship dans `simulateCombat`, on déclenche un wipe immédiat (peu importe les autres ships) et le flagship est `incapacitated` avec son timer de réparation classique — exactement la même mécanique que les pertes flagship en combat normal.

---

## 4. API tRPC

```ts
anomaly: router({
  current: protectedProcedure.query(...),
  // Returns the active anomaly for the user, or null. Includes flotte
  // restante, loot accumulé, depth, next_node_at.

  engage: protectedProcedure
    .input(z.object({
      originPlanetId: z.string().uuid(),
      ships: z.record(z.string(), z.number().int().min(0)),
    }))
    .mutation(...),
  // Validate flagship in fleet, on planet, no active anomaly.
  // Spend Exilium, lock fleet, create row.

  advance: protectedProcedure.mutation(...),
  // Resolve next combat. Caller must wait until next_node_at passed.
  // Returns { outcome: 'survived'|'wiped', combatReportId, ... }.

  retreat: protectedProcedure.mutation(...),
  // Voluntarily abandon the run. Returns ships + loot to homeworld,
  // refunds Exilium.

  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(...),
  // Returns last N completed/wiped runs for stats.
})
```

---

## 5. UI

### Activation — `AnomalyEngageModal`

Bouton "Anomalie Gravitationnelle" sur :
- Page Missions, à côté des autres types
- Carte planète Empire (si flagship sur cette planète)

Modal :
```
┌────────────────────────────────────────┐
│ ANOMALIE GRAVITATIONNELLE               │
├────────────────────────────────────────┤
│ Coût d'entrée   : 5 Exilium             │
│ Vaisseau mère   : ✓ Disponible (lvl X)  │
│                                         │
│ Composition flotte :                    │
│   Flagship         [✓ obligatoire]      │
│   Smallcargo  [_/12]                    │
│   Largecargo  [_/4]                     │
│   Lightfighter [_/45]                   │
│   ...                                   │
│                                         │
│ FP totale : 4 200                       │
│ Cargo total : 35 000                    │
│                                         │
│ ⚠️ Une fois engagés, ces vaisseaux ne   │
│ sont plus disponibles ailleurs jusqu'au │
│ retour.                                 │
│                                         │
│ [ Annuler ] [ Engager — 5 Exilium ]     │
└────────────────────────────────────────┘
```

### Run en cours — `/anomaly` (page dédiée)

Page conditionnelle : si l'utilisateur a une anomalie active, on l'affiche en plein écran.

```
┌────────────────────────────────────────┐
│ ANOMALIE GRAVITATIONNELLE  ·  Profondeur 4│
├────────────────────────────────────────┤
│                                         │
│  Flotte engagée                         │
│  ─────────────                          │
│  🛸 Vaisseau mère    : 18/30 hull       │
│  📦 Cargos           : 4/5              │
│  ⚔️ Fighters          : 22/30            │
│  💀 Croiseurs         : 0/2 — détruits   │
│                                         │
│  Loot accumulé                          │
│  ─────────────                          │
│  +285 000 minerai                       │
│  +180 000 silicium                      │
│  +65 000 hydrogène                      │
│  +6 fighters récupérés                  │
│                                         │
│  Prochain combat                        │
│  ───────────────                        │
│  ⏱️ Dans 04:32                           │
│  Difficulté estimée : ⚠️⚠️⚠️ (~1100 FP)  │
│                                         │
│  [ 🛑 Rentrer (5 Exilium remboursés) ]  │
│                                         │
└────────────────────────────────────────┘
```

Quand le timer `next_node_at` tombe :
- Si `advance` non encore appelé → bouton **"⚔️ Lancer le combat"**
- Au clic → résolution serveur, affichage du rapport, mise à jour de l'état
- Si wipe → écran fail avec récap "Vous perdez : X" + retour à la page principale après quelques secondes
- Si survived → reprend l'affichage avec depth+1, nouveau timer

### Notifications

Toast SSE quand `next_node_at` est atteint : *"L'anomalie pulse — un combat vous attend"*. Le joueur peut alors revenir résoudre le combat.

---

## 6. Edge cases

| Cas | Comportement |
|---|---|
| Joueur lance engage sans flagship | Erreur "Vaisseau mère requis" |
| Joueur a déjà une anomalie active | Erreur "Une anomalie est déjà en cours" (contrainte unique) |
| Flagship est `in_mission` ou `incapacitated` | Erreur "Vaisseau mère indisponible" |
| Joueur sans 5 Exilium | Erreur "Solde Exilium insuffisant" |
| Flotte dépasse les ships dispo sur planète | Erreur côté validation |
| Joueur appelle `advance` avant `next_node_at` | Erreur "Anomalie pas encore prête" |
| Wipe au combat | Status=`wiped`, flagship→`incapacitated`, ships ennemis perdus, loot perdu, Exilium perdu |
| `retreat` pendant que `next_node_at` est passé mais pas résolu | Autorisé : on annule le combat, retour direct |
| Server crash entre advance et update DB | La row anomalies n'est mise à jour que via transaction → cohérence |
| Joueur abandonne sa session pendant l'anomalie | L'état est server-side, il reprendra où il en était |
| L'anomalie reste active "à l'infini" si le joueur ne fait rien | Acceptable en V1 (pas d'expiration). Si abuse → ajouter `expires_at` en V1.5 |

---

## 7. Tests

### Game-engine
`packages/game-engine/src/formulas/anomaly.test.ts` :
- `anomalyEnemyFP(playerFP, depth, growth)` → vérifie scaling
- `anomalyLoot(depth, base, growth)` → vérifie scaling
- `anomalyEnemyRecoveryCount(defeatedShips, ratio)` → vérifie l'arrondi

### Anomaly service
`apps/api/src/modules/anomaly/__tests__/anomaly.service.test.ts` :
- `engage` :
  - Spend Exilium, lock flagship + ships, create row
  - Reject if no flagship, no Exilium, anomaly active, flagship busy
- `advance` :
  - survived → depth++, loot ajouté, ships ennemis ajoutés, next_node_at avancé
  - wiped → status='wiped', flagship incapacitated, ships perdus
  - Pas appelable avant next_node_at
- `retreat` :
  - status='completed', ships + loot crédités sur homeworld, Exilium remboursé

### UI
Smoke test dev manual : engage → wait timer → advance → loop → retreat. Vérifier que les ressources et ships arrivent bien sur le homeworld.

---

## 8. Migration & rollout

- Migration Drizzle : nouvelle table `anomalies` (idempotent `IF NOT EXISTS`)
- Universe config : 6 nouvelles clés (`anomaly_*`)
- Pas de feature flag — la mission n'apparaît dans l'UI que si `centerLevel ≥ 3` (gating naturel pour les jeunes joueurs qui n'ont pas le flagship optimisé)

---

## 9. Phases futures (V2+)

Documenté ici pour qu'on ne perde pas la vision globale.

### V2 — Boons

À chaque combat gagné, le joueur choisit **1 parmi 3 boons** tirés au sort. Effet appliqué jusqu'à la fin du run actuel.

Pool de ~15-20 boons :
- *Boucliers anciens* : +30% shield jusqu'à la fin
- *Réparateur infiltré* : +10% hull regen après combat
- *Cargo trafiqué* : +50% loot ressources
- *Camouflage spectral* : skip 1 combat (avance sans perte)
- *Réacteurs surchauffés* : -50% temps entre nœuds
- *Lecture des cartes* : voir difficulté de N+2 prochains nœuds
- *Bras armé prêté* : +5 lightfighters spawnent dans la flotte engagée
- *Pacte du marchand* : transforme un combat en event marchand
- *Échos du passé* : doublons applicables sur le prochain combat (le boon de prochain combat sera doublé)
- *Anti-onde* : combat suivant 50% plus facile mais loot 50% plus petit

Tables nouvelle table `anomaly_boons` (anomalyId, boonId, source, appliedAt).

### V3 — Événements narratifs

Nouveau type de nœud : `event` (à la place ou en mix avec combat). Choix textuel à 2-3 options, conséquences (loot, boon, malus, ramification).

Pool de ~30 événements écrits, pas générés. Contenu artisanal.

### V4 — Map ramifiée

À chaque nœud, choix entre 2-3 voies (façon Slay the Spire). La map est révélée progressivement. Le joueur planifie sa route.

### V5 — Thèmes

5 thèmes : Anciens / Voilés / Glaciaire / Pirates / Quantique. Chaque thème module la pool d'ennemis, événements, boons, récompenses finales.

### V6 — Récompenses uniques

- **Vaisseaux uniques** : "Frégate Ancienne", "Croiseur Spectral" — vaisseaux non-craftables, récupérés exclusivement via anomalies de tier élevé
- **Tech permanente** : artefacts qui ajoutent des bonus permanents (genre "+5% prod permanent" stackable jusqu'à N fois)
- **Blueprints** : variantes de vaisseaux/bâtiments standards avec stats légèrement différentes

### V7 — Méta-progression "Renommée d'Explorateur"

Points gagnés à chaque run terminé (succès ou échec). Paliers qui débloquent :
- 100 — 1 boon offert au début
- 500 — 1 retry par anomalie
- 1500 — 1 nœud bonus "Marchand Exilé"
- 5000 — Refus de boss possible avec 80% du loot
