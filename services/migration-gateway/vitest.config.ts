import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Testfilerna delar samma fysiska Postgres och rensar tabeller i
    // beforeEach — samma race som upptäcktes i nimloth-legacy-sim.
    fileParallelism: false,
  },
});
