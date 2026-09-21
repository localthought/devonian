import { describe, expect, it } from 'vitest';
import {
  embedMarker,
  hasMarker,
  parseMarker,
  renderMarker,
  stripMarker,
  type OriginRef,
} from '../../../src/reflect/marker.js';

const ref: OriginRef = { system: 'octo/source', kind: 'issue', id: '42' };

describe('origin marker codec', () => {
  it('round-trips embed -> parse', () => {
    const body = embedMarker('Something is broken.', ref);
    expect(parseMarker(body)).toEqual(ref);
    expect(hasMarker(body)).toBe(true);
  });

  it('renders an invisible HTML comment under the default namespace', () => {
    const body = embedMarker('Visible text', ref);
    expect(body).toContain('Visible text');
    expect(body).toContain('<!-- devonian:origin');
    expect(body.trimEnd().endsWith('-->')).toBe(true);
  });

  it('is idempotent — re-embedding does not stack markers', () => {
    const once = embedMarker('body', ref);
    const twice = embedMarker(once, ref);
    expect(twice).toBe(once);
    expect(twice.match(/devonian:origin/g)).toHaveLength(1);
  });

  it('updates the marker in place when the ref changes', () => {
    const first = embedMarker('body', ref);
    const moved = embedMarker(first, { ...ref, id: '99' });
    expect(parseMarker(moved)?.id).toBe('99');
    expect(moved.match(/devonian:origin/g)).toHaveLength(1);
  });

  it('reports no marker for a plain body', () => {
    expect(hasMarker('just a normal issue body')).toBe(false);
    expect(parseMarker('just a normal issue body')).toBeUndefined();
  });

  it('survives extra user text around the marker', () => {
    const body = `${renderMarker(ref)}\n\nsomeone replied here\nand here`;
    expect(parseMarker(body)).toEqual(ref);
    expect(stripMarker(body)).toBe('someone replied here\nand here');
  });

  it('encodes values so they cannot close the comment early', () => {
    const tricky: OriginRef = {
      system: 'a/b',
      kind: 'issue',
      // contains characters that would break a naive marker
      id: 'x --> <script> y',
    };
    const body = embedMarker('hi', tricky);
    // The only `-->` in the body is the marker terminator.
    expect(body.match(/-->/g)).toHaveLength(1);
    expect(parseMarker(body)).toEqual(tricky);
  });

  it('embeds into an empty body as just the marker', () => {
    const body = embedMarker('', ref);
    expect(body).toBe(renderMarker(ref));
    expect(parseMarker(body)).toEqual(ref);
  });

  it('treats a marker missing a required key as absent', () => {
    const partial = '<!-- devonian:origin system=octo%2Fsource kind=issue -->';
    expect(parseMarker(partial)).toBeUndefined();
  });

  describe('custom namespace', () => {
    // A caller with its own established wire format (e.g. `reflector`, for
    // backward compatibility with markers it already has in production) can
    // use a namespace other than the default.
    const NS = 'reflector';

    it('renders and parses under the given namespace only', () => {
      const body = embedMarker('hi', ref, NS);
      expect(body).toContain('<!-- reflector:origin');
      expect(parseMarker(body, NS)).toEqual(ref);
      // Not recognized under a different (including the default) namespace.
      expect(parseMarker(body)).toBeUndefined();
      expect(hasMarker(body)).toBe(false);
    });

    it('strips only its own namespace', () => {
      const mixed = `${renderMarker(ref, 'devonian')}\n\n${renderMarker(ref, NS)}`;
      const stripped = stripMarker(mixed, NS);
      expect(stripped).toContain('devonian:origin');
      expect(stripped).not.toContain('reflector:origin');
    });
  });
});
