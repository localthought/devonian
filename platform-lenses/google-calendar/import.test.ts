import { describe, expect, it } from 'vitest';
import { calendarImportQuery } from './import.js';

describe('calendar import selection', () => {
  it('bounds expanded instances and retains deleted events', () => {
    const selection = calendarImportQuery({ start: '2026-03-01', end: '2026-04-01' });
    expect(selection.query_overrides[0].values).toMatchObject({
      singleEvents: true, showDeleted: true,
      timeMin: '2026-03-01T00:00:00Z', timeMax: '2026-04-01T00:00:00Z',
      orderBy: 'startTime',
    });
  });

  it('removes bounds for retained series and adds recurrence fields', () => {
    const selection = calendarImportQuery({ start: '2026-03-01', end: '2026-04-01', series: true });
    expect(selection.query_overrides[0].values).toMatchObject({
      singleEvents: false, showDeleted: true, timeMin: null, timeMax: null, orderBy: null,
    });
    expect(selection.schema_property_overrides[0].properties).toHaveProperty('recurrence');
    expect(selection.schema_property_overrides[0].properties).toHaveProperty('originalStartTime');
  });

  it('rejects impossible civil dates', () => {
    expect(() => calendarImportQuery({ start: '2026-99-99', end: '2027-01-01' })).toThrow();
    expect(() => calendarImportQuery({ start: '2026-02-29', end: '2026-03-01' })).toThrow();
  });
});
