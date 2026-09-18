# Native Atomic Data API

Devonian's resource API stores Atomic Data directly: named resources have an `@id` subject URL, property keys are URLs, and values are checked against a local property catalog. Platform objects exist at connector boundaries. The original `DevonianTable`, `DevonianLens`, and numeric row storage APIs remain compatible and are not automatically migrated.

## Resource storage

```ts
import { AtomicSchema, AtomicStore, Datatype } from 'devonian';

const title = 'https://example.com/properties/title';
const schema = new AtomicSchema().property(title, Datatype.STRING);
const store = new AtomicStore(schema);
const subject = 'https://example.com/issues/first';

store.put({ '@id': subject, [title]: 'First issue' });
store.patch(subject, { set: { [title]: 'Updated issue' } });
const resource = store.get(subject);
store.patch(subject, { unset: [title] });
```

`put` replaces a complete resource. `patch` preserves properties omitted from `set`; `unset` removes properties explicitly. Neither can change a subject's identity. `get` and `all` return independent copies. `all(classURL)` filters on Atomic Data's `isA` property. Equal content never implies equal identity.

`apply([{ subject, patch }, ...])` validates and applies related resource changes as a local transaction. A validation failure leaves all resources untouched. `transaction(callback)` groups synchronous store and identity operations with rollback; the callback must not be async or launch asynchronous work.

`AtomicSchema` is an offline property catalog. Define every property before importing data; unknown properties are rejected. It uses `@tomic/lib` datatype validation, with additional primitive, finite-number and link checks. This release supports the SDK's string, markdown, slug, boolean, integer, float, date, timestamp, atomicURL and resourceArray types. Links may be HTTP(S) URLs or DID identifiers or nested resources with property URL keys and no `@id`. Named resources are permitted at the JSON-AD document root or in its root array.

This is a deliberately bounded JSON-AD profile: HTTP(S) or DID subjects, explicitly registered datatypes, no arbitrary JSON or Yjs datatypes, no automatic remote schema resolution, and no required-property/class-constraint validation. Application lenses must check required fields. Publish your property's Atomic Schema definitions at their URLs for interoperability; declaring a local catalog does not publish them. The example.com vocabulary in examples is illustrative.

## External identities

```ts
import { AtomicIdentityMap } from 'devonian';

const identities = new AtomicIdentityMap(store, 'https://example.com/bridge');
const scope = {
  scope: 'https://github.com/acme/project',
  entity: 'issue',
};
identities.bind(scope, 15, subject);
identities.lookup(scope, 15); // subject
identities.externalId(scope, subject); // 15
```

The identity key includes the connector instance/account/repository URL, entity type, and external ID's type and value. Numeric `15` and string `"15"` are distinct. Numbers must be safe integers; use strings for larger IDs. Conflicting bindings are rejected. Within one scope/entity, a resource has at most one external ID.

Mappings are ordinary Atomic Data resources using the definitions in [../vocab](../vocab). Their local ID is stored as a string alongside an explicit type. They link to their native resource and are included in snapshots. `subjectFor` deterministically allocates an import subject when no mapping exists, without content-based deduplication. Reserve the supplied base URL's `/resources/` and `/identities/` paths for this purpose, use a stable base, and arrange serving those resources yourself.

## Connector lenses

`AtomicLens<External>` accepts a store, identity map, scope, connector, and two transformations:

- `read(external, subject)` returns a patch of managed native properties. It can return `related` resource patches and `identities` bindings for entity extraction; the complete projection and primary mapping are applied together.
- `write(resource, previous)` produces the platform object. Merge into `previous` to preserve platform-only fields; explicitly remove managed optional fields when absent natively. For creates, `previous` is undefined.

The connector implements `id`, `get`, `create`, `update`, and `delete`. It must keep the ID stable during updates. `get` must return the latest complete object needed by `write`. `create` receives a stable idempotency key and **must deduplicate repeated requests with that key**, including after a restart. `delete` must tolerate a record already being absent. Platforms without idempotent creation need connector-specific recovery/reconciliation; Devonian cannot guarantee exactly-once creation across a lost response by itself.

Call `await lens.ingest(record)` on fetched records or webhooks. This creates or patches native resources and records identity without writing back to the source. Call `await lens.publish(subject)` after a native edit to create or update the external record. Operations on a lens are queued, complete only after their work finishes, and propagate errors to the caller. A failed operation does not poison subsequent calls. Retry `publish` after transient errors.

Call `await lens.ingestDelete(externalId)` for external deletion, or `await lens.delete(subject)` to delete externally and then locally. External failures leave native state available for retry. Identity records remain for replay and restoration, and related resources are not cascade-deleted. Republishing a previously deleted resource requires restoring the external record or a connector-specific recreation policy.

Echo prevention is explicit: ingest never triggers publish, and snapshot import emits no connector operations. When an external write produces a webhook, feed it into ingest normally. There is no automatic subscription loop to configure.

## Extract Entity example

[AtomicExtractEntity.ts](../examples/AtomicExtractEntity.ts) translates flattened platform orders into linked Order and Customer resources. Customer identity comes from an explicit customer ID, never from matching name/address content. Orders referring to the same customer ID share a resource; distinct customer IDs remain distinct even when their fields match.

