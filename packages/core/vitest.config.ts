import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // §4.2 : le moteur est le socle de tous les modes de jeu, il doit rester très couvert.
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
