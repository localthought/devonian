import { Console, Effect } from 'effect';
import { MockClient } from '../helpers.js';
import { describe, it, expect } from 'vitest';
import { DevonianIndex } from '../../src/DevonianIndex.js';
import {
  AcmeComprehensiveOrderWithoutId,
  AcmeLinkedOrderWithoutId,
  AcmeCustomerWithoutId,
  AcmeComprehensiveOrder,
  AcmeLinkedOrder,
  AcmeCustomer,
  ExtractEntityBridge,
} from '../../examples/ExtractEntity.js';

describe('ExtractEntity', () => {
  const replicaId = `test-instance`;
  const index = new DevonianIndex();
  const acmeOrderMockClient = new MockClient<
    AcmeComprehensiveOrderWithoutId,
    AcmeComprehensiveOrder
  >('orders');
  const acmeCustomerMockClient = new MockClient<
    AcmeCustomerWithoutId,
    AcmeCustomer
  >('customers');
  const acmeLinkedOrderMockClient = new MockClient<
    AcmeLinkedOrderWithoutId,
    AcmeLinkedOrder
  >('linked orders');
  const bridge = new ExtractEntityBridge(
    index,
    acmeOrderMockClient,
    acmeCustomerMockClient,
    acmeLinkedOrderMockClient,
    replicaId,
  );
  // console.log('Comprehensive is left, Linked is right');
  it('can replicate creations from comprehensive to linked', async () => {
    const divide = (a: number, b: number): Effect.Effect<number, Error> => {
      if (b === 0) {
        return Effect.fail(new Error('Cannot divide by zero'));
      }
      return Effect.succeed(a / b);
    };
    const program = Console.log('Hello, World!', divide(3, 4));
    Effect.runSync(program);
    // console.log('fakeIncoming Anvil');
    acmeOrderMockClient.fakeIncoming({
      id: 0,
      item: 'Anvil',
      quantity: 1,
      shipDate: new Date('2023-02-03T00:00:00Z'),
      customerName: 'Wile E Coyote',
      customerAddress: '123 Desert Station',
      foreignIds: {},
    });
    // console.log('fakeIncoming Dynamite');
    acmeOrderMockClient.fakeIncoming({
      id: 1,
      item: 'Dynamite',
      quantity: 1,
      shipDate: undefined,
      customerName: 'Daffy Duck',
      customerAddress: 'White Rock Lake',
      foreignIds: {},
    });
    // console.log('fakeIncoming Bird Seed');
    acmeOrderMockClient.fakeIncoming({
      id: 2,
      item: 'Bird Seed',
      quantity: 1,
      shipDate: undefined,
      customerName: 'Wile E Coyote',
      customerAddress: '123 Desert Station',
      foreignIds: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(acmeCustomerMockClient.added).toEqual([
      {
        name: 'Wile E Coyote',
        address: '123 Desert Station',
        foreignIds: {
          'devonian-test-instance': 0,
        },
      },
      {
        name: 'Daffy Duck',
        address: 'White Rock Lake',
        foreignIds: {
          'devonian-test-instance': 1,
        },
      },
    ]);
    expect(acmeLinkedOrderMockClient.added.length).toEqual(3);
    expect(acmeLinkedOrderMockClient.added).toEqual([
      {
        item: 'Bird Seed',
        quantity: 1,
        // "shipDate": undefined,
        customerId: 0, // Wile
        foreignIds: {
          comprehensive: '2',
          'devonian-test-instance': 0,
        },
      },
      {
        item: 'Anvil',
        quantity: 1,
        shipDate: '2023-02-03T00:00:00.000Z', // new Date('2023-02-03T00:00:00Z'),
        customerId: 0, // Wile
        foreignIds: {
          comprehensive: '0',
          'devonian-test-instance': 1,
        },
      },
      {
        item: 'Dynamite',
        quantity: 1,
        // "shipDate": undefined, // I guess it's OK to get an explicit value of undefined here
        customerId: 1, // Daffy
        foreignIds: {
          comprehensive: '1',
          'devonian-test-instance': 2,
        },
      },
    ]);
    expect(await bridge.acmeComprehensiveOrderTable.getRows()).toEqual([
      {
        item: 'Anvil',
        quantity: 1,
        shipDate: '2023-02-03T00:00:00.000Z',
        customerName: 'Wile E Coyote',
        customerAddress: '123 Desert Station',
        foreignIds: {
          comprehensive: 0,
        },
      },
      {
        item: 'Dynamite',
        quantity: 1,
        shipDate: undefined,
        customerName: 'Daffy Duck',
        customerAddress: 'White Rock Lake',
        foreignIds: {
          comprehensive: 1,
        },
      },
      {
        item: 'Bird Seed',
        quantity: 1,
        shipDate: undefined,
        customerName: 'Wile E Coyote',
        customerAddress: '123 Desert Station',
        foreignIds: {
          comprehensive: 2,
        },
      },
    ]);
    expect(await bridge.acmeCustomerTable.getRows()).toEqual([
      {
        name: 'Wile E Coyote',
        address: '123 Desert Station',
        foreignIds: {
          linked: 0,
        },
      },
      {
        name: 'Daffy Duck',
        address: 'White Rock Lake',
        foreignIds: {
          linked: 1,
        },
      },
    ]);
    expect(await bridge.acmeLinkedOrderTable.getRows()).toEqual([
      {
        item: 'Bird Seed',
        quantity: 1,
        customerId: 0,
        foreignIds: {
          comprehensive: '2',
          linked: 0,
        },
      },
      {
        item: 'Anvil',
        quantity: 1,
        shipDate: '2023-02-03T00:00:00.000Z',
        customerId: 0,
        foreignIds: {
          comprehensive: '0',
          linked: 1,
        },
      },
      {
        item: 'Dynamite',
        quantity: 1,
        customerId: 1,
        foreignIds: {
          comprehensive: '1',
          linked: 2,
        },
      },
    ]);
    expect(index.ids).toEqual({});
    expect(index.index).toEqual({});
  });

  it('can then replicate an update from linked to comprehensive', async () => {
    acmeLinkedOrderMockClient.fakeIncoming({
      id: 0,
      item: 'Anvil',
      quantity: 5, // was 1 in the previous test, so this should trigger an update
      shipDate: new Date('2023-02-03T00:00:00Z'),
      customerId: 0,
      foreignIds: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(acmeOrderMockClient.added).toEqual([
      {
        // id: undefined,
        item: 'Anvil',
        quantity: 5,
        // shipDate: new Date('2023-02-03T00:00:00Z'),
        shipDate: '2023-02-03T00:00:00.000Z',
        customerName: 'Wile E Coyote',
        customerAddress: '123 Desert Station',
        foreignIds: {
          linked: '0',
          'devonian-test-instance': 3,
        },
      },
    ]);
  });
});
