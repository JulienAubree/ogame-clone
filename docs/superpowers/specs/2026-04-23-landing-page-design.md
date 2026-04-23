# Landing page publique — refonte de `/login`

**Date :** 2026-04-23
**Statut :** Validé

## Objectif

Créer une landing publique orientée conversion inscription, en fusion avec la page `/login` actuelle. Elle remplace le formulaire minimal existant par une page marketing complète qui porte le pitch d'Exilium et intègre le login en fin de page.

## Positionnement

### Audience cible

Gamers curieux d'un empire spatial — attirés par la fantaisie 4X (scale, flottes, alliances, combat) mais qui refusent d'y perdre leur vie. Pas des casuals mobile complets, pas des hardcore OGame non plus.

### Promesse centrale

> **Bâtissez votre empire spatial.**

Sous-titre :

> Colonisez des mondes, commandez des flottes, forgez des alliances. Stratégie profonde au rythme qui vous convient — votre empire tourne même hors ligne.

### Trois piliers

1. **Un empire à votre mesure** — des mondes à coloniser, trois ressources à équilibrer, des dizaines de bâtiments à faire monter. Construisez une économie qui tient la route.
2. **Flottes, combat, diplomatie** — concevez vos flottes, lancez des attaques, défendez vos planètes. Rejoignez une alliance ou formez la vôtre. La galaxie est peuplée de vrais joueurs.
3. **Le jeu respecte votre temps** — queues longues, production persistante, notifications précises. 5 minutes de bonnes décisions valent mieux que 4 heures de clics.

### Ton

Vouvoiement systématique. Sobre, évocateur, pas de superlatifs marketing ("révolutionnaire", "incroyable"). On s'adresse à quelqu'un qui a déjà joué à un 4X.

### Direction visuelle : « Promise-first »

Hero typographique fort centré sur la promesse. Fond starfield + render planète flouté. Screenshot tease en bas du hero pour inviter au scroll. Identité visuelle héritée du jeu (`bg-stars`, `glass-card`, `glow-silicium`, palette cyan).

## Structure de la page

Ordre vertical, mobile-first, sur fond `bg-stars` commun :

