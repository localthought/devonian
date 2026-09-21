import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileIdMap, InMemoryIdMap } from '../../../src/reflect/id-map.js';

describe('InMemoryIdMap', () => {
  it('links two ends symmetrically and looks them up per kind', () => {
    const map = new InMemoryIdMap();
    map.link('issue', { system: 'a', id: '1' }, { system: 'b', id: '9' });

    expect(map.counterpart('issue', 'a', '1')).toEqual({
      system: 'b',
      id: '9',
    });
    expect(map.counterpart('issue', 'b', '9')).toEqual({
      system: 'a',
      id: '1',
    });
    // Kind-scoped: a comment link is separate from an issue link.
    expect(map.counterpart('comment', 'a', '1')).toBeUndefined();
    expect(map.counterpart('issue', 'a', '2')).toBeUndefined();
  });

  it('deduplicates entries() to one row per linked pair', () => {
    const map = new InMemoryIdMap();
    map.link('issue', { system: 'a', id: '1' }, { system: 'b', id: '9' });
    map.link('comment', { system: 'a', id: '3' }, { system: 'b', id: '7' });
    expect(map.entries()).toHaveLength(2);
  });
});

describe('FileIdMap', () => {
  it('persists links across reopen and writes owner-only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'idmap-'));
    const path = join(dir, 'nested', 'id-map.json');

    const map = await FileIdMap.open(path);
    await map.link('issue', { system: 'a', id: '1' }, { system: 'b', id: '9' });

    // Reopen from disk — the link is still there.
    const reopened = await FileIdMap.open(path);
    expect(reopened.counterpart('issue', 'a', '1')).toEqual({
      system: 'b',
      id: '9',
    });

    // The file is valid JSON of the entries.
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown[];
    expect(parsed).toHaveLength(1);
  });
});
