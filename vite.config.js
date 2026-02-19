import { defineConfig } from 'vite';

export default defineConfig({
  base: '/language_study/',
  root: '.',
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
