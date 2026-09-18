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
      // These GitHub package tests exercise the Atomic host contract and run
      // in the consuming application, which provides the host dependencies.
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
