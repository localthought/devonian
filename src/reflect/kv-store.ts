import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * A tiny persisted string→string store. Used for per-pair reflection metadata
 * that has to survive restarts — notably the last agreed open/closed state of a
 * reflected issue pair, which is how state reflection tells which side changed.
 */
export interface KvStore {
  get(key: string): string | undefined;
  set(key: string, value: string): Promise<void> | void;
}

export class InMemoryKvStore implements KvStore {
  protected readonly map = new Map<string, string>();

  get(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  protected record(key: string, value: string): void {
    this.map.set(key, value);
  }

  protected snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}

/** JSON-file-backed {@link KvStore}, rewritten on each set, owner-only. */
export class FileKvStore extends InMemoryKvStore {
  private constructor(private readonly path: string) {
    super();
  }

  static async open(path: string): Promise<FileKvStore> {
    const store = new FileKvStore(path);
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<
        string,
        string
      >;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') {
            store.record(k, v);
          }
        }
      }
    } catch {
      // No file yet — start empty.
    }
    return store;
  }

  override async set(key: string, value: string): Promise<void> {
    this.record(key, value);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.snapshot()), {
      mode: 0o600,
    });
  }
}
