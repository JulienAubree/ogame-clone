# Planet Images Design

## Objectif

Attribuer un visuel aleatoire a chaque planete lors de sa creation/colonisation, en fonction de son type (`planetClassId`). Le visuel est fixe une fois attribue. L'admin peut uploader de nouvelles images dans le pool de chaque type.

## Schema DB

- Ajout d'un champ `planetImageIndex` (smallint, nullable) a la table `planets`
- A la creation d'une planete, on scanne les images disponibles pour le type, on tire un index aleatoire parmi les indexes existants, et on le stocke
- Si aucune image n'existe pour le type, `planetImageIndex` reste `null` et le fallback (avatar initiale) s'affiche

### Migration des planetes existantes

- Migration Drizzle : ajout de la colonne `planetImageIndex` (smallint, nullable)
- Script Node.js separe (type `migrate-buildings.ts`) pour peupler les indexes :
  - Pour chaque planete ayant `planetImageIndex IS NULL`, scanner le dossier d'images du type et attribuer un index aleatoire parmi ceux disponibles
  - Si aucune image n'existe pour le type, on laisse `null`

## Structure des assets

```
/assets/planets/volcanic/1.webp, 1-thumb.webp, 1-icon.webp
/assets/planets/volcanic/2.webp, 2-thumb.webp, 2-icon.webp
/assets/planets/arid/1.webp, 1-thumb.webp, 1-icon.webp
/assets/planets/temperate/...
/assets/planets/glacial/...
/assets/planets/gaseous/...
/assets/planets/homeworld/...
```

Chaque image uploadee est traitee par Sharp en 3 variantes :
- Hero (`{index}.webp`) : 1200px, quality 85 — pour la page Overview
- Thumb (`{index}-thumb.webp`) : 400px, quality 80
- Icon (`{index}-icon.webp`) : 64x64, quality 75 — pour le selecteur de planete

Les indexes doivent rester contigus (pas de suppression d'images). La suppression n'est pas supportee dans cette version.

## Upload admin

Sur la page PlanetTypes existante dans l'admin, ajout d'une section "Visuels" par type de planete :
- Affiche les images existantes du pool (grille de thumbnails)
- Bouton "Ajouter un visuel" qui uploade une nouvelle image
- L'index est attribue automatiquement (prochain nombre disponible)
- Endpoint : `POST /admin/upload-asset` existant, etendu pour supporter la categorie `planets` avec un sous-dossier par type

### Endpoint listing images

- Route REST : `GET /admin/planet-images/:planetClassId` (meme pattern auth admin que l'upload)
- Response : `{ images: { index: number; thumbUrl: string }[] }`
- Scan du dossier `/assets/planets/{planetClassId}/` pour lister les fichiers hero (`N.webp` sans suffixe `-thumb`/`-icon`)

## Affichage

### Page Overview (hero)

- Image hero en grand dans le header de la page
- Chemin : `/assets/planets/{planetClassId}/{planetImageIndex}.webp`
- Fallback : avatar initiale existante (premiere lettre du nom de la planete sur fond colore)

### Selecteur de planete (TopBar)

- Icone 64x64 a cote du nom de la planete
- Chemin : `/assets/planets/{planetClassId}/{planetImageIndex}-icon.webp`
- Meme fallback
- Mise a jour de l'interface `Planet` locale dans TopBar pour inclure `planetClassId` et `planetImageIndex` (ou utiliser le type infere tRPC)

### Vue Galaxie (SVG anime)

Pas d'image uploadee ici. Un composant SVG `PlanetDot` qui genere un cercle ~20-24px avec gradient radial selon le type :

| Type | Couleurs |
|------|----------|
| volcanic | rouge / orange |
| arid | jaune / brun |
| temperate | vert / bleu |
| glacial | bleu clair / blanc |
| gaseous | violet / rose |
| homeworld | vert / cyan |
| inconnu (null) | gris neutre |

Le `planetClassId` doit etre expose dans la vue galaxie pour tous les joueurs (info non sensible — le type depend de la position dans le systeme, visible par tous). Ajuster `galaxy.service.ts` pour ne plus masquer `planetClassId`.

Animation CSS : rotation lente du gradient radial via `@keyframes` pour donner l'illusion que la planete tourne. Performant (CSS uniquement, pas de JS).

## API

### Donnees planete

Les endpoints qui retournent des donnees de planete doivent inclure `planetClassId` et `planetImageIndex` dans la reponse (deja le cas pour `planetClassId`, ajouter `planetImageIndex`).

### Utilitaire d'attribution d'image

Fonction utilitaire standalone `getRandomPlanetImageIndex(planetClassId: string, assetsDir: string): number | null` :
1. Scanner `/assets/planets/{planetClassId}/` pour lister les indexes (fichiers `N.webp` sans suffixe)
2. Si liste non vide : retourner un index aleatoire parmi la liste
3. Si liste vide : retourner `null`

Cette fonction est utilisee par :
- `planet.service.ts` (`createHomePlanet`) — injecter `ASSETS_DIR` via le constructeur du service
- `colonize.handler.ts` — importer la fonction utilitaire et passer `env.ASSETS_DIR`

## Fichiers impactes

| Fichier | Modification |
|---------|-------------|
| `packages/db/src/schema/planets.ts` | Ajout champ `planetImageIndex` |
| `apps/api/src/modules/planet/planet.service.ts` | Injection `assetsDir`, attribution image a la creation via utilitaire |
| `apps/api/src/modules/fleet/handlers/colonize.handler.ts` | Attribution image a la colonisation via utilitaire |
| `apps/api/src/lib/planet-image.util.ts` | Nouveau : utilitaire `getRandomPlanetImageIndex` |
| `apps/api/src/modules/admin/asset-upload.route.ts` | Support categorie `planets` avec sous-dossier type + route GET listing |
| `apps/api/src/lib/image-processing.ts` | Gestion nommage par index (au lieu de kebab-id) |
| `apps/api/src/modules/galaxy/galaxy.service.ts` | Exposer `planetClassId` pour tous les joueurs |
| `apps/web/src/lib/assets.ts` | Helper `getPlanetImageUrl(planetClassId, imageIndex, size)` |
| `apps/web/src/pages/Overview.tsx` | Affichage hero planete |
| `apps/web/src/components/layout/TopBar.tsx` | Icone planete dans selecteur + maj interface Planet |
| `apps/web/src/pages/Galaxy.tsx` | Composant PlanetDot SVG anime |
| `apps/admin/src/pages/PlanetTypes.tsx` | Section visuels avec upload |
| `packages/db/src/scripts/assign-planet-images.ts` | Nouveau : script migration data pour planetes existantes |
