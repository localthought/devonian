import { describe, expect, it, vi } from 'vitest';
import {
  AtomicConnector,
  AtomicLens,
  AtomicLensOptions,
  AtomicIdentityMap,
  AtomicStore,
  ExternalId,
} from '../../src/main.js';
import {
  atomicOrderLens,
  FlatOrder,
  orderSchema,
  orderVocabulary as v,
} from '../../examples/AtomicExtractEntity.js';

function setup(snapshot?: string): {
  store: AtomicStore;
  ids: AtomicIdentityMap;
  connector: AtomicConnector<FlatOrder>;
  records: Map<ExternalId, FlatOrder>;
  lens: ReturnType<typeof atomicOrderLens>;
} {
  const store = new AtomicStore(orderSchema());
  const ids = new AtomicIdentityMap(store, 'https://example.com/bridge');
  if (snapshot) store.loadJSONAD(snapshot);
  const records = new Map<ExternalId, FlatOrder>();
  const requests = new Map<string, FlatOrder>();
  const connector: AtomicConnector<FlatOrder> = {
    id: (record) => record.id,
    get: vi.fn(async (id) => {
      const record = records.get(id);
      if (!record) throw new Error('missing');
      return structuredClone(record);
    }),
    create: vi.fn(async (record, key) => {
      if (requests.has(key)) return requests.get(key)!;
      const created = { ...record, id: `server-${requests.size}` };
      requests.set(key, created);
      records.set(created.id, created);
      return created;
    }),
    update: vi.fn(async (id, record) => {
      records.set(id, structuredClone(record));
    }),
    delete: vi.fn(async (id) => {
      records.delete(id);
    }),
  };
  return {
    store,
    ids,
    connector,
    records,
    lens: atomicOrderLens(store, ids, connector),
  };
}
const input: FlatOrder = {
  id: 'order-37',
  item: 'Anvil',
  quantity: 1,
  customerId: 'customer-90',
  customerName: 'Wile E. Coyote',
  customerAddress: 'Desert',
  platformNote: 'keep me',
};

describe('Atomic Extract Entity lens', () => {
  it('rejects mismatched stores and invalid scopes before performing connector I/O', () => {
    const { store, ids, connector } = setup();
    const options: AtomicLensOptions<FlatOrder> = {
      store,
      identities: ids,
      connector,
      scope: 'https://example.com/account',
      entity: 'order',
      read: () => ({}),
      write: () => input,
    };
    expect(
      () =>
        new AtomicLens({ ...options, store: new AtomicStore(orderSchema()) }),
    ).toThrow('same store');
    expect(() => new AtomicLens({ ...options, scope: 'relative' })).toThrow();
    expect(() => new AtomicLens({ ...options, entity: '' })).toThrow('entity');
    expect(connector.create).not.toHaveBeenCalled();
  });
  it('imports linked resources, updates both ways, preserves unmapped fields and restores identity', async () => {
    const first = setup();
    const subject = await first.lens.ingest(input);
    expect(first.connector.create).not.toHaveBeenCalled();
    expect(first.connector.update).not.toHaveBeenCalled();
    const customer = first.store.get(subject)![v.customerLink] as string;
    first.store.patch(subject, { set: { [v.note]: 'native-only' } });
    await first.lens.ingest({ ...input, quantity: 2 });
    expect(first.store.get(subject)?.[v.note]).toBe('native-only');
    expect(first.store.all(v.customer)).toHaveLength(1);
    const restored = setup(first.store.toJSONAD());
    restored.records.set(input.id, input);
    restored.store.patch(subject, { set: { [v.quantity]: 3 } });
    restored.store.patch(customer, {
      set: { [v.name]: 'Road Runner' },
      unset: [v.address],
    });
    expect(await restored.lens.publish(subject)).toBe('order-37');
    expect(restored.connector.create).not.toHaveBeenCalled();
    expect(restored.records.get(input.id)).toEqual({
      id: 'order-37',
      item: 'Anvil',
      quantity: 3,
      customerId: 'customer-90',
      customerName: 'Road Runner',
      platformNote: 'keep me',
    });
    expect(await restored.lens.ingest(restored.records.get(input.id)!)).toBe(
      subject,
    );
    expect(restored.store.all(v.order)).toHaveLength(1);
  });

  it('keeps distinct identical orders and shares customers only through explicit customer identity', async () => {
    const { lens, store } = setup();
    const a = await lens.ingest(input);
    const b = await lens.ingest({ ...input, id: 'order-38' });
    const c = await lens.ingest({
      ...input,
      id: 'order-39',
      customerId: 'customer-91',
    });
    expect(a).not.toBe(b);
    expect(store.get(a)?.[v.customerLink]).toBe(store.get(b)?.[v.customerLink]);
    expect(store.get(c)?.[v.customerLink]).not.toBe(
      store.get(a)?.[v.customerLink],
    );
    expect(store.all(v.order)).toHaveLength(3);
    expect(store.all(v.customer)).toHaveLength(2);
  });

  it('rejects invalid projections without changing related resources and recovers the queue', async () => {
    const { lens, store } = setup();
    const subject = await lens.ingest(input);
    const before = store.toJSONAD();
    await expect(
      lens.ingest({ ...input, quantity: 1.5, customerName: 'invalid update' }),
    ).rejects.toThrow();
    expect(store.toJSONAD()).toBe(before);
    await lens.ingest({ ...input, quantity: 2 });
    expect(store.get(subject)?.[v.quantity]).toBe(2);
  });

  it('awaits connector errors and permits retries without duplicate creates', async () => {
    const { lens, store, connector } = setup();
    const imported = await lens.ingest(input);
    const subject = 'https://example.com/new-order';
    store.put({ ...store.get(imported)!, '@id': subject });
    const create = vi.mocked(connector.create).getMockImplementation()!;
    vi.mocked(connector.create).mockImplementationOnce(async (record, key) => {
      await create(record, key);
      throw new Error('response lost');
    });
    await expect(lens.publish(subject)).rejects.toThrow('response lost');
    const [a, b] = await Promise.all([
      lens.publish(subject),
      lens.publish(subject),
    ]);
    expect(a).toBe('server-0');
    expect(b).toBe(a);
    expect(connector.create).toHaveBeenCalledTimes(2);
    expect(connector.update).toHaveBeenCalledTimes(1);
  });

  it('propagates deletion explicitly and retains native state after failed external deletion', async () => {
    const { lens, store, connector, records } = setup();
    records.set(input.id, input);
    const subject = await lens.ingest(input);
    vi.mocked(connector.delete).mockRejectedValueOnce(new Error('offline'));
    await expect(lens.delete(subject)).rejects.toThrow('offline');
    expect(store.get(subject)).toBeDefined();
    await lens.delete(subject);
    expect(store.get(subject)).toBeUndefined();
    expect(records.has(input.id)).toBe(false);
    expect(await lens.ingest(input)).toBe(subject);
    await lens.ingestDelete(input.id);
    expect(store.get(subject)).toBeUndefined();
    expect(connector.delete).toHaveBeenCalledTimes(2);
  });
});
