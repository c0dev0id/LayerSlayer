import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path.
  base: './',
  plugins: [solid()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
  },
});
