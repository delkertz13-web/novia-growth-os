import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import manifest from './src/media/manifest.generated.json'
import type { MediaManifest } from './src/media/types'

/**
 * Précharge la photo du Hero (AVIF) dès le HTML pour accélérer le premier affichage.
 * Lit le manifeste produit par `npm run media` (relancer `npm run dev` après l'avoir régénéré) ;
 * sans photo d'accueil, rien n'est ajouté.
 */
function preloadHero(): Plugin {
  return {
    name: 'novia-preload-hero',
    transformIndexHtml() {
      const assets = (manifest as unknown as MediaManifest).assets
      const a = assets.hero ?? assets['g-pose-01']
      if (!a) return []
      const set = a.widths.map((w) => `/media/${a.id}.${a.hash}-${w}.avif ${w}w`).join(', ')
      return [
        {
          tag: 'link',
          attrs: { rel: 'preload', as: 'image', type: 'image/avif', imagesrcset: set, imagesizes: '100vw', fetchpriority: 'high' },
          injectTo: 'head',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadHero()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
