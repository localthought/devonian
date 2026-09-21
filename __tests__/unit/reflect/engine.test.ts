import { describe, expect, it } from 'vitest';
import { createApiClient, type OpenApiDocument } from 'syncables';
import {
  ReflectionEngine,
  type ReflectionSide,
} from '../../../src/reflect/engine.js';
import { InMemoryIdMap } from '../../../src/reflect/id-map.js';
import { parseMarker } from '../../../src/reflect/marker.js';

interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
}

interface Comment {
  id: number;
  body: string;
}

const BASE_URL = 'https://api.example.test';
const ISSUES_PATH = '/repos/{owner}/{repo}/issues';
const ITEM_PATH = '/repos/{owner}/{repo}/issues/{number}';
const COMMENTS_PATH = '/repos/{owner}/{repo}/issues/{number}/comments';
// A synthetic item path purely so `createApiClient` pairs the comments
// collection into a discoverable resource — it is never requested, mirroring
// how a real host (e.g. reflector, for GitHub's non-nested comment address)
// has to do the same thing.
const COMMENT_ITEM_PATH = `${COMMENTS_PATH}/{comment_id}`;

const responsesOk = { '200': { description: 'ok' } };

const document: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'fake issue tracker', version: '1.0.0' },
  paths: {
    [ISSUES_PATH]: {
      get: { responses: responsesOk },
      post: { responses: { '201': { description: 'created' } } },
    },
    [ITEM_PATH]: {
      get: { responses: responsesOk },
      patch: { responses: responsesOk },
    },
    [COMMENTS_PATH]: {
      get: { responses: responsesOk },
      post: { responses: { '201': { description: 'created' } } },
    },
    [COMMENT_ITEM_PATH]: {},
  },
} as unknown as OpenApiDocument;

/** A tiny in-memory GitHub-Issues-shaped API for two repositories. */
class FakeGitHub {
  private readonly repos = new Map<string, Issue[]>();
  private readonly commentStore = new Map<string, Comment[]>();
  private seq = 1000;

  seed(repo: string, issues: Omit<Issue, 'id'>[]): void {
    this.repos.set(
      repo,
      issues.map((i) => ({ ...i, id: (this.seq += 1) })),
    );
  }

  issues(repo: string): Issue[] {
    return this.repos.get(repo) ?? [];
  }

  comments(repo: string, issueNumber: number): Comment[] {
    return this.commentStore.get(`${repo}#${issueNumber}`) ?? [];
  }

  addComment(repo: string, issueNumber: number, body: string): Comment {
    const key = `${repo}#${issueNumber}`;
    const list = this.commentStore.get(key) ?? [];
    const comment = { id: (this.seq += 1), body };
    list.push(comment);
    this.commentStore.set(key, list);
    return comment;
  }

  /** A fetch bound to the given path params, routing to this store. */
  authorizedFetch(params: Record<string, string> = {}): typeof fetch {
    const impl = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      let path = url.pathname;
      for (const [k, v] of Object.entries(params)) {
        path = path.replaceAll(`{${k}}`, v).replaceAll(`%7B${k}%7D`, v);
      }
      return this.route(
        (init?.method ?? 'GET').toUpperCase(),
        path,
        init,
        url.searchParams,
      );
    };
    return impl as typeof fetch;
  }

  private route(
    method: string,
    path: string,
    init?: RequestInit,
    query: URLSearchParams = new URLSearchParams(),
  ): Response {
    const list = /^\/repos\/([^/]+)\/([^/]+)\/issues$/.exec(path);
    const item = /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/.exec(path);
    const comments =
      /^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/.exec(path);
    const json = (data: unknown, status = 200): Response =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (comments) {
      const repo = `${comments[1]}/${comments[2]}`;
      const number = Number(comments[3]);
      if (method === 'GET') {
        return json(this.comments(repo, number));
      }
      if (method === 'POST') {
        const b = JSON.parse(String(init?.body ?? '{}')) as { body?: string };
        return json(this.addComment(repo, number, b.body ?? ''), 201);
      }
    }

    if (list) {
      const repo = `${list[1]}/${list[2]}`;
      const issues = this.issues(repo);
      if (method === 'GET') {
        // Like GitHub, list only open issues unless state=all/closed is asked.
        const stateFilter = query.get('state') ?? 'open';
        const filtered =
          stateFilter === 'all'
            ? issues
            : issues.filter((i) => i.state === stateFilter);
        return json(filtered);
      }
      if (method === 'POST') {
        const b = JSON.parse(String(init?.body ?? '{}')) as Partial<Issue>;
        this.seq += 1;
        const created: Issue = {
          id: this.seq,
          number: this.seq,
          title: b.title ?? '',
          body: b.body ?? '',
          state: 'open',
        };
        issues.push(created);
        this.repos.set(repo, issues);
        return json(created, 201);
      }
    }
    if (item && method === 'PATCH') {
      const repo = `${item[1]}/${item[2]}`;
      const number = Number(item[3]);
      const found = this.issues(repo).find((i) => i.number === number);
      if (!found) return new Response('not found', { status: 404 });
      const b = JSON.parse(String(init?.body ?? '{}')) as Partial<Issue>;
      // Like GitHub, only mutable fields are applied; id/number are immutable.
      if (typeof b.state === 'string') found.state = b.state;
      if (typeof b.title === 'string') found.title = b.title;
      if (typeof b.body === 'string') found.body = b.body;
      return json(found);
    }
    return new Response('not found', { status: 404 });
  }
}

