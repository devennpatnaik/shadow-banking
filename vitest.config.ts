import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'simulator/test/**/*.test.ts'],
    environment: 'node',
    reporters: process.env['CI'] ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'coverage/junit.xml' },
  },
});
