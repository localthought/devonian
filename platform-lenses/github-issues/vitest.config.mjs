import { resolve } from 'node:path';

export default {
  resolve: {
    alias: {
      devonian: process.env.DEVONIAN_PATH
        ? resolve(process.env.DEVONIAN_PATH, 'build/src/main.js')
        : resolve('../../src/main.ts'),
      '@tomic/lib': process.env.ATOMIC_LIB_PATH ?? '@tomic/lib',
      vitest: process.env.VITEST_PATH ?? 'vitest',
    },
  },
  test: { include: ['platform-lenses/github-issues/*.test.*'] },
};
