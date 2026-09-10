/** Passive reverse mapping of the supported Calendar fields. */
export type Values = Record<string, unknown>;
const NAME = 'https://atomicdata.dev/properties/name';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
function object(value: unknown): Values {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Calendar sync needs a valid imported baseline');
  return value as Values;
}
function validateTimes(start: unknown, end: unknown): void {
  const a = object(start),
    b = object(end);
  const allDay = typeof a.date === 'string';
  const parse = (v: Values) => {
    if (allDay) {
      if (
        typeof v.date !== 'string' ||
        v.dateTime !== undefined ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.date)
      )
        throw new Error('Invalid all-day event dates');
      const time = Date.parse(`${v.date}T00:00:00Z`);
      if (
        !Number.isFinite(time) ||
        new Date(time).toISOString().slice(0, 10) !== v.date
      )
        throw new Error('Invalid all-day event dates');
      return time;
    }
    if (
      typeof v.dateTime !== 'string' ||
      v.date !== undefined ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v.dateTime) ||
      !Number.isFinite(Date.parse(v.dateTime))
    )
      throw new Error('Event times need an explicit UTC offset');
    return Date.parse(v.dateTime);
  };
  if (parse(b) <= parse(a)) throw new Error('Event end must follow its start');
}

export interface CalendarValuesEdit {
  patch: Values;
  observed: Values;
  acknowledged: Values;
}
/** Compute a field patch from supplied values; never reads or writes a dataset. */
export function planCalendarValues(
  row: Values,
  baseline: Values,
  propertyMap: Record<string, string>,
  remote: Values,
): CalendarValuesEdit | undefined {
  const patch: Values = {},
    observed: Values = {},
    acknowledged: Values = {};
  for (const field of ['summary', 'description', 'location', 'start', 'end']) {
    const properties =
      field === 'summary'
        ? [NAME, propertyMap.summary].filter(Boolean)
        : [propertyMap[field]].filter(Boolean);
    const changed = properties.filter((p) => !same(row[p], baseline[p]));
    if (!changed.length) continue;
    const local = row[changed[0]] ?? '';
    if (changed.some((p) => !same(row[p] ?? '', local)))
      throw new Error(
        'Title and Summary disagree; make them match before syncing',
      );
    if (
      ['summary', 'description', 'location'].includes(field) &&
      typeof local !== 'string'
    )
      throw new Error(`Calendar ${field} must be text`);
    if (
      !same(remote[field] ?? '', local) &&
      changed.some((p) => !same(remote[field] ?? '', baseline[p] ?? ''))
    )
      throw new Error(
        `Calendar conflict in ${field}; fetch and resolve the source/local conflict first`,
      );
    for (const p of properties) {
      observed[p] = row[p];
      acknowledged[p] = local;
    }
    if (!same(remote[field] ?? '', local)) patch[field] = local;
  }
  if (!Object.keys(acknowledged).length) return;
  if (patch.start || patch.end)
    validateTimes(patch.start ?? remote.start, patch.end ?? remote.end);
  return { patch, observed, acknowledged };
}
