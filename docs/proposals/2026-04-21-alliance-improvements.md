# Alliance - Pistes d'ameliorations

## 1. Utilite economique

### Tresor d'alliance
Les membres peuvent donner des ressources au tresor commun (mutation `donate`).
Le fondateur/officers peuvent redistribuer depuis le tresor.
Schema : table `alliance_treasury` avec minerai/silicium/hydrogene.

### Marche interne a 0% commission
Les offres du marche galactique entre membres de la meme alliance ont 0% de commission.
Pas de nouveau systeme, juste une condition dans le calcul de la commission existante.

### Taxe optionnelle
Le fondateur peut definir un taux de taxe (0-10%) sur la production de chaque membre.
Ressources prelevees et versees au tresor. Desactivable par defaut.

---

## 2. Utilite militaire

### Attaques coordonnees (ACS)
Plusieurs membres envoient des flottes sur la meme cible avec timer de synchronisation.
Les flottes arrivent en meme temps et combattent ensemble.
Integration : nouveau flag `coordinatedAttackId` sur les fleet_events.

### Stationnement defensif
Mission "station" chez un allie. La flotte reste sur la planete de l'allie et defend en cas d'attaque.
Le systeme de combat prend deja les defenses en compte, ajouter les flottes stationnees aux forces du defenseur.

### Guerre d'alliance
Declaration de guerre formelle entre deux alliances.
Pendant la guerre : bonus de pillage +20%, pas de penalite de reputation, tableau de bord des combats (kill count, ressources pillees).

---

## 3. Utilite recherche & production

### Bonus de taille (membres actifs)
- 5 membres : +2% production tous les membres
- 10 membres : +3% vitesse de recherche
- 15 membres : +5% capacite de stockage
- 20 membres : +2% vitesse de flotte

Integration : meme pattern que biomes/talents, `alliance_bonus` injecte dans le calcul de production.

### Profil d'alliance (bonus par composition des vaisseaux amiraux)

Le jeu a 3 coques de vaisseau amiral : `combat`, `industrial`, `scientific`.
On calcule la repartition des coques au sein de l'alliance et le type majoritaire
definit le **profil de l'alliance** + un bonus collectif pour tous les membres.

**Calcul** : a chaque changement de coque d'un membre, on recalcule la repartition.
Le profil est celui de la coque majoritaire (>= 50% des membres). Si aucune majorite,
le profil est "equilibre" avec un bonus generique plus faible.

**Profils et bonus** :

| Profil | Condition | Bonus collectif |
|---|---|---|
| Militaire | Majorite coque `combat` | +5% degats armes, +5% bouclier pour tous les membres |
| Industrielle | Majorite coque `industrial` | +5% production minerai/silicium/hydrogene, +5% cargo |
| Scientifique | Majorite coque `scientific` | +5% vitesse de recherche, +1 info espionnage |
| Equilibre | Aucune majorite | +2% production, +2% degats, +2% vitesse recherche |

**Scaling** : le bonus augmente avec la concentration.
- 50-65% d'une meme coque : bonus de base
- 66-80% : bonus x1.5
- 81%+ : bonus x2

**Affichage** : le profil d'alliance est affiche sur la page alliance (icone + label),
dans le classement, et sur le blason. Ca donne une identite visible : "ah c'est une
alliance militaire, attention" ou "c'est des mineurs, ils ont des ressources".

**Integration technique** : s'injecte dans le systeme de bonus existant (meme pattern
que les biomes/talents). Stocke comme `alliance_profile` dans la table alliances ou calcule
a la volee depuis les flagships des membres.

### Recherche d'alliance
Arbre de recherche dedie a l'alliance, finance par le tresor.
Exemples :
- "Logistique avancee" : +5% cargo de tous les membres
- "Reseau de senseurs" : +1 niveau d'espionnage effectif pour tous
- "Fortification" : +10% bouclier planetaire

Pattern de recherche existant mais avec le tresor comme source de cout.

### Vaisseaux d'alliance

