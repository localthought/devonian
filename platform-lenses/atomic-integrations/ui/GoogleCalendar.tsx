import { useState } from 'react';
import { calendarFields } from '../../google-calendar/projection.js';
import { calendarImportQuery } from '../../google-calendar/import.js';
import { calendarProjection } from '../../google-calendar/projection.js';
import { calendarRecurrenceProjection } from '../../google-calendar/recurrence.js';
import { applyCalendarEdit, previewCalendarEdits, type CalendarEdit, type CalendarRequest } from '../../google-calendar/sync.js';
import type { FetchedPlatform } from '../../google-calendar/types.js';

export interface CalendarSelection { start: string; end: string; series: boolean }
export const defaultCalendarSelection = (): CalendarSelection => ({
  start: new Date().toISOString().slice(0, 10),
  end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  series: false,
});

export function GoogleCalendarImportControls({ value, disabled, onChange }: {
  value: CalendarSelection; disabled: boolean; onChange(value: CalendarSelection): void;
}) {
  return <>
    <label><input type='checkbox' checked={value.series} disabled={disabled}
      onChange={event => onChange({ ...value, series: event.target.checked })} /> Keep recurring series (fetch full calendars)</label>
    {value.series && <p>Includes all dates and exceptions. Large calendars may exceed the import limit. Unsupported recurrence rules stop the preview.</p>}
    <label>Events from (UTC)<input type='date' value={value.start} disabled={disabled || value.series}
      onChange={event => onChange({ ...value, start: event.target.value })} /></label>
    <label>Events before (UTC)<input type='date' value={value.end} disabled={disabled || value.series}
      onChange={event => onChange({ ...value, end: event.target.value })} /></label>
  </>;
}

export function GoogleCalendarSync({ disabled, config, rows, request, checkpoint }: {
  disabled: boolean;
  config: Parameters<typeof previewCalendarEdits>[1];
  rows(): Promise<Map<string, Record<string, unknown>>>;
  request: CalendarRequest;
  checkpoint(subject: string, values: Record<string, unknown>): Promise<void>;
}) {
  const [edits, setEdits] = useState<CalendarEdit[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const preview = async () => {
    setBusy(true); setError(''); setDone(false); setEdits(undefined);
    try { setEdits(await previewCalendarEdits(await rows(), config, request)); }
    catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!edits || busy) return;
    setBusy(true); setError('');
    try {
      for (const edit of edits) await applyCalendarEdit(edit, async () => (await rows()).get(edit.subject) ?? {}, request,
        values => checkpoint(edit.subject, values));
      setDone(true);
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); setEdits(undefined); }
  };
  return <section>
    <p>Send edits to imported events back to Google: Name or Summary, Description, Location, Start and End. Reconnect with Calendar write access before your first sync.</p>
    <button disabled={disabled || busy} onClick={preview}>{busy ? 'Syncing…' : 'Preview edits for Google'}</button>
    {edits?.map(edit => <div key={edit.subject}><strong>{edit.name}</strong><pre>{JSON.stringify(edit.patch, null, 2)}</pre></div>)}
    {!!edits?.length && <button disabled={disabled || busy} onClick={apply}>Apply edits to Google</button>}
    {edits?.length === 0 && <p>No supported local edits to send.</p>}
    {done && <p>Edits synced. Fetch and preview to receive the latest Google changes.</p>}
    {error && <p role='alert'>{error}</p>}
  </section>;
}

export const googleCalendarIntegration = {
  id: 'google-calendar', label: 'Google Calendar', defaultConstants: { calendarId: 'primary' },
  defaultSelection: defaultCalendarSelection,
  selection: calendarImportQuery,
  project: (value: FetchedPlatform) => calendarRecurrenceProjection(calendarProjection(value)),
  identitySuffix: (value: CalendarSelection) => value.series ? ':series' : '',
  view: { classShortname: 'event', groupByShortname: calendarFields.day },
  ImportControls: GoogleCalendarImportControls,
  Sync: GoogleCalendarSync,
};
