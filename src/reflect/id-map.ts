import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** One end of a reflected pair: a record `id` on a named `system`. */
export interface Link {
  system: string;
  id: string;
}

/**
 * The persisted correspondence between originals and their reflected copies.
 *
 * When a record on one system is reflected onto another, the two are linked
 * here so that (a) a later pass knows the record is already reflected and does
 * not create a duplicate, and (b) reflecting a *change* (an issue's state, a
 * new comment) can find the counterpart to apply it to. Links are symmetric
 * and scoped by record `kind` (`issue`, `comment`).
 */
export interface IdMap {
  /** The counterpart of `{system,id}` for `kind`, if one has been linked. */
  counterpart(kind: string, system: string, id: string): Link | undefined;
  /** Records that `a` and `b` are the two ends of one reflected pair. */
  link(kind: string, a: Link, b: Link): Promise<void> | void;
  /** Every linked pair of the given kind (one row per pair). */
  links(kind: string): { a: Link; b: Link }[];
}

function key(kind: string, system: string, id: string): string {
  return `${kind} ${system} ${id}`;
}

/** In-memory {@link IdMap}; the base for the persisted variants. */
export class InMemoryIdMap implements IdMap {
  protected readonly map = new Map<string, Link>();

  counterpart(kind: string, system: string, id: string): Link | undefined {
    return this.map.get(key(kind, system, id));
  }

  link(kind: string, a: Link, b: Link): void {
    this.record(kind, a, b);
  }

  /**
   * Records a link in memory only. Kept separate from {@link link} so that
   * loading from disk (and a persisting subclass) can update the in-memory map
   * without re-triggering a save — a subclass overrides `link` to persist and
   * calls `record` for the in-memory half.
   */
  protected record(kind: string, a: Link, b: Link): void {
    this.map.set(key(kind, a.system, a.id), b);
    this.map.set(key(kind, b.system, b.id), a);
  }

  links(kind: string): { a: Link; b: Link }[] {
    return this.entries()
      .filter((e) => e.kind === kind)
      .map(({ a, b }) => ({ a, b }));
  }

  /** Every link as flat triples, for serialization. */
  entries(): { kind: string; a: Link; b: Link }[] {
    const seen = new Set<string>();
    const out: { kind: string; a: Link; b: Link }[] = [];
    for (const [k, b] of this.map) {
      const [kind, system, id] = k.split(' ') as [string, string, string];
      const a: Link = { system, id };
      const pairId = [`${a.system}:${a.id}`, `${b.system}:${b.id}`]
        .sort()
        .join('|');
      if (seen.has(`${kind}|${pairId}`)) {
        continue;
      }
      seen.add(`${kind}|${pairId}`);
      out.push({ kind, a, b });
    }
    return out;
  }

  protected load(entries: { kind: string; a: Link; b: Link }[]): void {
    for (const { kind, a, b } of entries) {
      this.record(kind, a, b);
    }
  }
}

/**
 * A JSON-file-backed {@link IdMap}. The whole map is small (one entry per
 * reflected record) and rewritten on each link, owner-only. This survives
 * restarts on a durable disk; on an ephemeral host the map should live in a
 * database instead (wired where the loop is configured).
 */
export class FileIdMap extends InMemoryIdMap {
  private constructor(private readonly path: string) {
    super();
  }

  static async open(path: string): Promise<FileIdMap> {
    const map = new FileIdMap(path);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as { kind: string; a: Link; b: Link }[];
      if (Array.isArray(parsed)) {
        map.load(parsed);
      }
    } catch {
      // No file yet (or unreadable) — start empty.
    }
    return map;
  }

  override async link(kind: string, a: Link, b: Link): Promise<void> {
    this.record(kind, a, b);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.entries()), { mode: 0o600 });
  }
}
