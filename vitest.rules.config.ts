import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * The Firestore rules tests talk to the emulator, so they run in a plain
 * Node environment and are kept out of the normal unit test run.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/rules/**/*.{test,spec}.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
