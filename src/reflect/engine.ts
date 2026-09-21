import type { ApiClient } from 'syncables';
import {
  embedMarker,
  parseMarker,
  stripMarker,
  type OriginRef,
} from './marker.js';
import type { IdMap, Link } from './id-map.js';
import { InMemoryKvStore, type KvStore } from './kv-store.js';

/**
 * One system in a reflection pair, already bound to a live `syncables`
 * client for its `issues`-shaped collection.
 *
 * A `ReflectionSide` deliberately carries no OpenAPI document, resource
 * model, or auth of its own — building that (discovering the collection,
 * authorizing requests, applying overlays) is the caller's job, since it
 * differs per host application. This keeps `ReflectionEngine` portable across
 * any two `syncables`-backed endpoints that shape their collection the same
 * way (an `issues`-like list + item pair, plus a nested comments collection).
 */
export interface ReflectionSide {
  /** Stable name identifying this system (e.g. a GitHub `owner/repo`), used in markers and the id-map. */
  system: string;
  /** A `syncables` client already scoped and authorized for this side's issues collection. */
  client: ApiClient;
  /** The collection URL `client` was built against. */
  collectionUrl: string;
  /** The field each issue record's id lives under (as `client` was configured). */
  idField: string;
  /** Builds a `syncables` client scoped to one issue's comments. */
  comments(issueId: string): {
    client: ApiClient;
    url: string;
    idField: string;
  };
  /** Applies a minimal open/closed state change to one issue on this side. */
  setState(id: string, state: string): Promise<void>;
}

export interface ReflectionOptions {
  direction?: 'bidirectional' | 'a-to-b';
  /** How many failed write attempts before a stuck background write aborts a pass. */
  maxAttempts?: number;
  /** Milliseconds to wait for a background write to settle before giving up. */
  drainTimeoutMs?: number;
  /** Persisted last-agreed state per reflected pair (for state reflection). */
  stateLedger?: KvStore;
  /** The marker namespace to embed/recognize (see {@link ../reflect/marker.js}). Defaults to `devonian`. */
  namespace?: string;
}

/** What one `reflect()` run did. */
export interface ReflectionSummary {
  /** Records newly copied, as `{ kind, from, to }`. */
  created: { kind: string; from: string; to: string }[];
  /** State changes propagated, as `{ kind, target, state }`. */
  updated: { kind: string; target: string; state: string }[];
  errors: { kind: string; from: string; error: string }[];
}

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Reflects records between two systems.
 *
 * - **Issues** are copied each way, with a hidden marker linking every copy
 *   back to its source; a copy is never reflected onward (echo suppression) or
 *   twice (idempotency, via the {@link IdMap} plus a destination marker scan).
 * - **Open/closed state** is kept in agreement: a change on either side is
 *   propagated to the counterpart, using a persisted ledger of the last agreed
 *   state to tell which side changed and avoid bouncing.
 * - **Comments** are reflected the same create+marker+idMap way, under the
 *   counterpart issue.
 *
 * Built on the `syncables` client each {@link ReflectionSide} already carries
 * — one client per side per collection — so this engine has no notion of
 * OpenAPI, overlays, or auth of its own.
 */
export class ReflectionEngine {
  private readonly direction: 'bidirectional' | 'a-to-b';
  private readonly maxAttempts: number;
  private readonly drainTimeoutMs: number;
  private readonly stateLedger: KvStore;
  private readonly namespace: string | undefined;

  constructor(
    private readonly a: ReflectionSide,
    private readonly b: ReflectionSide,
    private readonly idMap: IdMap,
    options: ReflectionOptions = {},
  ) {
    this.direction = options.direction ?? 'bidirectional';
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.drainTimeoutMs = options.drainTimeoutMs ?? 15_000;
    this.stateLedger = options.stateLedger ?? new InMemoryKvStore();
    this.namespace = options.namespace;
  }

  /** Runs one reflection pass: create-reflection then state reconciliation. */
  async reflect(): Promise<ReflectionSummary> {
    const summary: ReflectionSummary = { created: [], updated: [], errors: [] };
    await this.a.client.sync();
    await this.b.client.sync();

    await this.reflectCreates(this.a, this.b, summary);
    if (this.direction === 'bidirectional') {
      await this.reflectCreates(this.b, this.a, summary);
    }
    await this.reflectState(this.a, this.b, summary);
    await this.reflectComments(this.a, this.b, summary);
    return summary;
  }

  private parse(body: string): OriginRef | undefined {
    return parseMarker(body, this.namespace);
  }

  private embed(body: string, ref: OriginRef): string {
    return embedMarker(body, ref, this.namespace);
  }

  private strip(body: string): string {
    return stripMarker(body, this.namespace);
  }

