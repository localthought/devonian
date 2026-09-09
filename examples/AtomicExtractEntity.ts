import {
  AtomicConnector,
  AtomicProjection,
  AtomicIdentityMap,
  AtomicLens,
  AtomicSchema,
  AtomicStore,
  Datatype,
  IS_A,
} from '../src/main.js';

// Example application vocabulary. Production deployments must publish their definitions.
export const orderVocabulary = {
  order: 'https://example.com/classes/Order',
  customer: 'https://example.com/classes/Customer',
  item: 'https://example.com/properties/item',
  quantity: 'https://example.com/properties/quantity',
  customerLink: 'https://example.com/properties/customer',
  name: 'https://example.com/properties/name',
  address: 'https://example.com/properties/address',
  note: 'https://example.com/properties/note',
};

export interface FlatOrder {
  id: string;
  item: string;
  quantity: number;
  customerId: string;
  customerName: string;
  customerAddress?: string;
  platformNote?: string;
}

export function orderSchema(): AtomicSchema {
  const v = orderVocabulary;
  return new AtomicSchema()
    .property(v.item, Datatype.STRING)
    .property(v.quantity, Datatype.INTEGER)
    .property(v.customerLink, Datatype.ATOMIC_URL)
    .property(v.name, Datatype.STRING)
    .property(v.address, Datatype.STRING)
    .property(v.note, Datatype.STRING);
}

/** Flattened platform orders <-> native linked Order and Customer resources. */
export function atomicOrderLens(
  store: AtomicStore,
  identities: AtomicIdentityMap,
  connector: AtomicConnector<FlatOrder>,
): AtomicLens<FlatOrder> {
  const v = orderVocabulary;
  const scope = 'https://example.com/accounts/acme';
  const customerScope = { scope, entity: 'customer' };
  return new AtomicLens({
    store,
    identities,
    connector,
    scope,
    entity: 'order',
    read: (input): AtomicProjection => {
      const customer = identities.subjectFor(customerScope, input.customerId);
      return {
        set: {
          [IS_A]: [v.order],
          [v.item]: input.item,
          [v.quantity]: input.quantity,
          [v.customerLink]: customer,
        },
        identities: [
          { scope: customerScope, id: input.customerId, subject: customer },
        ],
        related: [
          {
            subject: customer,
            patch: {
              set: {
                [IS_A]: [v.customer],
                [v.name]: input.customerName,
                ...(input.customerAddress === undefined
                  ? {}
                  : { [v.address]: input.customerAddress }),
              },
              unset: input.customerAddress === undefined ? [v.address] : [],
            },
          },
        ],
      };
    },
    write: (resource, previous): FlatOrder => {
      const customerSubject = resource[v.customerLink];
      if (typeof customerSubject !== 'string')
        throw new Error('Order requires a customer link');
      const customer = store.get(customerSubject);
      if (!customer) throw new Error(`Missing customer: ${customerSubject}`);
      const customerId = identities.externalId(customerScope, customerSubject);
      const item = resource[v.item];
      const quantity = resource[v.quantity];
      const customerName = customer[v.name];
      const address = customer[v.address];
      if (
        customerId === undefined ||
        typeof item !== 'string' ||
        typeof quantity !== 'number' ||
        typeof customerName !== 'string'
      ) {
        throw new Error(
          'Missing required order fields or external customer identity',
        );
      }
      const output: FlatOrder = {
        ...previous,
        id: previous?.id ?? '',
        item,
        quantity,
        customerId: String(customerId),
        customerName,
      };
      if (typeof address === 'string') output.customerAddress = address;
      else delete output.customerAddress;
      return output;
    },
  });
}
