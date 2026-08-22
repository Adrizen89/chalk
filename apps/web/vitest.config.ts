import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // IndexedDB n'existe pas dans Node : fake-indexeddb en fournit une
    // implémentation conforme, ce qui permet de tester les migrations de
    // schéma exigées par #18.
    setupFiles: ['test/setup.ts'],
    environment: 'node',
  },
})
