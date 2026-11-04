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
| `gallery/g-pose-01.jpg` | French blanche · amande longue |
| `gallery/g-pose-02.jpg` | Bordeaux filets d’or · amande longue |
| `gallery/g-pose-03.jpg` | Marbré rosé & feuille d’or · amande longue |
| `gallery/g-pose-04.jpg` | Chrome opale · amande longue |
| `gallery/g-pose-05.jpg` | Nude mat & feuillage · amande longue |
| `gallery/g-pose-06.jpg` | Fleurs sculptées · amande longue |
| `gallery/g-pose-07.jpg` | Baby boomer · amande longue |
| `gallery/g-pose-08.jpg` | Léopard nude & or · amande longue |
| `gallery/g-pose-09.jpg` | Strass & filet d’or · amande longue |
| `gallery/g-pose-10.jpg` | Vieux rose · amande longue |
| `gallery/g-pose-11.jpg` | French noire liseré or · amande longue |
| `gallery/g-pose-12.jpg` | Bordeaux & or · amande longue |

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
