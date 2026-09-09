import {
  AtomicPatch,
  AtomicResource,
  AtomicSchema,
  assertSubject,
} from './Resource.js';

/** Subject-addressed Atomic Data state. Snapshots contain data and identity resources. */
export class AtomicStore {
  private resources = new Map<string, AtomicResource>();
  constructor(readonly schema: AtomicSchema) {}

  get(subject: string): AtomicResource | undefined {
    const resource = this.resources.get(subject);
    return resource && structuredClone(resource);
  }

  put(resource: AtomicResource): void {
    this.schema.validate(resource);
    this.resources.set(resource['@id'], structuredClone(resource));
  }

  /** Preserve omitted properties; removals must be listed in unset. */
  patch(subject: string, patch: AtomicPatch): AtomicResource {
    assertSubject(subject);
    if (Object.hasOwn(patch.set ?? {}, '@id') || patch.unset?.includes('@id')) {
      throw new Error('A patch cannot change resource identity');
    }
    const resource = {
      ...(this.get(subject) ?? { '@id': subject }),
      ...patch.set,
    };
    for (const property of patch.unset ?? []) {
      assertSubject(property);
      delete resource[property];
    }
    this.put(resource);
    return structuredClone(resource);
  }

  /** Synchronous local transaction. Async work must finish before entering this callback. */
  transaction(operation: () => undefined): void {
    const previous = this.resources;
    this.resources = new Map(previous);
    try {
      operation();
    } catch (error) {
      this.resources = previous;
      throw error;
    }
  }

  /** Apply a resource projection as one local transaction. */
  apply(changes: { subject: string; patch: AtomicPatch }[]): void {
    const staged = new AtomicStore(this.schema);
    staged.resources = new Map(this.resources);
    for (const change of changes) staged.patch(change.subject, change.patch);
    this.resources = staged.resources;
  }

  delete(subject: string): void {
    this.resources.delete(subject);
  }

  /** Optional class filtering; callers can apply additional predicates to the returned copies. */
  all(classSubject?: string): AtomicResource[] {
    return [...this.resources.values()]
      .filter((resource) => {
        const classes = resource['https://atomicdata.dev/properties/isA'];
        return (
          !classSubject ||
          (Array.isArray(classes) && classes.includes(classSubject))
        );
      })
      .map((resource) => structuredClone(resource));
  }

  toJSONAD(): string {
    return JSON.stringify(this.all());
  }

  /** Validate the complete snapshot before replacing state. Import does not emit writes. */
  loadJSONAD(json: string): void {
    const parsed: unknown = JSON.parse(json);
    const resources = Array.isArray(parsed) ? parsed : [parsed];
    const next = new Map<string, AtomicResource>();
    for (const item of resources) {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        typeof item['@id'] !== 'string'
      ) {
        throw new Error('Expected a named JSON-AD resource');
      }
      const resource = item as AtomicResource;
      this.schema.validate(resource);
      if (next.has(resource['@id']))
        throw new Error(`Duplicate subject: ${resource['@id']}`);
      next.set(resource['@id'], structuredClone(resource));
    }
    this.resources = next;
  }
}
