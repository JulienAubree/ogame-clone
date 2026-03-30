# Preferences de notifications - Design Spec

## Contexte

Actuellement les joueurs n'ont aucun controle sur les notifications qu'ils recoivent, a part les preferences push par appareil (6 categories dans `push_subscriptions.preferences`). Le systeme envoie systematiquement toasts, push et game events pour chaque evenement, ce qui peut spammer les joueurs actifs.

## Objectif

Permettre au joueur de controler quels types d'evenements declenchent quels canaux de notification, via une interface dans le Profil et un raccourci sur la cloche.

## Canaux (3)

- **Toast** : bandeau ephemere 5s, affiche via SSE -> useNotifications
- **Push** : notification navigateur/OS, via pushService.sendToUser
- **Cloche** : game event persistant en DB, via gameEventService.insert

## Categories (10)

| Categorie | Label FR | Event types couverts |
|---|---|---|
| `building` | Batiments | `building-done` |
| `research` | Recherche | `research-done` |
| `shipyard` | Chantier spatial & Centre de commandement | `shipyard-done` |
| `fleet` | Flottes | `fleet-arrived`, `fleet-returned`, `fleet-inbound` |
| `combat` | Combat | `fleet-attack-landed`, `fleet-hostile-inbound`, `flagship-incapacitated` |
| `message` | Messages | `new-message`, `new-reply` |
| `market` | Marche galactique | `market-offer-reserved`, `market-offer-sold`, `market-offer-expired`, `market-reservation-expired` |
| `alliance` | Alliance | `alliance-activity`, `new-alliance-message` |
| `social` | Social | `friend-request`, `friend-accepted`, `friend-declined` |
| `quest` | Missions & Quetes | `daily-quest-completed`, `tutorial-quest-complete` |

## Base de donnees

### Nouvelle table `notification_preferences`

```
notification_preferences
  id: uuid PK defaultRandom
  userId: uuid FK users UNIQUE NOT NULL (onDelete cascade)
  toastDisabled: text[] NOT NULL DEFAULT '{}'
  pushDisabled: text[] NOT NULL DEFAULT '{}'
  bellDisabled: text[] NOT NULL DEFAULT '{}'
  updatedAt: timestamp with timezone NOT NULL DEFAULT now()
```

- Les tableaux contiennent les categories desactivees (ex: `['shipyard', 'quest']`)
- Tableaux vides = tout actif (defaut)
- Une seule ligne par user (UNIQUE sur userId)
- Les anciennes `push_subscriptions.preferences` restent en place pour compatibilite mais ne sont plus consultees pour le filtrage — `notification_preferences.pushDisabled` prend le relais

### Index
- `notification_preferences_user_idx` sur `userId` (implicite via UNIQUE)

## API (tRPC)

### `notification.getPreferences`
- Query protegee
- Retourne les prefs du user ou les defaults (tout actif) si pas de ligne
- Shape retour : `{ toastDisabled: string[], pushDisabled: string[], bellDisabled: string[] }`

### `notification.updatePreferences`
- Mutation protegee
- Input : `{ toastDisabled: string[], pushDisabled: string[], bellDisabled: string[] }`
- Validation Zod : chaque element doit etre dans la liste des 10 categories
- Upsert (insert on conflict update)

## Backend : filtrage

### Toast (cote frontend)
- `publishNotification` ajoute le champ `category` au payload SSE (mapping event type -> categorie)
- `useNotifications.ts` charge les prefs via `notification.getPreferences` et skip le toast si la categorie est dans `toastDisabled`
- Aucun changement backend pour les toasts

### Push (cote backend)
- `pushService.sendToUser(userId, category, payload)` : avant d'envoyer, lire `notification_preferences` pour le user. Si `category` est dans `pushDisabled`, ne pas envoyer.
- Remplace l'ancien systeme de `push_subscriptions.preferences` par appareil — desormais c'est par user

### Cloche / Game Events (cote backend)
- `gameEventService.insert(userId, planetId, type, payload)` : avant d'inserer, verifier si la categorie du type est dans `bellDisabled`. Si oui, ne pas inserer.
- L'evenement est definitivement perdu (pas de rattrapage)

## Frontend : onglet Profil "Notifications"

### Acces
- Nouvel onglet dans la page Profil existante (`/profile`)
- Onglets existants + nouvel onglet "Notifications"

### Interface
Grille responsive :
- **Lignes** : les 10 categories avec leur label FR
- **Colonnes** : Toast / Push / Cloche
- **Cellules** : toggle (switch) on/off
- Etat par defaut : tout actif (toggles ON)

### Sauvegarde
- Auto-save a chaque toggle (mutation `notification.updatePreferences` avec debounce ~500ms)
- Feedback visuel : indicateur de sauvegarde discret

## Frontend : raccourci cloche

- Icone engrenage (petit, discret) a cote de la cloche dans la TopBar
- Clic -> navigation vers `/profile` avec l'onglet Notifications pre-selectionne (ex: `/profile?tab=notifications`)

## Migration

- Les `push_subscriptions.preferences` existantes ne sont pas migrees automatiquement
- Les nouveaux defaults (tout actif) s'appliquent pour tous les joueurs
- Les anciennes preferences push par appareil restent en DB mais ne sont plus lues

## Hors scope

- Preferences par planete (trop granulaire)
- Horaires de silence (do not disturb)
- Preferences de son/vibration
- Suppression de `push_subscriptions.preferences` (cleanup futur)
