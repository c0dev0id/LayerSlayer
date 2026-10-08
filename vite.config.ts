import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { iconSets } from './tools/iconSets.ts';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path.
  base: './',
  plugins: [solid(), iconSets()],
  build: {
    target: 'es2022',
    // MapLibre alone is about 1 MB minified; the PDF libraries are split off and load on import,
    // and the Material Design Icons (about 2.9 MB, 0.8 MB gzipped) load with the icon picker.
    chunkSizeWarningLimit: 3000,
  },
  test: {
    environment: 'jsdom',
    // The library check reads live services and runs by hand (npm run check-library).
    dir: 'src',
  },
});
