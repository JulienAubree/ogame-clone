# Page profil joueur — Design Spec

## Objectif

Ajouter une page profil joueur avec description, avatar pixel art (portraits de commandants), preferences de jeu et techniques, et un systeme d'amis par demande mutuelle. Chaque joueur controle la visibilite de son profil public.

## Principes

- **Pas de nouvelle table pour les avatars** : fichiers statiques dans le dossier d'assets configure par `ASSETS_DIR` (env), scannes par l'API
- **Enrichir `users`** plutot que creer une table profil separee
- **Visibilite configurable** : chaque joueur choisit ce qu'il rend public
- **Amitie mutuelle** : demande + acceptation requise
- **Bio = texte brut** : pas de HTML, pas de markdown. React echappe par defaut, pas de sanitization supplementaire necessaire.

---

## Modele de donnees

### Colonnes ajoutees a `users`

| Colonne | Type | Default | Description |
|---------|------|---------|-------------|
| `bio` | text, nullable | `null` | Description libre, max 500 caracteres (texte brut) |
| `avatarId` | text, nullable | `null` | Nom du fichier avatar (ex: `commander-01`) |
| `playstyle` | pgEnum `playstyleEnum` | `null` | `'miner'`, `'warrior'`, `'explorer'` — nullable |
| `seekingAlliance` | boolean | `false` | Indique si le joueur cherche une alliance |
| `theme` | text | `'dark'` | `'dark'` ou `'light'` |
| `profileVisibility` | jsonb | `{"bio":true,"playstyle":true,"stats":true}` | Controle ce que les autres joueurs voient. Les cles absentes sont traitees comme `true` (visible par defaut). |

### Nouvelle table `friendships`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid PK | |
| `requesterId` | uuid FK users | Joueur qui envoie la demande |
| `addresseeId` | uuid FK users | Joueur qui recoit la demande |
| `status` | pgEnum `friendshipStatusEnum` | `'pending'`, `'accepted'` |
| `createdAt` | timestamp | Date de la demande |
| `updatedAt` | timestamp | Date de derniere modification |

**Contraintes :**
- Unique sur `(requesterId, addresseeId)` pour eviter les doublons
- Index sur `addresseeId` pour les requetes `pendingReceived`, `accept`, `decline`
- `requesterId != addresseeId` (check constraint, pas d'auto-amitie)

**Comportement au refus :** quand une demande est refusee, la ligne est **supprimee** de la table. Cela permet au demandeur de renvoyer une demande plus tard. Il n'y a pas de statut `declined` — refuser = supprimer.

**Annulation :** un joueur peut annuler une demande qu'il a envoyee (tant qu'elle est `pending`). Cela supprime aussi la ligne.

### Galerie d'avatars