  private async reflectCreates(
    from: ReflectionSide,
    to: ReflectionSide,
    summary: ReflectionSummary,
  ): Promise<void> {
    const sources = await from.client.list(from.collectionUrl);
    const destIssues = await to.client.list(to.collectionUrl);

    // Existing copies on the destination, keyed by the source id their marker
    // names — so a lost/empty id-map doesn't cause duplicate reflections.
    const existing = new Map<string, string>();
    for (const issue of destIssues) {
      const marker = this.parse(bodyOf(issue));
      if (marker?.kind === 'issue' && marker.system === from.system) {
        existing.set(marker.id, String(issue[to.idField]));
      }
    }

    for (const issue of sources) {
      const id = String(issue[from.idField]);
      const marker = this.parse(bodyOf(issue));
      // Echo: this issue is itself a copy of a `to`-side record; reflecting it
      // back would loop.
      if (marker && marker.system === to.system) {
        continue;
      }
      const known =
        this.idMap.counterpart('issue', from.system, id) ??
        (existing.has(id)
          ? { system: to.system, id: existing.get(id)! }
          : undefined);
      if (known) {
        await this.idMap.link(
          'issue',
          { system: from.system, id },
          { system: to.system, id: known.id },
        );
        continue;
      }

      try {
        const toId = await this.createIssueCopy(from, to, issue, id);
        await this.idMap.link(
          'issue',
          { system: from.system, id },
          { system: to.system, id: toId },
        );
        summary.created.push({
          kind: 'issue',
          from: `${from.system}#${id}`,
          to: `${to.system}#${toId}`,
        });
      } catch (error) {
        summary.errors.push({
          kind: 'issue',
          from: `${from.system}#${id}`,
          error: message(error),
        });
      }
    }
  }

  /** Creates a marked copy of `issue` on the destination and returns its new id. */
  private async createIssueCopy(
    from: ReflectionSide,
    to: ReflectionSide,
    issue: Record<string, unknown>,
    sourceId: string,
  ): Promise<string> {
    const body = this.embed(this.strip(bodyOf(issue)), {
      system: from.system,
      kind: 'issue',
      id: sourceId,
    });
    const title = typeof issue['title'] === 'string' ? issue['title'] : '';
    await to.client.create(to.collectionUrl, { title, body });
    await this.drain(to.client, to.collectionUrl);

    const copies = await to.client.list(to.collectionUrl);
    const copy = copies.find((c) => {
      const marker = this.parse(bodyOf(c));
      return (
        marker?.kind === 'issue' &&
        marker.system === from.system &&
        marker.id === sourceId
      );
    });
    if (!copy) {
      throw new Error('created copy not found after write settled');
    }
    return String(copy[to.idField]);
  }

  /**
   * Propagates open/closed state across each reflected issue pair. A ledger of
   * the last agreed state per pair identifies which side changed: that side's
   * state is written to the other. When neither matches the ledger (or there is
   * no ledger yet) the **original** wins, so a fresh run converges without
   * bouncing.
   */
  private async reflectState(
    a: ReflectionSide,
    b: ReflectionSide,
    summary: ReflectionSummary,
  ): Promise<void> {
    for (const pair of this.idMap.links('issue')) {
      const aEnd = endFor(pair, a.system);
      const bEnd = endFor(pair, b.system);
      if (!aEnd || !bEnd) {
        continue; // a link to some other system
      }
      const aIssue = await a.client.get(a.collectionUrl, aEnd.id);
      const bIssue = await b.client.get(b.collectionUrl, bEnd.id);
      if (!aIssue || !bIssue) {
        continue;
      }
      const aState = stateOf(aIssue);
      const bState = stateOf(bIssue);
      const key = pairKey(a.system, aEnd.id, b.system, bEnd.id);
      const last = this.stateLedger.get(key);

      if (aState === bState) {
        if (last !== aState) {
          await this.stateLedger.set(key, aState);
        }
        continue;
      }

      // Diverged — decide the winning state and which side to write.
      let winner: string;
      let target: ReflectionSide;
      let targetId: string;
      if (last !== undefined && aState !== last && bState === last) {
        winner = aState;
        target = b;
        targetId = bEnd.id;
      } else if (last !== undefined && bState !== last && aState === last) {
        winner = bState;
        target = a;
        targetId = aEnd.id;
      } else {
        // No ledger, or both changed: the original is authoritative.
        const aIsCopy = this.parse(bodyOf(aIssue))?.system === b.system;
        if (aIsCopy) {
          winner = bState;
          target = a;
          targetId = aEnd.id;
        } else {
          winner = aState;
          target = b;
          targetId = bEnd.id;
        }
      }

      try {
        await target.setState(targetId, winner);
        await this.stateLedger.set(key, winner);
        summary.updated.push({
          kind: 'issue',
          target: `${target.system}#${targetId}`,
          state: winner,
        });
      } catch (error) {
        summary.errors.push({
          kind: 'issue',
          from: `${target.system}#${targetId}`,
          error: message(error),
        });
      }
    }
  }

