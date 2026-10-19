import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Release artifacts and isolated checkouts must not become extra suites.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
});
