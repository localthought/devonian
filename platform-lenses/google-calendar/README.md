# Google Calendar platform modules

`lens/` contains passive display/recurrence projections and reverse field mapping.
Import it through `devonian/platform-lenses/google-calendar/lens`.

- `calendarProjection` adds Atomic calendar display properties.
- `calendarRecurrenceProjection` preserves a recurrence payload for Atomic views.
- `planCalendarValues` computes supported Google field changes from supplied
  local, baseline, and remote values without fetching or writing anything.

The projection helpers use the consuming application's compatible `@tomic/lib`
calendar helpers. They preserve provider fields; recurrence display is not a
reverse synchronization of Google recurrence rules.

`sync.ts` retains membership/identity checks, remote reads, ETags, and checkpoint
handling. `import.ts` retains query configuration. The old projection, recurrence,
and types modules re-export the moved modules so existing imports keep working.
