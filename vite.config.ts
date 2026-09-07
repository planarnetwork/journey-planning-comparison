import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Where the site is served from on GitHub Pages. The dev server serves from the root. */
const BASE = '/journey-planning-comparison/';

export default defineConfig(({ command, isPreview }) => ({
  // Preview serves the built output, which has the deployed base baked into it.
  base: command === 'build' || isPreview ? BASE : '/',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
  // The planner and the feed reader both run in module workers.
  worker: { format: 'es' },
  test: {
    // Engine tests run in node. Component tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
}));
