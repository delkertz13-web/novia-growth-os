#!/usr/bin/env node
/**
 * Pipeline médias NOVIA — `npm run media`
 *
 * Lit les visuels déposés dans media-source/{hero,gallery}/ et produit :
 *  - public/media/<id>.<hash>-<largeur>.{avif,webp,jpg|png}  (3 tailles max)
 *  - src/media/manifest.generated.json  (dimensions, point focal, couleur dominante,
 *    aperçu flou en ligne, provenance)
 *
 * Remplacer un visuel = déposer un fichier du même nom puis relancer la commande.
 * Aucune modification de code n'est nécessaire. Les réglages (point focal, provenance)
 * se font dans media-source/media.json.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'media-source')
const OUT = join(ROOT, 'public', 'media')
const MANIFEST = join(ROOT, 'src', 'media', 'manifest.generated.json')
const GROUPS = ['hero', 'gallery']
const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'])
const WIDTHS = [480, 960, 1600]
const PIPELINE_VERSION = 1

/** Budgets (octets) : un dépassement affiche un avertissement, sans bloquer. */
const BUDGET = { hero: 180_000, gallery: 120_000 }
/** Hauteur minimale conseillée de l'original. */
const MIN_HEIGHT = { hero: 1600, gallery: 1600 }

const settings = JSON.parse(await readFile(join(SRC, 'media.json'), 'utf8'))
const defaultProvenance = settings.provenance === 'reel' ? 'reel' : 'fictif'

const assets = {}
const keep = new Set(['.gitkeep'])
const warnings = []
const rows = []

for (const group of GROUPS) {
  const dir = join(SRC, group)
  if (!existsSync(dir)) continue
  const files = (await readdir(dir)).filter((f) => INPUT_EXT.has(extname(f).toLowerCase())).sort()
  for (const file of files) {
    const id = basename(file, extname(file))
    if (assets[id]) throw new Error(`Identifiant en double : « ${id} » (${group}/${file})`)
    const input = await readFile(join(dir, file))
    const { data, info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true })
    const img = sharp(data)
    const stats = await img.stats()
    const alpha = info.channels === 4 && !stats.isOpaque
    const opts = settings.items?.[id] ?? {}
    const hash = createHash('sha1').update(input).update(String(PIPELINE_VERSION)).digest('hex').slice(0, 8)

    const widths = [...new Set(WIDTHS.filter((w) => w < info.width).concat(Math.min(info.width, WIDTHS.at(-1))))].sort((a, b) => a - b)
    const fallback = alpha ? 'png' : 'jpg'
    let largestAvif = 0
    for (const w of widths) {
      const base = sharp(data).resize({ width: w, withoutEnlargement: true })
      const outputs = {
        avif: base.clone().avif({ quality: 52, effort: 5 }),
        webp: base.clone().webp({ quality: 78, alphaQuality: 90 }),
        [fallback]: alpha ? base.clone().png({ compressionLevel: 9, palette: false }) : base.clone().jpeg({ quality: 80, mozjpeg: true }),
      }
      for (const [ext, pipe] of Object.entries(outputs)) {
        const name = `${id}.${hash}-${w}.${ext}`
        keep.add(name)
        const target = join(OUT, name)
        if (!existsSync(target)) await pipe.toFile(target)
        if (ext === 'avif') largestAvif = Math.max(largestAvif, (await readFile(target)).length)
      }
    }

    const lqipBuf = await sharp(data).resize({ width: 24 }).webp({ quality: 40, alphaQuality: 40 }).toBuffer()
    const { r, g, b } = stats.dominant
    const tone = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

    assets[id] = {
      id,
      group,
      width: info.width,
      height: info.height,
      alpha,
      hash,
      widths,
      fallback,
      focal: Array.isArray(opts.focal) ? opts.focal : [0.5, 0.5],
      tone,
      lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
      provenance: opts.provenance === 'reel' || opts.provenance === 'fictif' ? opts.provenance : defaultProvenance,
      ...(opts.credit ? { credit: opts.credit } : {}),
    }

    const budget = group === 'hero' ? BUDGET.hero : BUDGET.gallery
    // Le plus grand AVIF (1600 px) ne devrait pas dépasser ~1,6 × le budget fixé pour la taille téléphone.
    if (largestAvif > budget * 1.6) warnings.push(`${id} : AVIF le plus grand ${(largestAvif / 1000).toFixed(0)} Ko (vérifier la compression)`)
    if (info.height < MIN_HEIGHT[group] && !alpha) warnings.push(`${id} : original de ${info.height} px de haut (conseillé : ${MIN_HEIGHT[group]} px ou plus)`)
    rows.push(`${group.padEnd(8)} ${id.padEnd(16)} ${String(info.width).padStart(5)}×${String(info.height).padEnd(5)} ${alpha ? 'détouré ' : '        '} ${widths.join('/')} px  ${(largestAvif / 1000).toFixed(0)} Ko AVIF max`)
  }
}

// Supprime les fichiers générés qui ne correspondent plus à un visuel source.
await mkdir(OUT, { recursive: true })
for (const f of await readdir(OUT)) if (!keep.has(f)) await rm(join(OUT, f))

const manifest = {
  version: PIPELINE_VERSION,
  provenance: { default: defaultProvenance, note: String(settings.provenanceNote ?? '') },
  assets: Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b))),
}
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')

console.log(rows.length ? rows.join('\n') : 'Aucun visuel trouvé dans media-source/hero ni media-source/gallery.')
console.log(`\n${rows.length} visuel(s) · provenance par défaut : ${defaultProvenance}`)
if (warnings.length) console.warn(`\nAvertissements :\n- ${warnings.join('\n- ')}`)
