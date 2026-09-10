import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { manifest } from './model.js';
import { validateManifest } from '@integration-host/plugin-manifest';
import { install } from './atomic.js';
import type { Store } from '@tomic/lib';
it('rejects a missing provider before touching the store or credentials', async () => {
  await expect(
    install(
      {} as Store,
      'drive',
      '11111111-1111-1111-1111-111111111111',
      undefined as unknown as string,
      'fixture-token',
    ),
  ).rejects.toThrow('provider bundle did not load');
});
it('ships the reproducible bundle that runtime tests execute', () => {
  const built = execFileSync(
    process.env.ESBUILD_BIN ??
      (existsSync('./browser/node_modules/.bin/esbuild')
        ? './browser/node_modules/.bin/esbuild'
        : './browser/node_modules/.pnpm/node_modules/.bin/esbuild'),
    [
      join(import.meta.dirname, 'plugin.ts'),
      '--bundle',
      '--format=esm',
      '--platform=neutral',
      '--target=es2022',
      `--alias:@integration-host/import-records=${join(process.cwd(), 'browser/lib/src/import-records.ts')}`,
      `--alias:@integration-host/plugin-reconcile=${join(process.cwd(), 'browser/lib/src/plugin-reconcile.ts')}`,
      `--alias:@integration-host/plugin-connection=${join(process.cwd(), 'browser/lib/src/plugin-connection.ts')}`,
    ],
    { encoding: 'utf8' },
  );
  const withoutSourcePaths = (value: string) =>
    value.replace(/^\/\/ .*\.(?:ts|js)$/gm, '// generated source');
  expect(
    withoutSourcePaths(readFileSync(join(import.meta.dirname, 'plugin.js'), 'utf8')),
  ).toBe(withoutSourcePaths(built));
});
it('declares POST queries as reads and row updates as journaled writes', () => {
  const m = validateManifest(manifest('11111111-1111-1111-1111-111111111111'));
  expect(
    JSON.parse(
      readFileSync(
        join(import.meta.dirname, 'manifest.fixture.json'),
        'utf8',
      ),
    ),
  ).toEqual(m);
  expect(m.operations.find((o) => o.id === 'query')?.effect).toBe('read');
  expect(m.operations.find((o) => o.id === 'update')?.effect).toBe('write');
});