Les avatars sont des fichiers statiques (portraits de commandants pixel art) dans le dossier `avatars/` sous `ASSETS_DIR` (la variable d'environnement deja utilisee par `planet.service.ts`). L'admin uploade les images manuellement. Le champ `avatarId` sur `users` stocke le nom de fichier sans extension (ex: `commander-01`). Le frontend affiche `/assets/avatars/{avatarId}.webp`.

L'endpoint `user.listAvatars` scanne `ASSETS_DIR/avatars/` et retourne la liste des noms de fichiers (sans extension).

---

## API (routes tRPC)

Toutes les procedures sont des `protectedProcedure` (authentification requise).

### Router `user` (enrichi)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `user.search` | query | `{ query: string }` | **Existant** — recherche par username |
| `user.getProfile` | query | `{ userId: string }` | Profil public d'un joueur. Filtre les champs selon `profileVisibility` (cle absente = visible). Inclut le statut de la relation d'amitie avec le joueur courant (`none`, `pending_sent`, `pending_received`, `friends`). |
| `user.getMyProfile` | query | — | Mon profil complet avec toutes les donnees, sans filtre de visibilite |
| `user.updateProfile` | mutation | `{ bio?, avatarId?, playstyle?, seekingAlliance?, theme?, profileVisibility? }` | Met a jour mon profil. Validation : bio max 500 chars, avatarId doit exister dans la galerie, playstyle parmi les valeurs de l'enum. |
| `user.listAvatars` | query | — | Scanne `ASSETS_DIR/avatars/` et retourne la liste des noms de fichiers disponibles |

### Nouveau router `friend`

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `friend.list` | query | — | Liste mes amis acceptes (id, username, avatarId). Pas de pagination V1 (nombre d'amis attendu faible). |
| `friend.pendingReceived` | query | — | Demandes recues en attente |
| `friend.pendingSent` | query | — | Demandes envoyees en attente |
| `friend.request` | mutation | `{ userId: string }` | Envoyer une demande. Erreur si : deja amis, demande deja existante, auto-demande. |
| `friend.accept` | mutation | `{ friendshipId: string }` | Accepter une demande recue. Erreur si le joueur courant n'est pas l'addressee. |
| `friend.decline` | mutation | `{ friendshipId: string }` | Refuser une demande recue. **Supprime la ligne** (permet de re-demander plus tard). |
| `friend.cancel` | mutation | `{ friendshipId: string }` | Annuler une demande envoyee (pending uniquement). **Supprime la ligne.** |
| `friend.remove` | mutation | `{ friendshipId: string }` | Supprimer un ami accepte. Supprime la ligne. Fonctionne pour les deux cotes de la relation. |

---

## Frontend

### Pages

Deux nouvelles routes a ajouter au router React :
- `/profile` → composant `Profile`
- `/player/:userId` → composant `PlayerProfile`

#### `/profile` — Mon profil (editable)

Layout deux colonnes (responsive, empile sur mobile) :

**Colonne gauche :**
- Avatar (image pixel art ou initiales generees si pas d'avatar) avec bouton "Changer" ouvrant le `AvatarPicker`
- Username (non editable)
- Rang
- Badge playstyle
- Section "Amis" : miniatures d'avatars des amis, lien vers chaque profil
- Section "Demandes" : compteur de demandes recues, lien vers `FriendRequests`

**Colonne droite :**
- Bio (textarea editable, 500 chars max)
- Stats : rang, points, nombre de planetes, alliance
- Preferences de jeu : playstyle (select), seeking alliance (toggle)
- Preferences techniques : theme (toggle dark/light)
- Visibilite : checkboxes (bio, playstyle, stats)

#### `/player/:userId` — Profil public

Meme layout deux colonnes mais en lecture seule. Les sections masquees par `profileVisibility` ne s'affichent pas.

**Bouton contextuel selon la relation :**
- Pas d'ami → "Ajouter en ami"
- Demande envoyee → "Annuler la demande"
- Demande recue → "Accepter / Refuser"
- Amis → "Retirer des amis"

**Bouton "Envoyer un message"** : ouvre le chat overlay existant avec ce joueur.

### Composants

- **`AvatarPicker`** — modale affichant une grille d'avatars pixel art. Selection au clic, ferme la modale. Charge les donnees depuis `user.listAvatars`.
- **`ProfileCard`** — carte compacte reutilisable (avatar + username + rang). Utilisable dans le ranking, la liste d'amis, les resultats de recherche.
- **`FriendList`** — liste des amis acceptes avec avatar miniature et lien vers `/player/:userId`.
- **`FriendRequests`** — demandes recues et envoyees avec boutons d'action (accepter/refuser/annuler).

### Points d'entree dans la navigation

- Nouveau lien "Profil" dans la sidebar et le bottom tab bar. Utiliser une nouvelle icone profil (silhouette utilisateur) dans `icons.tsx`.
- Clic sur un username dans le classement → `/player/:userId`
- Clic sur un username dans les messages/conversations → `/player/:userId`

---

## Stats affichees (V1)

Donnees calculees a la volee depuis les tables existantes :
- **Rang** et **points** : depuis `rankings`
- **Nombre de planetes** : `count(planets)` pour le joueur
- **Alliance** : depuis `allianceMembers` + `alliances`

Enrichissement futur (hors scope V1) : nombre de combats, ratio V/D, ressources totales, etc.

---

## Hors perimetre

- **Gestion de la galerie d'avatars dans l'admin** : l'admin uploade manuellement les fichiers, pas de CRUD d'avatars dans cette spec
- **Statut en ligne** des amis : feature future
- **Notifications d'amitie en temps reel** : les demandes apparaissent au refresh, pas de push notification pour V1
- **Stats detaillees** : combats, ratio V/D, historique — feature future
- **Theme clair** : le champ `theme` est stocke, mais l'implementation du theme clair dans le CSS est hors scope (le toggle est present dans l'UI)
- **Pagination de la liste d'amis** : pas necessaire V1 (nombre d'amis attendu faible), a ajouter si besoin
