import { describe, expect, it } from 'vitest';
import {
  project,
  unproject,
  issuePatch,
  type Issue,
} from '../../platform-lenses/github-issues/lens/index.js';
import { planCalendarValues } from '../../platform-lenses/google-calendar/lens/edit.js';
import {
  applyCalendarEdit,
  planCalendarEdit,
} from '../../platform-lenses/google-calendar/sync.js';

const issue: Issue & { assignee: string } = {
  number: 42,
  title: 'Before',
  body: null,
  state: 'open',
  labels: ['bug', { name: 'ATOMIC:DOING' }],
  assignee: 'someone',
};
const name = 'https://atomicdata.dev/properties/name';
const baseline = {
  [name]: 'Before',
  summary: 'Before',
  description: 'Details',
};
const properties = {
  summary: 'summary',
  description: 'description',
  start: 'start',
  end: 'end',
};
const remote = {
  summary: 'Before',
  description: 'Details',
  attendees: [{ email: 'person@example.com' }],
};

describe('passive platform lenses', () => {
  it.each(['Todo', 'Doing', 'Done'] as const)(
    'round trips GitHub %s without changing unrelated data',
    (status) => {
      const desired = { title: 'After', body: 'Edited', status };
      const previous = structuredClone(issue);
      const result = unproject(desired, issue);
      expect(project(result)).toEqual(desired);
      expect(result.number).toBe(42);
      expect(result.assignee).toBe('someone');
      expect(result.labels).toContain('bug');
      expect(issue).toEqual(previous);
      expect(unproject(desired, result)).toEqual(result);
    },
  );

  it('keeps the GitHub runtime patch minimal', () => {
    const before = project(issue);
    expect(issuePatch(before, before)).toEqual({});
    expect(issuePatch({ ...before, status: 'Done' }, before)).toEqual({
      state: 'closed',
    });
  });

  it('maps Calendar edits without replacing provider-only fields or mutating input', () => {
    const row = { ...baseline, [name]: 'After', description: '' };
    const previous = structuredClone(row);
    const edit = planCalendarValues(row, baseline, properties, remote)!;
    expect(edit.patch).toEqual({ summary: 'After', description: '' });
    expect({ ...remote, ...edit.patch }.attendees).toEqual(remote.attendees);
    expect(row).toEqual(previous);
    const acknowledged = { ...row, ...edit.acknowledged };
    expect(
      planCalendarValues(acknowledged, acknowledged, properties, {
        ...remote,
        ...edit.patch,
      }),
    ).toBeUndefined();
  });

  it('rejects competing Calendar edits and invalid intervals', () => {
    expect(() =>
      planCalendarValues(
        { ...baseline, [name]: 'Local' },
        baseline,
        properties,
        { ...remote, summary: 'Remote' },
      ),
    ).toThrow('conflict');
    expect(() =>
      planCalendarValues(
        { ...baseline, start: { date: '2026-09-12' } },
        baseline,
        properties,
        { ...remote, end: { date: '2026-09-11' } },
      ),
    ).toThrow('end must follow');
  });
});

describe('Calendar runtime after lens extraction', () => {
  const baselineKey = 'https://atomicdata.dev/properties/importBaseline';
  const config = {
    platform: 'google-calendar',
    destinations: { event: { table: 'urn:calendar', rowClass: 'urn:event' } },
    properties,
  };
  const row = {
    ...baseline,
    [name]: 'After',
    [baselineKey]: { values: baseline },
    'https://atomicdata.dev/properties/localId': JSON.stringify([
      'google-calendar',
      'event',
      'primary',
      '42',
    ]),
    'https://atomicdata.dev/properties/parent': 'urn:calendar',
    'https://atomicdata.dev/properties/isA': ['urn:event'],
  };

  it('does not checkpoint failed writes', async () => {
    const edit = planCalendarEdit('urn:event:42', row, config, {
      ...remote,
      etag: 'v1',
    })!;
    let checkpointed = false;
    await expect(
      applyCalendarEdit(
        edit,
        async () => row,
        async () => ({ status: 503, body: '' }),
        async () => {
          checkpointed = true;
        },
      ),
    ).rejects.toThrow('503');
    expect(checkpointed).toBe(false);
  });

  it('recovers a lost checkpoint without repeating the remote write', async () => {
    const edit = planCalendarEdit('urn:event:42', row, config, {
      ...remote,
      etag: 'v1',
    })!;
    const savedRemote = { ...remote, ...edit.patch, etag: 'v2' };
    await expect(
      applyCalendarEdit(
        edit,
        async () => row,
        async () => ({ status: 200, body: JSON.stringify(savedRemote) }),
        async () => {
          throw new Error('Checkpoint unavailable');
        },
      ),
    ).rejects.toThrow('Checkpoint unavailable');
    const replay = planCalendarEdit('urn:event:42', row, config, savedRemote)!;
    expect(replay.patch).toEqual({});
    let writes = 0;
    let checkpoint: unknown;
    await applyCalendarEdit(
      replay,
      async () => row,
      async () => {
        writes++;
        throw new Error('Unexpected write');
      },
      async (values) => {
        checkpoint = values;
      },
    );
    expect(writes).toBe(0);
    expect(checkpoint).toMatchObject({ [name]: 'After', summary: 'After' });
  });
});
