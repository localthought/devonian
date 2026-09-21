/**
 * Origin markers for reflected records.
 *
 * When a reflection engine copies a record from one system to another, the
 * copy has to carry a durable link back to the record it came from — so a
 * later pass can tell an original apart from a copy and never reflect a copy
 * onward (which would loop). Systems with a structured metadata channel (e.g.
 * Google Calendar's `extendedProperties.private`) can hold that link as a
 * field; on systems without one — notably **GitHub issues and comments** —
 * the only durable place is the body text itself, as an HTML comment that
 * renders invisibly.
 *
 * This module is that codec: {@link embedMarker} writes the hidden comment,
 * {@link parseMarker} reads it back, and {@link hasMarker} is the cheap
 * "is this already a copy?" check. It is deliberately free of any platform or
 * transport specifics — it operates on plain strings.
 *
 * The marker's tag is namespaced (`<!-- <namespace>:origin ... -->`) so more
 * than one caller can embed markers in the same body without colliding; every
 * function defaults to the `devonian` namespace but a caller with its own
 * established wire format (e.g. `reflector`, for backward compatibility with
 * markers it already has in production) can pass its own.
 */

/** A reference to the record a copy was made from. */
export interface OriginRef {
  /** Which system/endpoint the original lives on, e.g. a GitHub `owner/repo`. */
  system: string;
  /** The kind of record, e.g. `issue` or `comment`. */
  kind: string;
  /** The original record's identifier on that system. */
  id: string;
}

const DEFAULT_NAMESPACE = 'devonian';

const KEYS = ['system', 'kind', 'id'] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches a single origin marker anywhere in a body, for the given
 * `namespace`. The payload is a space-separated list of `key=value` pairs
 * whose values are percent-encoded, so a value can never contain `>` (hence
 * never `-->`) and the comment cannot be closed early or collide with
 * surrounding text.
 */
function markerRegex(namespace: string): RegExp {
  return new RegExp(
    `<!--\\s*${escapeRegExp(namespace)}:origin\\s+([^>]*?)\\s*-->`,
    'g',
  );
}

/** Renders an origin ref as the hidden HTML comment (no surrounding whitespace). */
export function renderMarker(
  ref: OriginRef,
  namespace: string = DEFAULT_NAMESPACE,
): string {
  const fields = KEYS.map(
    (key) => `${key}=${encodeURIComponent(ref[key])}`,
  ).join(' ');
  return `<!-- ${namespace}:origin ${fields} -->`;
}

/** Whether `body` already carries an origin marker for `namespace`. */
export function hasMarker(
  body: string,
  namespace: string = DEFAULT_NAMESPACE,
): boolean {
  const re = markerRegex(namespace);
  re.lastIndex = 0;
  return re.test(body);
}

/**
 * Reads the origin ref out of `body`, or `undefined` if there is none. If a
 * body somehow carries more than one marker the first is used. A marker
 * missing any required key is treated as absent (returns `undefined`) rather
 * than yielding a partial ref.
 */
export function parseMarker(
  body: string,
  namespace: string = DEFAULT_NAMESPACE,
): OriginRef | undefined {
  const re = markerRegex(namespace);
  re.lastIndex = 0;
  const match = re.exec(body);
  if (!match) {
    return undefined;
  }
  const payload = match[1] ?? '';
  const fields: Record<string, string> = {};
  for (const pair of payload.split(/\s+/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = pair.slice(0, eq);
    try {
      fields[key] = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return undefined; // malformed percent-encoding → treat as no marker
    }
  }
  if (KEYS.every((key) => typeof fields[key] === 'string')) {
    return { system: fields.system!, kind: fields.kind!, id: fields.id! };
  }
  return undefined;
}

/** Removes every origin marker for `namespace` (and trailing blank lines it leaves). */
export function stripMarker(
  body: string,
  namespace: string = DEFAULT_NAMESPACE,
): string {
  return body
    .replace(markerRegex(namespace), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Embeds `ref` into `body` as a hidden marker, idempotently: any existing
 * marker for `namespace` is removed first, so calling this twice does not
 * stack duplicate markers. The marker is appended after the visible text,
 * separated by a blank line (or is the whole body when `body` is empty).
 */
export function embedMarker(
  body: string,
  ref: OriginRef,
  namespace: string = DEFAULT_NAMESPACE,
): string {
  const base = stripMarker(body ?? '', namespace);
  const marker = renderMarker(ref, namespace);
  return base ? `${base}\n\n${marker}` : marker;
}
