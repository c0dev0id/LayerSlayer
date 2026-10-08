import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { iconSets } from './tools/iconSets.ts';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path.
  base: './',
  plugins: [solid(), iconSets()],
  build: {
    target: 'es2022',
    // MapLibre alone is about 1 MB minified; the PDF libraries are split off and load on import.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    // The library check reads live services and runs by hand (npm run check-library).
    dir: 'src',
  },
});
