import { AtomicResource, Datatype, IS_A, assertSubject } from './Resource.js';
import { AtomicStore } from './Store.js';

const VOCAB =
  'https://raw.githubusercontent.com/localthought/devonian/main/vocab/';
export const identity = {
  class: `${VOCAB}Identity.json`,
  scope: `${VOCAB}scope.json`,
  entity: `${VOCAB}entity.json`,
  localId: `${VOCAB}localId.json`,
  idType: `${VOCAB}idType.json`,
  resource: `${VOCAB}resource.json`,
};
export type ExternalId = string | number;
export interface IdentityScope {
  /** URL identifying a connector instance, account, repository or equivalent namespace. */
  scope: string;
  entity: string;
}

/** Identity equivalences are ordinary resources included in the store's JSON-AD snapshot. */
export class AtomicIdentityMap {
  private base: string;
  constructor(
    private store: AtomicStore,
    baseURL: string,
  ) {
    assertSubject(baseURL);
    const url = new URL(baseURL);
    if (url.search || url.hash)
      throw new Error('Identity base URL cannot contain a query or fragment');
    this.base = baseURL.replace(/\/$/, '');
    store.schema
      .property(identity.scope, Datatype.ATOMIC_URL)
      .property(identity.entity, Datatype.STRING)
      .property(identity.localId, Datatype.STRING)
      .property(identity.idType, Datatype.STRING)
      .property(identity.resource, Datatype.ATOMIC_URL);
  }

  private key(scope: IdentityScope, id: ExternalId): string {
    assertSubject(scope.scope);
    if (
      !scope.entity ||
      (typeof id !== 'string' && typeof id !== 'number') ||
      (typeof id === 'number' && !Number.isSafeInteger(id)) ||
      id === ''
    ) {
      throw new Error(
        'Expected an entity and a nonempty string or safe integer external ID',
      );
    }
    return encodeURIComponent(
      JSON.stringify([scope.scope, scope.entity, typeof id, id]),
    );
  }

  subjectFor(scope: IdentityScope, id: ExternalId): string {
    return (
      this.lookup(scope, id) ?? `${this.base}/resources/${this.key(scope, id)}`
    );
  }

  lookup(scope: IdentityScope, id: ExternalId): string | undefined {
    this.key(scope, id);
    return this.find(scope).find(
      (resource) =>
        resource[identity.localId] === String(id) &&
        resource[identity.idType] === typeof id,
    )?.[identity.resource] as string | undefined;
  }

  externalId(scope: IdentityScope, subject: string): ExternalId | undefined {
    const resource = this.find(scope).find(
      (resource) => resource[identity.resource] === subject,
    );
    if (!resource) return undefined;
    return resource[identity.idType] === 'number'
      ? Number(resource[identity.localId])
      : (resource[identity.localId] as string);
  }

  bind(scope: IdentityScope, id: ExternalId, subject: string): void {
    const key = this.key(scope, id);
    assertSubject(subject);
    const existing = this.lookup(scope, id);
    const reverse = this.externalId(scope, subject);
    if (
      (existing !== undefined && existing !== subject) ||
      (reverse !== undefined && reverse !== id)
    ) {
      throw new Error('Conflicting identity mapping');
    }
    if (existing === subject && reverse === id) return;
    this.store.put({
      '@id': `${this.base}/identities/${key}`,
      [IS_A]: [identity.class],
      [identity.scope]: scope.scope,
      [identity.entity]: scope.entity,
      [identity.localId]: String(id),
      [identity.idType]: typeof id,
      [identity.resource]: subject,
    });
  }

  private find(scope: IdentityScope): AtomicResource[] {
    const resources = this.store
      .all(identity.class)
      .filter(
        (resource) =>
          resource[identity.scope] === scope.scope &&
          resource[identity.entity] === scope.entity,
      );
    const ids = new Set<string>();
    const subjects = new Set<string>();
    for (const resource of resources) {
      const id = resource[identity.localId];
      const type = resource[identity.idType];
      const subject = resource[identity.resource];
      if (
        typeof id !== 'string' ||
        !id ||
        !['string', 'number'].includes(String(type)) ||
        typeof subject !== 'string' ||
        (type === 'number' &&
          (!Number.isSafeInteger(Number(id)) || String(Number(id)) !== id))
      ) {
        throw new Error('Invalid identity mapping');
      }
      const key = JSON.stringify([type, id]);
      if (ids.has(key) || subjects.has(subject))
        throw new Error('Conflicting identity mappings in snapshot');
      ids.add(key);
      subjects.add(subject);
    }
    return resources;
  }
}
