/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Base path must match the GitHub Pages project URL: https://xuplus.github.io/NutriSwap/
export default defineConfig({
  base: '/NutriSwap/',
  plugins: [preact()],
  test: {
    environment: 'node',
  },
});
