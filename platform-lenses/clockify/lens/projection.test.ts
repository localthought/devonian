import { Datatype } from '@tomic/lib';
import { describe, expect, it } from 'vitest';
import type { FetchedPlatform } from './types.js';
import {
  clockifyFields,
  clockifyProjection,
  resolveClockifyReferences,
} from './projection.js';

const fixture = (
  records: Array<Partial<FetchedPlatform['records'][number]>>,
): FetchedPlatform => ({
  platform: 'clockify',
  ontology: {
    description: '',
    terms: [
      {
        path: 'clockify/class/timeentry',
        kind: 'class',
        shortname: 'timeentry',
        description: '',
        datatype: Datatype.JSON,
        requires: [],
        recommends: ['clockify/property/description'],
      },
    ],
  },
  records: records.map((record, index) => ({
    resource: 'timeentry',
    namespace: 'ws/user',
    id: `entry-${index}`,
    name: `entry-${index}`,
    values: {},
    ...record,
  })),
});

describe('clockifyProjection', () => {
  it('adds start/end timestamps and names entries after their description', () => {
    const projected = clockifyProjection(
      fixture([
        {
          values: {
            description: '  Fix plugin loading ',
            type: 'REGULAR',
            timeinterval: {
              start: '2026-09-08T11:00:00Z',
              end: '2026-09-08T16:00:00Z',
              duration: 'PT5H',
            },
          },
        },
      ]),
    );
    const entry = projected.ontology.terms.find((t) => t.kind === 'class')!;
    const added = projected.ontology.terms.filter((t) =>
      t.path.startsWith('urn:atomic:clockify:'),
    );
    expect(added.map((t) => [t.shortname, t.datatype])).toEqual([
      [clockifyFields.start, Datatype.TIMESTAMP],
      [clockifyFields.end, Datatype.TIMESTAMP],
    ]);
    expect(entry.recommends).toEqual(
      expect.arrayContaining(added.map((t) => t.path)),
    );
    expect(projected.records).toHaveLength(1);
    expect(projected.records[0].name).toBe('Fix plugin loading');
    expect(projected.records[0].values[clockifyFields.start]).toBe(
      Date.parse('2026-09-08T11:00:00Z'),
    );
    expect(projected.records[0].values[clockifyFields.end]).toBe(
      Date.parse('2026-09-08T16:00:00Z'),
    );
    expect(projected.records[0].values.description).toBe('  Fix plugin loading ');
  });

  it('skips running timers and breaks, and falls back to a generic name', () => {
    const projected = clockifyProjection(
      fixture([
        {
          values: {
            type: 'REGULAR',
            timeinterval: { start: '2026-09-08T11:00:00Z', end: null },
          },
        },
        {
          values: {
            type: 'BREAK',
            timeinterval: {
              start: '2026-09-08T11:00:00Z',
              end: '2026-09-08T11:30:00Z',
            },
          },
        },
        {
          values: {
            type: 'REGULAR',
            timeinterval: {
              start: '2026-09-08T12:00:00Z',
              end: '2026-09-08T12:30:00Z',
            },
          },
        },
      ]),
    );
    expect(projected.records.map((r) => r.id)).toEqual(['entry-2']);
    expect(projected.records[0].name).toBe('Time entry');
  });

  it('rejects entries without a valid start or with an inverted interval', () => {
    expect(() =>
      clockifyProjection(
        fixture([{ values: { timeinterval: { end: '2026-09-08T12:30:00Z' } } }]),
      ),
    ).toThrow(/no valid start/);
    expect(() =>
      clockifyProjection(
        fixture([
          {
            values: {
              timeinterval: {
                start: '2026-09-08T12:30:00Z',
                end: '2026-09-08T12:00:00Z',
              },
            },
          },
        ]),
      ),
    ).toThrow(/ends before it starts/);
  });

  it('leaves other platforms untouched', () => {
    const other = { ...fixture([]), platform: 'notion' };
    expect(clockifyProjection(other)).toBe(other);
  });

  it('passes project and member records through unchanged', () => {
    const platform = fixture([
      {
        values: {
          type: 'REGULAR',
          projectid: 'p-1',
          userid: 'u-1',
          timeinterval: {
            start: '2026-09-08T11:00:00Z',
            end: '2026-09-08T12:00:00Z',
          },
        },
      },
    ]);
    platform.records.push(
      { resource: 'project', namespace: 'ws', id: 'p-1', name: 'Spec review', values: { name: 'Spec review' } },
      { resource: 'member', namespace: 'ws', id: 'u-1', name: 'Alice', values: { name: 'Alice', email: 'alice@example.com' } },
    );
    const projected = clockifyProjection(platform);
    expect(projected.records).toHaveLength(3);
    expect(projected.records.find((r) => r.resource === 'project')).toEqual(
      platform.records.find((r) => r.resource === 'project'),
    );
    expect(projected.records.find((r) => r.resource === 'member')).toEqual(
      platform.records.find((r) => r.resource === 'member'),
    );
  });
});

describe('resolveClockifyReferences', () => {
  it('resolves a time entry to its fetched project and member', () => {
    const platform = fixture([
      { id: 'entry-0', values: { projectid: 'p-1', userid: 'u-1' } },
    ]);
    platform.records.push(
      { resource: 'project', namespace: 'ws', id: 'p-1', name: 'Spec review', values: {} },
      { resource: 'member', namespace: 'ws', id: 'u-1', name: 'Alice', values: {} },
    );
    expect(resolveClockifyReferences(platform)).toEqual([
      {
        timeEntryId: 'entry-0',
        projectId: 'p-1',
        userId: 'u-1',
        project: platform.records.find((r) => r.resource === 'project'),
        member: platform.records.find((r) => r.resource === 'member'),
      },
    ]);
  });

  it('reports a dangling reference when the target was not fetched', () => {
    const platform = fixture([
      { id: 'entry-0', values: { projectid: 'p-missing', userid: 'u-1' } },
    ]);
    platform.records.push({
      resource: 'member',
      namespace: 'ws',
      id: 'u-1',
      name: 'Alice',
      values: {},
    });
    const [resolution] = resolveClockifyReferences(platform);
    expect(resolution.projectId).toBe('p-missing');
    expect(resolution.project).toBeUndefined();
    expect(resolution.member).toBeDefined();
  });

  it('omits entries with neither a projectid nor a userid', () => {
    const platform = fixture([{ id: 'entry-0', values: {} }]);
    expect(resolveClockifyReferences(platform)).toEqual([]);
  });

  it('returns nothing for other platforms', () => {
    const other = { ...fixture([]), platform: 'notion' };
    expect(resolveClockifyReferences(other)).toEqual([]);
  });
});
