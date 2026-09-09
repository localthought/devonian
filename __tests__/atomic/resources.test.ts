import { JSONADParser } from '@tomic/lib';
import { describe, expect, it } from 'vitest';
import {
  AtomicIdentityMap,
  AtomicResource,
  AtomicSchema,
  AtomicStore,
  Datatype,
  identity,
  IS_A,
} from '../../src/main.js';

const name = 'https://example.com/name';
const link = 'https://example.com/link';
const count = 'https://example.com/count';
const a = 'https://example.com/a';
const b = 'https://example.com/b';
function setup(): AtomicStore {
  return new AtomicStore(
    new AtomicSchema()
      .property(name, Datatype.STRING)
      .property(link, Datatype.ATOMIC_URL)
      .property(count, Datatype.INTEGER),
  );
}

describe('AtomicStore', () => {
  it('addresses identical content by subject, preserves omitted fields and removes explicitly', () => {
    const store = setup();
    store.put({ '@id': a, [name]: 'same', [count]: 1 });
    store.put({ '@id': b, [name]: 'same', [count]: 1 });
    store.patch(a, { set: { [name]: 'changed' } });
    expect(store.all()).toHaveLength(2);
    expect(store.get(a)?.[count]).toBe(1);
    expect(store.get(b)?.[name]).toBe('same');
    store.patch(a, { unset: [count] });
    expect(store.get(a)).not.toHaveProperty(count);
  });

  it('round trips linked and nested resources without leaking mutable references', () => {
    const store = setup();
    const original = { '@id': a, [link]: { [name]: 'nested' }, [IS_A]: [b] };
    store.put(original);
    original[link][name] = 'mutated';
    const copy = store.get(a)!;
    (copy[link] as Record<string, string>)[name] = 'also mutated';
    const [parsed] = new JSONADParser().parseArray(JSON.parse(store.toJSONAD()));
    expect(parsed).toHaveLength(1);
    const restored = setup();
    restored.loadJSONAD(store.toJSONAD());
    expect(restored.get(a)?.[link]).toEqual({ [name]: 'nested' });
    expect(restored.all(b)).toHaveLength(1);
  });

  it.each([
    { '@id': 'https://example.com/has space', [name]: 'x' },
    { '@id': 'relative', [name]: 'x' },
    { '@id': a, name: 'x' },
    { '@id': a, [name]: 12 },
    { '@id': a, [count]: 1.2 },
    { '@id': a, [count]: NaN },
    { '@id': a, [count]: Infinity },
    { '@id': a, [link]: 'relative' },
    { '@id': a, [link]: { '@id': b } },
    { '@id': a, [IS_A]: [12] },
    { '@id': a, [name]: undefined },
    { '@id': a, [name]: null },
  ])('rejects invalid resource %#', (resource) => {
    expect(() => setup().put(resource as AtomicResource)).toThrow();
  });

  it('validates boolean, float and timestamp values', () => {
    for (const datatype of [
      Datatype.BOOLEAN,
      Datatype.FLOAT,
      Datatype.TIMESTAMP,
    ]) {
      const store = new AtomicStore(
        new AtomicSchema().property(name, datatype),
      );
      expect(() => store.put({ '@id': a, [name]: 'invalid' })).toThrow();
    }
  });

  it('leaves existing state intact on malformed or duplicate snapshots and invalid batches', () => {
    const store = setup();
    store.put({ '@id': a, [name]: 'original' });
    for (const json of [
      'null',
      '{}',
      '[1]',
      '[{"@id":"https://example.com/a"},{"@id":"https://example.com/a"}]',
    ]) {
      expect(() => store.loadJSONAD(json)).toThrow();
      expect(store.get(a)?.[name]).toBe('original');
    }
    expect(() =>
      store.apply([
        { subject: a, patch: { set: { [name]: 'changed' } } },
        { subject: b, patch: { set: { [count]: 'invalid' } } },
      ]),
    ).toThrow();
    expect(store.get(a)?.[name]).toBe('original');
    expect(() => store.patch(a, { set: { '@id': b } })).toThrow();
  });
});

describe('AtomicIdentityMap', () => {
  it('scopes identities by account, entity and ID type and restores them from JSON-AD', () => {
    const store = setup();
    const ids = new AtomicIdentityMap(store, 'https://example.com/bridge');
    const scopes = [
      { scope: 'https://example.com/repo1', entity: 'issue' },
      { scope: 'https://example.com/repo2', entity: 'issue' },
      { scope: 'https://example.com/repo1', entity: 'comment' },
    ];
    scopes.forEach((scope, index) => ids.bind(scope, 15, `${a}/${index}`));
    ids.bind(scopes[0], '15', b);
    const restored = setup();
    const restoredIds = new AtomicIdentityMap(
      restored,
      'https://example.com/another-bridge',
    );
    restored.loadJSONAD(store.toJSONAD());
    expect(restoredIds.lookup(scopes[0], 15)).toBe(`${a}/0`);
    expect(restoredIds.lookup(scopes[0], '15')).toBe(b);
    expect(restoredIds.lookup(scopes[1], 15)).toBe(`${a}/1`);
    expect(restoredIds.lookup(scopes[2], 15)).toBe(`${a}/2`);
    expect(restoredIds.externalId(scopes[0], b)).toBe('15');
    expect(restoredIds.externalId(scopes[0], `${a}/0`)).toBe(15);
    restoredIds.bind(scopes[0], 15, `${a}/0`);
    expect(restored.all(identity.class)).toHaveLength(4);
  });

  it('rejects conflicting bindings and unsafe identifiers', () => {
    const store = setup();
    const ids = new AtomicIdentityMap(store, 'https://example.com/bridge');
    const scope = { scope: a, entity: 'issue' };
    ids.bind(scope, 1, a);
    expect(() => ids.bind(scope, 1, b)).toThrow('Conflicting');
    expect(() => ids.bind(scope, 2, a)).toThrow('Conflicting');
    expect(() => ids.bind(scope, Number.MAX_SAFE_INTEGER + 1, b)).toThrow();
    expect(() => ids.bind(scope, '', b)).toThrow();
  });
});