  /**
   * Reflects comments for every linked issue pair. A comment added on one
   * issue is copied under the counterpart issue on the other side, with a
   * hidden marker linking it back — so a copy is never reflected again (echo
   * suppression) or duplicated (id-map + destination marker scan). Create-only:
   * editing/deleting a reflected comment is out of scope.
   */
  private async reflectComments(
    aSide: ReflectionSide,
    bSide: ReflectionSide,
    summary: ReflectionSummary,
  ): Promise<void> {
    for (const pair of this.idMap.links('issue')) {
      const aEnd = endFor(pair, aSide.system);
      const bEnd = endFor(pair, bSide.system);
      if (!aEnd || !bEnd) {
        continue;
      }
      await this.reflectCommentsOneWay(aSide, aEnd.id, bSide, bEnd.id, summary);
      if (this.direction === 'bidirectional') {
        await this.reflectCommentsOneWay(
          bSide,
          bEnd.id,
          aSide,
          aEnd.id,
          summary,
        );
      }
    }
  }

  private async reflectCommentsOneWay(
    from: ReflectionSide,
    fromIssueId: string,
    to: ReflectionSide,
    toIssueId: string,
    summary: ReflectionSummary,
  ): Promise<void> {
    const src = from.comments(fromIssueId);
    const dst = to.comments(toIssueId);
    await src.client.sync();
    await dst.client.sync();
    const sources = await src.client.list(src.url);
    const destComments = await dst.client.list(dst.url);

    const existing = new Map<string, string>();
    for (const comment of destComments) {
      const marker = this.parse(bodyOf(comment));
      if (marker?.kind === 'comment' && marker.system === from.system) {
        existing.set(marker.id, String(comment[dst.idField]));
      }
    }

    for (const comment of sources) {
      const id = String(comment[src.idField]);
      const marker = this.parse(bodyOf(comment));
      if (marker && marker.system === to.system) {
        continue; // echo: this comment is itself a copy of a `to`-side comment
      }
      const known =
        this.idMap.counterpart('comment', from.system, id) ??
        (existing.has(id)
          ? { system: to.system, id: existing.get(id)! }
          : undefined);
      if (known) {
        await this.idMap.link(
          'comment',
          { system: from.system, id },
          { system: to.system, id: known.id },
        );
        continue;
      }

      try {
        const body = this.embed(this.strip(bodyOf(comment)), {
          system: from.system,
          kind: 'comment',
          id,
        });
        await dst.client.create(dst.url, { body });
        await this.drain(dst.client, dst.url);
        const copies = await dst.client.list(dst.url);
        const copy = copies.find((c) => {
          const m = this.parse(bodyOf(c));
          return (
            m?.kind === 'comment' && m.system === from.system && m.id === id
          );
        });
        if (!copy) {
          throw new Error('created comment copy not found after write settled');
        }
        await this.idMap.link(
          'comment',
          { system: from.system, id },
          { system: to.system, id: String(copy[dst.idField]) },
        );
        summary.created.push({
          kind: 'comment',
          from: `${from.system}#${fromIssueId}/${id}`,
          to: `${to.system}#${toIssueId}/${String(copy[dst.idField])}`,
        });
      } catch (error) {
        summary.errors.push({
          kind: 'comment',
          from: `${from.system}#${fromIssueId}/${id}`,
          error: message(error),
        });
      }
    }
  }

  /** Waits until the client has no pending background writes for `collectionUrl`. */
  private async drain(client: ApiClient, collectionUrl: string): Promise<void> {
    const deadline = Date.now() + this.drainTimeoutMs;
    for (;;) {
      const pending = client.pendingWrites(collectionUrl);
      if (pending.length === 0) {
        return;
      }
      const stuck = pending.find(
        (w) => w.attempts >= this.maxAttempts && w.lastError,
      );
      if (stuck) {
        throw new Error(`write failed: ${stuck.lastError}`);
      }
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for write to settle');
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function bodyOf(record: Record<string, unknown>): string {
  return typeof record['body'] === 'string' ? record['body'] : '';
}

function stateOf(record: Record<string, unknown>): string {
  return typeof record['state'] === 'string' ? record['state'] : 'open';
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The end of a link that lives on `system`, if any. */
function endFor(pair: { a: Link; b: Link }, system: string): Link | undefined {
  if (pair.a.system === system) return pair.a;
  if (pair.b.system === system) return pair.b;
  return undefined;
}

/** A stable key for a reflected pair, independent of side order. */
function pairKey(
  systemA: string,
  idA: string,
  systemB: string,
  idB: string,
): string {
  return [`${systemA}#${idA}`, `${systemB}#${idB}`].sort().join('|');
}