const RETRY = { baseDelayMs: 1, maxDelayMs: 5, maxAttempts: 3 };

/**
 * A client's `sync()` walks every resource discovered in the document it was
 * built from, so — same as a real host has to do — each client here only
 * ever sees the one collection (plus its item path) it actually needs.
 */
function narrow(paths: string[]): OpenApiDocument {
  return {
    ...document,
    paths: Object.fromEntries(
      Object.entries(document.paths).filter(([path]) => paths.includes(path)),
    ),
  } as OpenApiDocument;
}

const ISSUES_DOCUMENT = narrow([ISSUES_PATH, ITEM_PATH]);
const COMMENTS_DOCUMENT = narrow([COMMENTS_PATH, COMMENT_ITEM_PATH]);

/**
 * A real host asks the issues collection for `state=all` (GitHub only
 * returns open issues by default) so a closed issue isn't mistaken for one
 * that was deleted and pruned from local storage. This wraps a fetch the
 * same way `ReflectionSide`'s builder in a real host would.
 */
function withStateAll(fetchImpl: typeof fetch): typeof fetch {
  const wrapped = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
      return fetchImpl(input, init);
    }
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (!url.searchParams.has('state')) {
      url.searchParams.set('state', 'all');
    }
    return fetchImpl(url.toString(), init);
  };
  return wrapped as typeof fetch;
}