1. **Header minimal** — wordmark « EXILIUM » (glow-silicium) à gauche ; lien discret `Connexion` à droite qui scrolle vers le formulaire.
2. **Hero** — plein viewport mobile (`min-h-dvh` ou ~90 %). H1 + sous-titre centrés. CTA principal `Fonder votre empire` (bouton plein cyan). Starfield dense + render planète décoratif flouté en fond. Teaser discret en bas (silhouette d'un screenshot qui dépasse).
3. **Section « 3 piliers »** — grille responsive : 1 colonne mobile, 3 colonnes desktop. Chaque carte = un pilier (icône SVG du kit maison + titre + 2 phrases). Style `glass-card`.
4. **Section « Aperçu du jeu »** — 2-3 captures réelles de l'UI avec légende courte :
   - Overview → « Une planète, un coup d'œil »
   - Galaxy → « Explorez la galaxie, rencontrez d'autres joueurs »
   - Combat → « Reports détaillés, vraie simulation »
   Desktop : alternance image gauche/droite. Mobile : empilé image puis texte.
5. **Section « Login inline »** — ancrée `#connexion`. Titre « Déjà empereur ? ». Formulaire existant réutilisé à l'identique (email + mot de passe + rememberMe + liens mot de passe oublié / créer un compte).
6. **CTA final + footer** — bloc centré répétant `Fonder votre empire`. Footer minimal : liens patchnotes/changelog, mentions. Discord optionnel (à confirmer avec le propriétaire).

### Hors scope (YAGNI)

- Pas de FAQ.
- Pas de témoignages/quotes (communauté pas à cette échelle).
- Pas de section pricing (jeu gratuit, pas de plans).
- Pas de vidéo/trailer (pas d'asset, scroll > autoplay).

## Architecture technique

### Fichiers

La landing remplace le contenu de `apps/web/src/pages/Login.tsx`. La route `/login` devient la page publique complète.

```
apps/web/src/pages/Login.tsx                # orchestrateur : compose les sections dans l'ordre
apps/web/src/components/landing/
  ├── LandingHeader.tsx                     # wordmark + lien "Connexion" (scroll to #connexion)
  ├── LandingHero.tsx                       # H1, sous-titre, CTA principal, fond planète flouté
  ├── LandingPillars.tsx                    # 3 cards glass-card, icônes SVG maison
  ├── LandingShowcase.tsx                   # screenshots + légendes alternées
  ├── LandingLoginForm.tsx                  # formulaire extrait de Login.tsx actuel, logique inchangée
  └── LandingFooter.tsx                     # CTA final + liens + mentions
```

`Login.tsx` devient une composition ordonnée de ces sections. Chaque composant est autonome, testable, modifiable indépendamment.

### État & logique

- `LandingLoginForm` conserve intégralement la logique actuelle de `Login.tsx` : `useAuthStore`, `trpc.auth.login`, `resetRefreshState`, `navigate('/')`. Aucune nouvelle logique côté serveur.
- Aucun store ajouté, aucun fetch supplémentaire. La landing est 100 % statique côté React (hors formulaire).

### Routing

- `/login` → `<Login />` (nouvelle landing avec form inline). Inchangé dans `router.tsx`.
- `/` reste protégé par `AuthGuard` : non-auth → redirect vers `/login` (= landing). Comportement actuel préservé.
- `/register` inchangé, resté une page dédiée, liée depuis la landing.

### Assets

- Réutilise styles existants : `bg-stars`, `glass-card`, `glow-silicium`, variables CSS (`--primary`, `--card`, etc.) définies dans `global.css`.
- Screenshots et render planète déposés dans `apps/web/public/assets/landing/` : `overview.webp`, `galaxy.webp`, `combat.webp`, `planet-hero.webp`. Le composant charge directement ces chemins. Fournir les captures in-game avant implémentation finale — pendant le dev, des placeholders sont acceptables.
- Icônes des piliers : kit SVG maison existant.

### SEO / meta

- Mise à jour de `apps/web/index.html` : `<title>`, `<meta name="description">`, balises `og:*` (og:title, og:description, og:image pointant sur `planet-hero.webp`), `twitter:card`.
- Pas de SSR (Vite SPA) : indexation limitée, acceptable pour un jeu indie où le trafic vient majoritairement de liens directs et partages.

### Performance

- Images en `.webp` + `loading="lazy"` sur tout ce qui est sous le hero.
- Planète de fond du hero : version `thumb` (voir pattern `getPlanetImageUrl`) + `fetchpriority="low"` pour ne pas bloquer le LCP.
- Pas de JS bloquant ajouté ; la landing reste lazy-loadée via `lazyLoad()` dans `router.tsx`.

### Tests

- Tests unitaires légers sur chaque sous-composant (rendu, présence des CTA, ancre `#connexion`).
- Flow de login déjà couvert : `LandingLoginForm` garde le même markup et la même mutation tRPC, pas de régression attendue.
- Vérification manuelle mobile (cible principale) + responsive desktop.

## Copy complet à implémenter

### Hero

- **H1** : « Bâtissez votre empire spatial. »
- **Sous-titre** : « Colonisez des mondes, commandez des flottes, forgez des alliances. Stratégie profonde au rythme qui vous convient — votre empire tourne même hors ligne. »
- **CTA principal** : `Fonder votre empire` (lien vers `/register`)
- **CTA secondaire** : `J'ai déjà un compte` (scroll vers `#connexion`)

### Piliers

Voir section « Trois piliers » ci-dessus — copy identique.

### Showcase

- **Overview** : « Une planète, un coup d'œil »
- **Galaxy** : « Explorez la galaxie, rencontrez d'autres joueurs »
- **Combat** : « Reports détaillés, vraie simulation »

### Login inline

- **Titre de section** : « Déjà empereur ? »
- Formulaire inchangé (email, mot de passe, rememberMe, liens mot de passe oublié / créer un compte).

### CTA final

- Bloc centré, répète `Fonder votre empire` avec un court texte d'amorce (à finaliser pendant l'implémentation, par exemple : « Votre galaxie vous attend. »).

### Footer

- Liens : patchnotes (`/changelog`), mentions.
- Discord : à trancher avec le propriétaire avant implémentation.
