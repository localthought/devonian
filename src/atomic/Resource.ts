import { Datatype, validateDatatype } from '@tomic/lib';

export { Datatype };
export type AtomicValue =
  | string
  | number
  | boolean
  | AtomicValue[]
  | { [property: string]: AtomicValue };
export interface AtomicResource {
  '@id': string;
  [property: string]: AtomicValue;
}
export interface AtomicPatch {
  set?: Record<string, AtomicValue>;
  unset?: string[];
}
export const IS_A = 'https://atomicdata.dev/properties/isA';

/** Accept HTTP(S) and DID identifiers without normalizing identity strings.
 * Atomic's did:ad profile includes base64 (+, /, =) identifiers. This is
 * syntactic validation only, not DID resolution or signature verification.
 */
export function assertSubject(value: string): void {
  if (
    typeof value !== 'string' ||
    /\s/.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error(
      'Expected an absolute identifier without whitespace or controls',
    );
  const url = new URL(value);
  if (['http:', 'https:'].includes(url.protocol)) return;
  if (
    /^did:[a-z0-9]+:[A-Za-z0-9._:%+/=-]+(?:[?#][A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?$/.test(
      value,
    ) &&
    !/%(?![0-9a-fA-F]{2})/.test(value)
  )
    return;
  throw new Error(`Expected an HTTP(S) URL or DID: ${value}`);
}

/** Offline property catalog. Callers supply definitions rather than fetching schemas. */
export class AtomicSchema {
  private properties = new Map<string, Datatype>([
    [IS_A, Datatype.RESOURCEARRAY],
  ]);

  property(subject: string, datatype: Datatype): this {
    assertSubject(subject);
    if (
      !Object.values(Datatype).includes(datatype) ||
      datatype === Datatype.UNKNOWN
    ) {
      throw new Error(`Unsupported datatype: ${datatype}`);
    }
    const existing = this.properties.get(subject);
    if (existing && existing !== datatype)
      throw new Error(`Conflicting property: ${subject}`);
    this.properties.set(subject, datatype);
    return this;
  }

  validate(resource: AtomicResource): void {
    assertSubject(resource['@id']);
    this.validateProperties(resource, true);
  }

  private validateProperties(
    resource: Record<string, AtomicValue>,
    named: boolean,
  ): void {
    if (Object.getPrototypeOf(resource) !== Object.prototype)
      throw new Error('Expected a plain JSON object');
    for (const [property, value] of Object.entries(resource)) {
      if (property === '@id' && named) continue;
      assertSubject(property);
      const datatype = this.properties.get(property);
      if (!datatype) throw new Error(`Unknown property: ${property}`);
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Expected a finite number');
      if (value === undefined || value === null)
        throw new Error(`Missing value for ${property}`);
      if (datatype === Datatype.ATOMIC_URL) {
        this.validateLink(value);
      } else if (datatype === Datatype.RESOURCEARRAY) {
        if (!Array.isArray(value))
          throw new Error(`Expected a resource array: ${property}`);
        for (const link of value) this.validateLink(link);
      } else {
        if (
          [Datatype.FLOAT, Datatype.INTEGER, Datatype.TIMESTAMP].includes(
            datatype,
          ) &&
          typeof value !== 'number'
        )
          throw new Error('Expected a number');
        if (datatype === Datatype.BOOLEAN && typeof value !== 'boolean')
          throw new Error('Expected a boolean');
        validateDatatype(value, datatype);
      }
    }
  }

  private validateLink(value: AtomicValue): void {
    if (typeof value === 'string') assertSubject(value);
    else if (value && typeof value === 'object' && !Array.isArray(value))
      this.validateProperties(value, false);
    else throw new Error('Expected a resource URL or nested resource');
  }
}
