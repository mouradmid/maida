import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests parlent à une vraie base Postgres (Neon) : depuis les serveurs
    // de CI, la latence réseau dépasse parfois les 5 s par défaut.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
