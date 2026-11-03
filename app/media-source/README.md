# Visuels — système de médias NOVIA

Les visuels se déposent ici, puis une commande les prépare pour le téléphone. **Remplacer un visuel ne demande aucune modification de code.**

```bash
cd app
npm run media    # génère public/media/ et src/media/manifest.generated.json
npm run build    # ou relancer npm run dev
```

## Emplacements

| Fichier à déposer | Rôle |
|---|---|
| `hero/hero.jpg` | Photo d'accueil plein écran (scène de fond) |
| `hero/hero-cutout.png` | La même photo, **main / sujet détouré sur fond transparent**, exactement au même cadrage et à la même taille que `hero.jpg` (plan de profondeur du Hero) |
| `gallery/g-pose-01.jpg` | Pose complète laiteuse · amande longue |
| `gallery/g-french-01.jpg` | French fine · amande moyenne |
| `gallery/g-nude-01.jpg` | Nude rosé · ovale courte |
| `gallery/g-art-01.jpg` | Ligne graphique · carrée moyenne |
| `gallery/g-gel-01.jpg` | Gel bordeaux · ballerine longue |
| `gallery/g-semi-01.jpg` | Semi-permanent rouge · squoval courte |
| `gallery/g-french-02.jpg` | French colorée · carrée courte |
| `gallery/g-art-02.jpg` | Chrome perlé · stiletto longue |
| `gallery/g-pose-02.jpg` | Pose sculptée · ballerine moyenne |
| `gallery/g-nude-02.jpg` | Nude baby boomer · amande moyenne |
| `gallery/g-gel-02.jpg` | Gel transparent · ovale moyenne |
| `gallery/g-semi-02.jpg` | Semi-permanent caramel · ovale courte |

Formats acceptés : JPEG, PNG, WebP, AVIF, TIFF. Le nom du fichier (sans extension) doit être exactement l'identifiant. Titres, catégories, formes et longueurs se modifient dans `src/config/content.demo.ts`.

Sans photo d'accueil, l'accueil utilise `g-pose-01`. Sans visuel du tout, un emplacement « Visuel à fournir » s'affiche.

## Recommandations

- Galerie : portrait 3:4, 2000 px de haut ou plus, même lumière et même fond sur les 12 images, faible profondeur de champ.
- Hero : portrait 3:4 ou plus haut (9:16 idéal), 3000 px de haut ou plus, sujet net, fond qui se prête au flou.
- Hero détouré : PNG avec transparence, mêmes dimensions que `hero.jpg`, bords propres autour des doigts et des ongles.

## Réglages : `media.json`

```json
{
  "provenance": "fictif",
  "provenanceNote": "Visuels fictifs créés pour la démonstration NOVIA. Ce ne sont pas des réalisations du salon.",
  "items": {
    "hero": { "focal": [0.5, 0.45] },
    "g-art-02": { "focal": [0.4, 0.3], "provenance": "reel", "credit": "…" }
  }
}
```

- `provenance` : `fictif` tant que les visuels ne sont pas des réalisations réelles du salon. L'app affiche alors « Visuel fictif » et la mention ci-dessus. Passer à `reel` uniquement pour de vraies réalisations dont les droits sont vérifiés.
- `focal` : point important de l'image, de 0 à 1 (`[0.5, 0.5]` = centre). Il garde les ongles dans le cadre quel que soit l'écran.
- Un réglage par visuel (`items`) l'emporte sur le réglage global.

## Ce que produit `npm run media`

Pour chaque visuel : AVIF, WebP et JPEG (PNG si détouré) en 480, 960 et 1600 px de large au maximum, la couleur dominante et un aperçu flou intégré au manifeste. Les fichiers générés portent une empreinte du contenu : un visuel remplacé n'est jamais servi depuis un ancien cache. Les fichiers qui ne correspondent plus à aucun visuel sont supprimés.