/** Builds a `ReflectionSide` bound to `owner/repo` on `fake`. */
function buildSide(fake: FakeGitHub, system: string): ReflectionSide {
  const [owner, repo] = system.split('/') as [string, string];
  const client = createApiClient(ISSUES_DOCUMENT, {
    baseUrl: BASE_URL,
    fetch: withStateAll(fake.authorizedFetch({ owner, repo })),
    identityField: 'number',
    retry: RETRY,
  });
  return {
    system,
    client,
    collectionUrl: ISSUES_PATH,
    idField: 'number',
    comments: (issueId: string) => ({
      client: createApiClient(COMMENTS_DOCUMENT, {
        baseUrl: BASE_URL,
        fetch: fake.authorizedFetch({ owner, repo, number: issueId }),
        identityField: 'id',
        retry: RETRY,
      }),
      url: COMMENTS_PATH,
      idField: 'id',
    }),
    setState: async (id: string, state: string): Promise<void> => {
      const fetchImpl = fake.authorizedFetch({ owner, repo, number: id });
      const response = await fetchImpl(`${BASE_URL}${ITEM_PATH}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      if (!response.ok) {
        throw new Error(`state update failed with status ${response.status}`);
      }
    },
  };
}

describe('ReflectionEngine (issues)', () => {
  const sides = (fake: FakeGitHub): [ReflectionSide, ReflectionSide] => [
    buildSide(fake, 'octo/a'),
    buildSide(fake, 'octo/b'),
  ];

  it('reflects an original issue onto the other side with a back-link marker', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'Bug', body: 'It broke', state: 'open' },
    ]);
    fake.seed('octo/b', []);

    const [a, b] = sides(fake);
    const engine = new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
    });
    const summary = await engine.reflect();

    expect(summary.errors).toEqual([]);
    const copies = fake.issues('octo/b');
    expect(copies).toHaveLength(1);
    expect(copies[0]?.title).toBe('Bug');
    expect(copies[0]?.body).toContain('It broke');
    const marker = parseMarker(copies[0]?.body ?? '');
    expect(marker).toEqual({ system: 'octo/a', kind: 'issue', id: '1' });
  });

  it('does not duplicate on repeated passes and does not echo the copy back', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'Bug', body: 'It broke', state: 'open' },
    ]);
    fake.seed('octo/b', []);

    const [a, b] = sides(fake);
    const idMap = new InMemoryIdMap();
    const engine = new ReflectionEngine(a, b, idMap, { drainTimeoutMs: 2000 });

    await engine.reflect();
    await engine.reflect();
    await engine.reflect();

    // Exactly one copy on B, and A still has only its original (no echo back).
    expect(fake.issues('octo/b')).toHaveLength(1);
    expect(fake.issues('octo/a')).toHaveLength(1);
  });

  it('is idempotent even with a fresh (lost) id-map, via the destination marker scan', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'Bug', body: 'It broke', state: 'open' },
    ]);
    fake.seed('octo/b', []);
    const [a, b] = sides(fake);

    await new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
    }).reflect();
    // Second run with a brand-new id-map (as if persistence was wiped).
    await new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
    }).reflect();

    expect(fake.issues('octo/b')).toHaveLength(1);
  });

  it('reflects originals created on either side (bidirectional)', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'From A', body: 'a-body', state: 'open' },
    ]);
    fake.seed('octo/b', [
      { number: 5, title: 'From B', body: 'b-body', state: 'open' },
    ]);
    const [a, b] = sides(fake);
    const engine = new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
    });

    await engine.reflect();
    await engine.reflect();

    // Each side ends with its original plus one reflected copy of the other's.
    expect(fake.issues('octo/a')).toHaveLength(2);
    expect(fake.issues('octo/b')).toHaveLength(2);
    const aTitles = fake
      .issues('octo/a')
      .map((i) => i.title)
      .sort();
    expect(aTitles).toEqual(['From A', 'From B']);
  });

  it('propagates open/closed state both ways without bouncing', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'Bug', body: 'x', state: 'open' },
    ]);
    fake.seed('octo/b', []);
    const [a, b] = sides(fake);
    const engine = new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
    });

    // Reflect the issue, then close the ORIGINAL on A.
    await engine.reflect();
    const copyNumber = fake.issues('octo/b')[0]!.number;
    fake.issues('octo/a')[0]!.state = 'closed';

    const closed = await engine.reflect();
    expect(fake.issues('octo/b')[0]!.state).toBe('closed');
    expect(closed.updated).toHaveLength(1);

    // Stable: another pass changes nothing.
    const stable = await engine.reflect();
    expect(stable.updated).toEqual([]);
    expect(fake.issues('octo/a')[0]!.state).toBe('closed');
    expect(fake.issues('octo/b')[0]!.state).toBe('closed');

    // Reopen the COPY on B — the change flows back to the original on A.
    fake.issues('octo/b').find((i) => i.number === copyNumber)!.state = 'open';
    await engine.reflect();
    expect(fake.issues('octo/a')[0]!.state).toBe('open');
    expect(fake.issues('octo/b')[0]!.state).toBe('open');
  });

  it('reflects comments under the counterpart issue both ways, no dupes or echoes', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'Bug', body: 'x', state: 'open' },
    ]);
    fake.seed('octo/b', []);
    const [a, b] = sides(fake);
    const engine = new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
    });

    await engine.reflect(); // creates the copy issue on B
    const copyNumber = fake.issues('octo/b')[0]!.number;

    // Comment on A's original — it lands under B's copy, marked.
    const c1 = fake.addComment('octo/a', 1, 'first reply');
    await engine.reflect();
    const bComments = fake.comments('octo/b', copyNumber);
    expect(bComments).toHaveLength(1);
    expect(bComments[0]!.body).toContain('first reply');
    expect(parseMarker(bComments[0]!.body)).toEqual({
      system: 'octo/a',
      kind: 'comment',
      id: String(c1.id),
    });

    // Idempotent + no echo back.
    await engine.reflect();
    expect(fake.comments('octo/b', copyNumber)).toHaveLength(1);
    expect(fake.comments('octo/a', 1)).toHaveLength(1);

    // Comment on B's copy — reflected back under A's original.
    fake.addComment('octo/b', copyNumber, 'reply on the mirror');
    await engine.reflect();
    const aComments = fake.comments('octo/a', 1);
    expect(aComments).toHaveLength(2);
    expect(aComments.some((c) => c.body.includes('reply on the mirror'))).toBe(
      true,
    );

    // Still stable on another pass.
    await engine.reflect();
    expect(fake.comments('octo/a', 1)).toHaveLength(2);
    expect(fake.comments('octo/b', copyNumber)).toHaveLength(2);
  });

  it('uses a custom marker namespace when configured', async () => {
    const fake = new FakeGitHub();
    fake.seed('octo/a', [
      { number: 1, title: 'Bug', body: 'x', state: 'open' },
    ]);
    fake.seed('octo/b', []);
    const [a, b] = sides(fake);
    const engine = new ReflectionEngine(a, b, new InMemoryIdMap(), {
      drainTimeoutMs: 2000,
      namespace: 'reflector',
    });

    await engine.reflect();
    const copy = fake.issues('octo/b')[0]!;
    expect(copy.body).toContain('<!-- reflector:origin');
    expect(parseMarker(copy.body)).toBeUndefined();
    expect(parseMarker(copy.body, 'reflector')).toEqual({
      system: 'octo/a',
      kind: 'issue',
      id: '1',
    });
  });
});
