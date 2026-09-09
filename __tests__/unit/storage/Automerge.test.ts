import { describe, it, expect } from 'vitest';
import { ModelWithoutId } from '../../helpers.js';
import { AutomergeStorage } from '../../../src/storage/Automerge.js';
import { IndexedStorage } from '../../../src/storage/IndexedStorage.js';
import { AcmeCustomerWithoutId } from '../../../examples/ExtractEntity.js';
import { Repo } from '@automerge/automerge-repo';
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import { NodeFSStorageAdapter } from '@automerge/automerge-repo-storage-nodefs';

describe('set, get, findObject', () => {
  const repo = new Repo({
    network: [new BroadcastChannelNetworkAdapter()],
    storage: new NodeFSStorageAdapter('./data'),
  });
  const docHandle = repo.create<ModelWithoutId[]>();
  const storage = new IndexedStorage<ModelWithoutId>(
    'storage-id',
    new AutomergeStorage<ModelWithoutId>(docHandle),
  );

  it('can store rows', async () => {
    // console.log('1');
    const foo = { foo: 'bar', foreignIds: {} };
    // console.log('2');
    await storage.set(3, foo);
    // console.log('3');
    expect(await storage.get(3)).toEqual(foo);
    // console.log('4');
    expect(await storage.findObject(foo)).toEqual(3);
    // console.log('5');
  });
});

describe('upsert', () => {
  it('can insert and find', async () => {
    const repo = new Repo({
      network: [new BroadcastChannelNetworkAdapter()],
      storage: new NodeFSStorageAdapter('./data'),
    });
    const docHandle = repo.create<AcmeCustomerWithoutId[]>();
    const storage = new IndexedStorage<AcmeCustomerWithoutId>(
      'storage-id',
      new AutomergeStorage<AcmeCustomerWithoutId>(docHandle),
    );
    const wile = {
      name: 'Wile E Coyote',
      address: '123 Desert Station',
      foreignIds: {},
    };
    const daffy = {
      name: 'Daffy Duck',
      address: 'White Rock Lake',
      foreignIds: { 'devonian-test-instance': 1 },
    };
    const positions = await Promise.all([
      storage.ensureRow(wile, ['foreignIds']),
      storage.ensureRow(daffy, ['foreignIds']),
      storage.ensureRow(wile, ['foreignIds']),
    ]);
    expect(positions).toEqual([
      {
        minted: true,
        position: 0,
      },
      {
        minted: true,
        position: 1,
      },
      {
        minted: false,
        position: 0,
      },
    ]);
  });
});
