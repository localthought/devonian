import { AtomicPatch, AtomicResource, assertSubject } from './Resource.js';
import { AtomicStore } from './Store.js';
import { AtomicIdentityMap, ExternalId, IdentityScope } from './IdentityMap.js';

/** Platform I/O remains outside the native resource model. */
export interface AtomicConnector<External> {
  id(record: External): ExternalId;
  get(id: ExternalId): Promise<External>;
  /** Must honor this stable idempotency key across retries, including after restart. */
  create(record: External, idempotencyKey: string): Promise<External>;
  update(id: ExternalId, record: External): Promise<void>;
  /** Must succeed when the external record is already absent. */
  delete(id: ExternalId): Promise<void>;
}
export interface AtomicProjection extends AtomicPatch {
  related?: { subject: string; patch: AtomicPatch }[];
  identities?: { scope: IdentityScope; id: ExternalId; subject: string }[];
}
export interface AtomicLensOptions<External> extends IdentityScope {
  store: AtomicStore;
  identities: AtomicIdentityMap;
  connector: AtomicConnector<External>;
  /** Return only managed properties. Use unset to remove one. */
  read(
    record: External,
    subject: string,
  ): AtomicProjection | Promise<AtomicProjection>;
  /** Merge managed fields into previous to preserve external-only fields. */
  write(
    resource: AtomicResource,
    previous: External | undefined,
  ): External | Promise<External>;
}

/** Awaitable bidirectional lens between native Atomic Data and a platform connector. */
export class AtomicLens<External> {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private options: AtomicLensOptions<External>) {
    assertSubject(options.scope);
    if (!options.entity) throw new Error('A lens requires an entity type');
    if (options.identities.store !== options.store) {
      throw new Error('Lens and identity map must use the same store');
    }
  }

  /** Handle a webhook or fetched record. Never writes back to the connector. */
  ingest(record: External): Promise<string> {
    return this.enqueue(async () => {
      const { connector, identities, store, read } = this.options;
      const id = connector.id(record);
      const subject = identities.subjectFor(this.options, id);
      const patch = await read(record, subject);
      store.transaction(() => {
        store.apply([...(patch.related ?? []), { subject, patch }]);
        for (const mapping of patch.identities ?? [])
          identities.bind(mapping.scope, mapping.id, mapping.subject);
        identities.bind(this.options, id, subject);
      });
      return subject;
    });
  }

  /** Publish the latest native state; failures reject and may be retried. */
  publish(subject: string): Promise<ExternalId> {
    return this.enqueue(async () => {
      const { connector, identities, store, write } = this.options;
      const resource = store.get(subject);
      if (!resource) throw new Error(`Unknown resource: ${subject}`);
      const id = identities.externalId(this.options, subject);
      if (id !== undefined) {
        const previous = await connector.get(id);
        await connector.update(id, await write(resource, previous));
        return id;
      }
      const key = JSON.stringify([
        this.options.scope,
        this.options.entity,
        subject,
      ]);
      const created = await connector.create(
        await write(resource, undefined),
        key,
      );
      const createdId = connector.id(created);
      identities.bind(this.options, createdId, subject);
      return createdId;
    });
  }

  /** Delete native state after an external deletion. Retain identity for replay/recreation. */
  ingestDelete(id: ExternalId): Promise<void> {
    return this.enqueue(async () => {
      const subject = this.options.identities.lookup(this.options, id);
      if (subject) this.options.store.delete(subject);
    });
  }

  /** Delete externally first, so a failed request leaves native state available for retry. */
  delete(subject: string): Promise<void> {
    return this.enqueue(async () => {
      const { connector, identities, store } = this.options;
      const id = identities.externalId(this.options, subject);
      if (id !== undefined) await connector.delete(id);
      store.delete(subject);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
}