```ts
// Within the repository; connector is your AtomicConnector<FlatOrder> implementation.
import { AtomicStore, AtomicIdentityMap } from '../src/main.js';
import { orderSchema, atomicOrderLens, orderVocabulary as v } from '../examples/AtomicExtractEntity.js';

const store = new AtomicStore(orderSchema());
const identities = new AtomicIdentityMap(store, 'https://example.com/bridge');
const lens = atomicOrderLens(store, identities, connector);
const subject = await lens.ingest(await connector.get('order-37'));
store.patch(subject, { set: { [v.quantity]: 3 } });
await lens.publish(subject);
```

To create a platform order from an authored native graph, create an Order and Customer resource, bind the Customer's external identity, and publish the Order. An update to a shared Customer can affect multiple flattened orders: the application must select and publish every affected order. This milestone does not implement graph dependency subscriptions.

## Persistence and restart

```ts
import { readFile, writeFile, rename } from 'node:fs/promises';

// Await in-flight lens operations before checkpointing. Use paths owned by your application.
await writeFile('state.json.tmp', store.toJSONAD());
await rename('state.json.tmp', 'state.json');

const restored = new AtomicStore(orderSchema());
const restoredIdentities = new AtomicIdentityMap(restored, 'https://example.com/bridge');
restored.loadJSONAD(await readFile('state.json', 'utf8'));
const restoredLens = atomicOrderLens(restored, restoredIdentities, connector);
```

Construct the schema and identity map before loading, to register the mapping properties. `loadJSONAD` validates the entire document and rejects duplicate subjects before replacing current state. The snapshot includes identity mappings, so publishing restored resources uses their original platform IDs. The property catalog is supplied by application code, not serialized into the snapshot. Snapshot writing and scheduling are the caller's responsibility; the in-memory store is not itself durable.

## Concurrency and next milestones

The queue serializes calls to one lens instance. It is not a distributed lock and does not serialize direct store edits or other lens instances. Coordinate writes to shared resources at the application level. Transformations should return projections rather than mutate the store while awaiting work. A connector write and local identity persistence are not a distributed transaction; stable idempotency keys are necessary for retry recovery.

There are no revision clocks, stale-event rejection, cross-system conflict resolution, signed Atomic Commits, Atomic Server transport, permissions, or Automerge integration in the resource API yet. Ingest applies events in call order; it can restore an earlier-deleted resource, so the application must order or filter delayed webhooks. Native data alone does not supply distributed convergence.

The behavioral tests cover distinct identical records, scoped identities, round-trip snapshots, malformed input rollback, linked entity extraction, reverse updates, field preservation/removal, replay, queued creates, lost responses and deletion failures.

Specification references: [JSON-AD](https://docs.atomicdata.dev/core/json-ad.html), [Atomic Schema](https://docs.atomicdata.dev/schema/intro.html), [Atomic Commits](https://docs.atomicdata.dev/commits/intro.html), [TypeScript SDK](https://atomicdata-dev.github.io/atomic-data-browser/docs/modules/_tomic_lib.html).

DID identifiers (including AtomicServer `did:ad:` base64 identities) are accepted as resource subjects, property keys, classes, links and connector scopes. Identifiers are preserved exactly; validation does not resolve DIDs or verify signatures. Identity allocator bases still require HTTP(S) URLs because the allocator appends child paths. Bind existing DID resources explicitly before ingesting their external records.

## Passive platform lenses

The `platform-lenses/github-issues/lens/` and
`platform-lenses/google-calendar/lens/` directories contain passive mappings.
A caller supplies resource data; these modules neither access datasets nor own
credentials, subscriptions, identity lookups, or durable synchronization state.

- GitHub's `project(issue)` maps issue fields to title/body/status.
  `unproject(value, previousIssue)` maps back while preserving the issue number,
  unrelated fields, and labels other than `atomic:doing`. The reverse mapping
  normalizes that workflow label to the requested status. `issueFields` and
  `issuePatch` support the existing runtime's field writes. The bridge's Atomic
  property mapping for issues and comments lives in `lens/resources.mjs`.
- Calendar's `calendarProjection` and `calendarRecurrenceProjection` add Atomic
  display/recurrence properties while retaining provider fields.
  `planCalendarValues(row, baseline, properties, remote)` computes reverse
  patches for summary, description, location, start, and end from supplied data.
  It retains the existing field conflict and interval validation. It does not
  write recurrence changes or replace the complete Google event. Empty strings
  explicitly clear supported text fields.

Import these through `devonian/platform-lenses/github-issues/lens` or
`devonian/platform-lenses/google-calendar/lens`. Calendar's projection helpers
still require the consuming application's compatible `@tomic/lib` calendar
helpers. Previous adapter, projection, recurrence, types, and sync entry points
remain available.

Transport, dataset membership checks, preview workflows, ETags, and checkpointing
remain in the surrounding platform modules. This extraction does not introduce
an event handler, dataset abstraction, Loro replay, or distributed convergence.
