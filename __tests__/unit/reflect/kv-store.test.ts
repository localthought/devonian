import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileKvStore, InMemoryKvStore } from '../../../src/reflect/kv-store.js';

describe('InMemoryKvStore', () => {
  it('gets undefined for an unset key', () => {
    expect(new InMemoryKvStore().get('missing')).toBeUndefined();
  });

  it('sets and gets a value', () => {
    const store = new InMemoryKvStore();
    store.set('key', 'value');
    expect(store.get('key')).toBe('value');
  });

  it('overwrites an existing value', () => {
    const store = new InMemoryKvStore();
    store.set('key', 'first');
    store.set('key', 'second');
    expect(store.get('key')).toBe('second');
  });
});

describe('FileKvStore', () => {
  it('persists values across reopen and writes owner-only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kvstore-'));
    const path = join(dir, 'nested', 'state.json');

    const store = await FileKvStore.open(path);
    await store.set('pair-a|pair-b', 'closed');

    const reopened = await FileKvStore.open(path);
    expect(reopened.get('pair-a|pair-b')).toBe('closed');

    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<
      string,
      string
    >;
    expect(parsed).toEqual({ 'pair-a|pair-b': 'closed' });
  });

  it('starts empty when no file exists yet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kvstore-'));
    const store = await FileKvStore.open(join(dir, 'state.json'));
    expect(store.get('anything')).toBeUndefined();
  });
});
