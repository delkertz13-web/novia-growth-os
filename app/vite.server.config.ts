/**
 * Build du SERVEUR pilote (Node 22) : API, ordonnanceur, migrations, CLI d'exploitation.
 * Le code du moteur (src/engine, src/core, src/config) est intégré ; les dépendances
 * npm (pg, @simplewebauthn/server) restent des modules installés.
 */
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'dist-server',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { main: 'server/main.ts', cli: 'server/cli.ts' },
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
})
