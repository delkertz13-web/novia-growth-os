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
      // Préchargé seulement sur l'accueil : ailleurs, l'image du Hero n'est pas affichée.
      const attrs = { rel: 'preload', as: 'image', type: 'image/avif', imageSrcset: set, imageSizes: '100vw', fetchPriority: 'high' }
      return [
        {
          tag: 'script',
          children: `if(location.pathname==='/'){var l=document.createElement('link');Object.assign(l,${JSON.stringify(attrs)});document.head.appendChild(l)}`,
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
