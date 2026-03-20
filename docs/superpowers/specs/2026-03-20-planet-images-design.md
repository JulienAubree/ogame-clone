# Planet Images Design

## Objectif

Attribuer un visuel aleatoire a chaque planete lors de sa creation/colonisation, en fonction de son type (`planetClassId`). Le visuel est fixe une fois attribue. L'admin peut uploader de nouvelles images dans le pool de chaque type.

## Schema DB

- Ajout d'un champ `planetImageIndex` (smallint, nullable) a la table `planets`
- A la creation d'une planete, on compte les images disponibles pour le type dans `/assets/planets/{planetClassId}/`, on tire un index aleatoire (1..N), et on le stocke
- Si aucune image n'existe pour le type, `planetImageIndex` reste `null` et le fallback (avatar initiale) s'affiche

### Migration des planetes existantes

- Script/migration qui attribue un `planetImageIndex` aleatoire a chaque planete existante ayant `planetImageIndex IS NULL`
- L'index est choisi parmi les images disponibles pour le `planetClassId` de la planete
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

## Upload admin

Sur la page PlanetTypes existante dans l'admin, ajout d'une section "Visuels" par type de planete :
- Affiche les images existantes du pool (grille de thumbnails)
- Bouton "Ajouter un visuel" qui uploade une nouvelle image
- L'index est attribue automatiquement (prochain nombre disponible)
- Endpoint : `POST /admin/upload-asset` existant, etendu pour supporter la categorie `planets` avec un sous-dossier par type

### Comptage des images disponibles

- Nouvel endpoint API `GET /admin/planet-images/:planetClassId` qui liste les images disponibles pour un type (en scannant le dossier)
- Cote API, pour l'attribution a la creation : scan du dossier `/assets/planets/{planetClassId}/` pour compter les fichiers `*.webp` sans suffixe (exclure `-thumb`, `-icon`)

## Affichage

### Page Overview (hero)

- Image hero en grand dans le header de la page
- Chemin : `/assets/planets/{planetClassId}/{planetImageIndex}.webp`
- Fallback : avatar initiale existante (premiere lettre du nom de la planete sur fond colore)

### Selecteur de planete (TopBar)

- Icone 64x64 a cote du nom de la planete
- Chemin : `/assets/planets/{planetClassId}/{planetImageIndex}-icon.webp`
- Meme fallback

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

Animation CSS : rotation lente du gradient radial via `@keyframes` pour donner l'illusion que la planete tourne. Performant (CSS uniquement, pas de JS).

## API

### Donnees planete

Les endpoints qui retournent des donnees de planete doivent inclure `planetClassId` et `planetImageIndex` dans la reponse (deja le cas pour `planetClassId`, ajouter `planetImageIndex`).

### Attribution a la creation

Dans `planet.service.ts` (`createHomePlanet` et futur handler de colonisation) :
1. Scanner `/assets/planets/{planetClassId}/` pour compter les images hero (fichiers `N.webp` sans suffixe)
2. Si count > 0 : `planetImageIndex = random(1..count)`
3. Si count === 0 : `planetImageIndex = null`

## Fichiers impactes

| Fichier | Modification |
|---------|-------------|
| `packages/db/src/schema/planets.ts` | Ajout champ `planetImageIndex` |
| `apps/api/src/modules/planet/planet.service.ts` | Attribution image a la creation |
| `apps/api/src/modules/admin/asset-upload.route.ts` | Support categorie `planets` avec sous-dossier type |
| `apps/api/src/lib/image-processing.ts` | Gestion nommage par index (au lieu de kebab-id) |
| `apps/web/src/lib/assets.ts` | Helper pour URL planete |
| `apps/web/src/pages/Overview.tsx` | Affichage hero planete |
| `apps/web/src/components/layout/TopBar.tsx` | Icone planete dans selecteur |
| `apps/web/src/pages/Galaxy.tsx` | Composant PlanetDot SVG anime |
| `apps/admin/src/pages/PlanetTypes.tsx` | Section visuels avec upload |
