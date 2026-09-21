// @wc-ignore-file
import { Datatype } from '@tomic/lib';
import type { FetchedPlatform, FetchedRecord, JSONValue, Term } from './types.js';

export const CLOCKIFY_PLATFORM = 'clockify';
export const TIME_ENTRY_RESOURCE = 'timeentry';
export const PROJECT_RESOURCE = 'project';
export const MEMBER_RESOURCE = 'member';
/** Term shortnames the projection adds next to the provider's own fields. */
export const clockifyFields = {
  start: 'start',
  end: 'end',
} as const;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const instant = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};

/**
 * Adds a typed start/end interval to every completed `timeentry` and names
 * it after its description. Entries still running (no end) and breaks are
 * skipped: the Time Tracker's own timer owns anything without an end, and a
 * break is not work. `project`/`member` records (see
 * `resolveClockifyReferences`) and any other provider fields pass through
 * untouched.
 */
export function clockifyProjection(fetched: FetchedPlatform): FetchedPlatform {
  if (fetched.platform !== CLOCKIFY_PLATFORM) return fetched;
  const entry = fetched.ontology.terms.find(
    (t) => t.kind === 'class' && t.shortname === TIME_ENTRY_RESOURCE,
  );
  if (!entry) return fetched;
  const definitions: [string, string][] = [
    [clockifyFields.start, "Start instant of the entry, from Clockify's UTC interval."],
    [clockifyFields.end, "End instant of the completed entry, from Clockify's UTC interval."],
  ];
  const terms: Term[] = definitions.map(([shortname, description]) => ({
    path: `urn:atomic:clockify:${shortname}`,
    kind: 'property',
    shortname,
    datatype: Datatype.TIMESTAMP,
    description,
    requires: [],
    recommends: [],
  }));
  if (
    fetched.ontology.terms.some((t) =>
      terms.some((extra) => extra.shortname === t.shortname),
    )
  )
    throw new Error('Clockify projection property collides with provider ontology');
  const records: FetchedRecord[] = [];

  for (const row of fetched.records) {
    if (row.resource !== TIME_ENTRY_RESOURCE) {
      records.push(row);
      continue;
    }

    if (row.values.type === 'BREAK') continue;
    const interval = object(row.values.timeinterval);
    const start = instant(interval.start);
    const end = instant(interval.end);
    if (start === undefined)
      throw new Error(`Clockify entry ${row.id} has no valid start`);
    if (end === undefined) continue;
    if (end < start)
      throw new Error(`Clockify entry ${row.id} ends before it starts`);
    const description =
      typeof row.values.description === 'string'
        ? row.values.description.trim()
        : '';
    const values: Record<string, JSONValue> = {
      ...row.values,
      [clockifyFields.start]: start,
      [clockifyFields.end]: end,
    };
    records.push({
      ...row,
      name: description || 'Time entry',
      values,
    });
  }

  return {
    ...fetched,
    ontology: {
      ...fetched.ontology,
      terms: [
        ...fetched.ontology.terms.map((t) =>
          t === entry
            ? {
                ...t,
                recommends: [...t.recommends, ...terms.map((extra) => extra.path)],
              }
            : t,
        ),
        ...terms,
      ],
    },
    records,
  };
}

export interface ClockifyReferenceResolution {
  timeEntryId: string;
  /** Raw id from the time entry's own projectid/userid field, if present. */
  projectId?: string;
  userId?: string;
  /** The matching project/member record, when one was fetched in the same batch. */
  project?: FetchedRecord;
  member?: FetchedRecord;
}

/**
 * Resolves each time entry's `projectid`/`userid` against `project`/`member`
 * records fetched in the same batch (localthought/overlays' Clockify
 * crud-causality overlay declares these as CRUD Causality 0.3.0
 * `references` — see pondersource/openapi-extensions#24). A raw id with no
 * matching record is a dangling reference: the project or member exists in
 * Clockify but wasn't part of this fetch (e.g. archived, or paginated out),
 * not a data error, so this returns the id alone rather than throwing.
 *
 * This only resolves identity, the same way the CRUD Causality Reference
 * Object does — it does not allocate or write an Atomic resource for the
 * referenced project/member; that belongs to whatever layer owns identity
 * and durable state for the imported table (see localthought/atomic-plugins#4).
 */
export function resolveClockifyReferences(
  fetched: FetchedPlatform,
): ClockifyReferenceResolution[] {
  if (fetched.platform !== CLOCKIFY_PLATFORM) return [];
  const projectsById = new Map(
    fetched.records
      .filter((r) => r.resource === PROJECT_RESOURCE)
      .map((r) => [r.id, r] as const),
  );
  const membersById = new Map(
    fetched.records
      .filter((r) => r.resource === MEMBER_RESOURCE)
      .map((r) => [r.id, r] as const),
  );
  const resolutions: ClockifyReferenceResolution[] = [];
  for (const row of fetched.records) {
    if (row.resource !== TIME_ENTRY_RESOURCE) continue;
    const projectId =
      typeof row.values.projectid === 'string' ? row.values.projectid : undefined;
    const userId =
      typeof row.values.userid === 'string' ? row.values.userid : undefined;
    if (projectId === undefined && userId === undefined) continue;
    resolutions.push({
      timeEntryId: row.id,
      ...(projectId === undefined ? {} : { projectId }),
      ...(userId === undefined ? {} : { userId }),
      ...(projectId !== undefined && projectsById.has(projectId)
        ? { project: projectsById.get(projectId) }
        : {}),
      ...(userId !== undefined && membersById.has(userId)
        ? { member: membersById.get(userId) }
        : {}),
    });
  }
  return resolutions;
}
