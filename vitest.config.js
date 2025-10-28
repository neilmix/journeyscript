// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/browser-automated/**' // Exclude CDP browser tests
    ],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/', 'examples/']
    }
  }
});
