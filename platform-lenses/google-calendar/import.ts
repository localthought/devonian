export interface CalendarRange { start: string; end: string; series?: boolean }
export const googleCalendarLens = {
  platform: 'google-calendar',
  defaultConstants: { calendarId: 'primary' },
  isFor(platform: string) { return platform === 'google-calendar'; },
  query: calendarImportQuery,
};

/** Query overrides consumed by the generic WASM import host. */
export function calendarImportQuery(range: CalendarRange) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end) || range.start >= range.end)
    throw new Error('Calendar range must be increasing YYYY-MM-DD dates');
  const values: Record<string, string | boolean> = {
    singleEvents: !range.series,
    showDeleted: true,
  };
  if (range.series) { /* Full series scans must include moved exceptions. */ }
  else { values.timeMin = `${range.start}T00:00:00Z`; values.timeMax = `${range.end}T00:00:00Z`; values.orderBy = 'startTime'; }
  return { query_overrides: [{ path: '/calendars/{calendarId}/events', values }] };
}