Vaisseaux constructibles uniquement si l'alliance a debloque le prerequis correspondant
(module de station a un certain niveau ou recherche d'alliance). Le joueur les construit
dans son propre chantier naval mais le prerequis est collectif.

| Vaisseau | Prerequis alliance | Role | Stats cles |
|---|---|---|---|
| **Mega Cargo** | Hangar commun niv. 3 | Transport massif | Cargo x10 du LargeCargo, tres lent, 0 combat |
| **Croiseur lourd** | Plateforme defensive niv. 5 | Vaisseau capital | Stats combat >> battlecruiser, lent, tres cher |
| **Brouilleur** | Radar longue portee niv. 3 | Support/contre-espionnage | 0 attaque, reduit la detection des flottes alliees lors d'ACS |
| **Batisseur** | Noyau central niv. 1 | Construction de station | Tres cher, lent, 0 combat, consomme a la construction |

Ca donne une raison mecanique forte de rejoindre une alliance : ces vaisseaux sont
inaccessibles en solo. L'alliance debloque du contenu de jeu exclusif.

---

## 4. Station spatiale d'alliance

### Concept
Entite physique sur la carte galactique, construite et upgradee collectivement.
Sert de QG : tresor, labos, hangars communs, defenses. Peut etre attaquee et detruite.
Occupe une position speciale dans un systeme (position 16, apres les planetes).
Visible sur la carte galactique avec le blason de l'alliance.

### Vaisseau Batisseur
Nouveau type de vaisseau : tres cher, lent, aucune capacite de combat.
Prerequis eleves (Centre de Pouvoir Imperial haut niveau, recherche Hyperespace, etc.).
Consomme a la construction de la station (comme le vaisseau de colonisation).
Egalement necessaire pour relocaliser la station (tres couteux).

### Modules de station
La station est composee de modules upgradeables independamment, finances par le tresor :

| Module | Fonction | Effet |
|---|---|---|
| Noyau central | Coeur de la station, obligatoire | Definit le tier, debloque les autres modules |
| Coffre-fort | Stockage du tresor d'alliance | Capacite de stockage des 3 ressources |
| Laboratoire | Recherche d'alliance | Permet de lancer les recherches d'alliance |
| Hangar commun | Stockage de flottes | Les membres peuvent stationner des flottes a la station |
| Plateforme defensive | Defenses fixes | Tourelles, boucliers, protege la station |
| Radar longue portee | Vision etendue | Revele les mouvements de flottes dans les X systemes autour |
| Hub commercial | Marche interne | Debloque le marche 0% commission entre membres |
| Porte de saut | Teleportation | Reduit le temps de trajet des flottes membres vers/depuis la station |

### Siege de station
La station peut etre attaquee. Si le noyau central tombe a 0 HP, la station est detruite.
Les ressources du tresor deviennent des debris recuperables.
Enjeu strategique : proteger sa station, attaquer celle de l'ennemi.

---

## 5. Territoire & galaxie

### Systemes revendiques
Une alliance peut revendiquer un systeme solaire. Marque sur la carte galactique avec le blason.
Pas de blocage mecanique mais bonus defensif (+10% bouclier) dans un systeme revendique.
Limite : 1 systeme par tranche de 5 membres.

### Siege d'alliance (QG)
Remplace par la station spatiale (voir section 4). Le systeme ou est placee la station
devient de facto le QG de l'alliance.

---

## 6. Logs d'alliance (journal d'activite)

### Concept
Fil d'activite en temps reel visible par tous les membres dans un onglet dedie de la page alliance.
Chaque evenement important genere automatiquement une entree de log.
Stocke en table `alliance_logs` (allianceId, type, data jsonb, createdAt) avec TTL de 30 jours.

### Evenements militaires
- "**PlayerA** attaque par **PlayerB** sur sa planete **Loulou** [2:45:8]" (resultat : victoire/defaite)
- "**PlayerA** a lance une attaque sur **PlayerB** [3:12:5]"
- "**PlayerA** a espionne **PlayerB** [1:88:3]"
- "**PlayerA** a ete espionne par **PlayerB** sur **Loulou** [2:45:8]"
- "La station d'alliance a ete attaquee par [TAG] AllianceEnnemie"
- "**PlayerA** a stationne une flotte chez **PlayerB** sur **MaPlanete** [2:45:8]"

### Evenements de membres
- "**PlayerA** a rejoint l'alliance"
- "**PlayerA** a quitte l'alliance"
- "**PlayerA** a ete expulse par **OfficerB**"
- "**PlayerA** a ete promu officier par **FounderC**"
- "**PlayerA** a ete retrograde membre par **FounderC**"

### Evenements de progression
- "**PlayerA** a colonise une nouvelle planete **NomPlanete** [2:45:8]"
- "**PlayerA** a termine la recherche **Propulsion Hyperespace** niveau 5"
- "**PlayerA** a construit un **Croiseur** (x10) sur **MaPlanete**"
- "Recherche d'alliance **Logistique avancee** niveau 3 terminee"

### Evenements economiques
- "**PlayerA** a donne 50 000 minerai au tresor"
- "**OfficerB** a distribue 100 000 silicium du tresor a **PlayerA**"
- "Module **Laboratoire** de la station ameliore au niveau 4"

### Evenements diplomatiques
- "Pacte de non-agression signe avec [TAG2] AllianceB"
- "Guerre declaree contre [TAG3] AllianceC"
- "[TAG3] AllianceC a rompu le pacte commercial"

### Implementation
Chaque systeme existant (combat, espionnage, colonisation, gestion de membres...) insere un log
via un service `allianceLog.add(allianceId, type, data)` au moment ou l'action se produit.
Le frontend poll ou ecoute via SSE pour afficher les nouveaux logs en temps reel.
Filtres par categorie (militaire, membres, progression, economie, diplomatie).

---

## 7. Social & engagement

### Objectifs d'alliance (quetes hebdomadaires)
Quetes collectives : "Piller 500k de minerai ensemble", "Coloniser 3 nouvelles planetes", "Gagner 10 combats".
Recompense : bonus temporaire pour tous les membres pendant 24h.
Integration avec le systeme de daily quests existant.

### Classement interne
Leaderboard au sein de l'alliance (points, production, combats gagnes).

---

## 8. Diplomatie

### Pactes inter-alliances
Systeme de pactes stocke en DB, propose par une alliance, accepte par l'autre.
Rupture avec delai de preavis (24h).

| Pacte | Effet |
|---|---|
| NAP (Non-Agression) | Attaques entre membres des 2 alliances bloquees ou marquees comme violation |
| Pacte commercial | Commission reduite (50% de reduction) entre les 2 alliances |
| Alliance militaire | Permet les attaques coordonnees (ACS) inter-alliances |

---

## 9. Renseignement & cooperation

### Rapports d'espionnage partages
Quand un membre espionne une cible, le rapport est automatiquement visible par les officers/fondateur
dans un onglet "Renseignements" de la station. Intelligence collective sans copier-coller dans le chat.

### Radar de station
Le module radar longue portee de la station (voir section 4) revele les mouvements de flottes
hostiles dans les systemes environnants. Alerte en temps reel pour tous les membres.

---

## 10. Gestion avancee

### Grades personnalisables
Au lieu de founder/officer/member, le fondateur peut creer des grades custom avec permissions granulaires :
- Peut inviter
- Peut kick
- Peut gerer le tresor
- Peut lancer une recherche d'alliance
- Peut declarer la guerre
- Peut revendiquer un systeme
Stocke comme JSON de permissions par grade.

### Systeme de mentor
Quand un nouveau joueur rejoint, un officer peut etre assigne comme mentor.
Le mentor voit les planetes du filleul et peut lui envoyer des ressources sans cout de transport.
Incentive a recruter et integrer des debutants.

### Prestige d'alliance
Score qui monte avec le temps et les accomplissements (victoires en guerre, objectifs completes, age).
Le prestige debloque des cosmetiques (cadres de blason, titres speciaux).
Critere de classement alternatif au total de points.

---

## Priorites suggerees

| # | Piste | Impact | Effort |
|---|---|---|---|
| 1 | Logs d'alliance | Conscience collective, engagement | Moyen |
| 2 | Tresor + dons + marche 0% | Base eco collective | Moyen |
| 3 | Bonus de taille | Raison mecanique | Faible |
| 3b | Profil d'alliance (coques amiraux) | Identite mecanique emergente | Faible-moyen |
| 3c | Vaisseaux d'alliance | Contenu exclusif, raison de rejoindre | Moyen-eleve |
| 4 | Stationnement defensif | Cooperation militaire | Moyen |
| 5 | Attaques coordonnees (ACS) | Game changer PvP | Eleve |
| 6 | Recherche d'alliance | Progression collective | Moyen-eleve |
| 7 | Station spatiale d'alliance | Ancrage physique, centralise tout | Eleve |
| 8 | Vaisseau Batisseur | Prerequis pour la station | Moyen |
| 9 | Systemes revendiques | Dimension territoriale | Moyen |
| 10 | Guerre d'alliance | Endgame content | Eleve |
| 11 | Objectifs collectifs | Retention | Moyen |
| 12 | Diplomatie (NAP, pactes) | Relations inter-alliances | Moyen |
| 13 | Rapports d'espionnage partages | Intelligence collective | Faible-moyen |
| 14 | Grades personnalisables | Gestion fine | Moyen |
| 15 | Systeme de mentor | Onboarding | Faible |
| 16 | Prestige d'alliance | Progression long terme | Faible-moyen |
