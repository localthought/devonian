import {
  configDefaults,
  coverageConfigDefaults,
  defineConfig,
} from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      'build/**/*',
      // These exercise the Atomic host and run in atomic-server, whose Vite
      // aliases provide the @integration-host modules and current @tomic/lib.
      'platform-lenses/atomic-integrations/clockify/atomic.test.ts',
      'platform-lenses/atomic-integrations/notion/atomic.live.test.ts',
      'platform-lenses/atomic-integrations/notion/package.test.ts',
      // The GitHub package tests use the same Atomic host contract and remain
      // packaged beside the lens for the consumer test suite.
      'platform-lenses/github-issues/adapter.test.ts',
      'platform-lenses/github-issues/atomic.live.test.ts',
      'platform-lenses/github-issues/automation.test.ts',
      'platform-lenses/github-issues/github.live.test.ts',
    ],
    coverage: {
      provider: 'v8',
      exclude: [...coverageConfigDefaults.exclude, 'build/**/*'],
    },
  },
});
