# Phase B — Calendar Polish: Recurring-Event Exceptions, Custom Colors

Status: approved for implementation planning
Depends on: nothing (Phase A's conflict-detection UI is reused, not modified)

## Why

Inspired by trybrainee.app's calendar ("repeating events, with editable single occurrences").
J.O.B Systems' recurring calendar events are virtually expanded from one template row at render
time (`expandRecurring()` / `_expandedDate`) — editing "the event" today edits the whole series,
there's no way to move just one Tuesday's gym session without touching every other Tuesday.
Recurring **tasks** already don't have this problem — investigated during design, and confirmed
each task occurrence is a fully independent row generated fresh from the previous occurrence's
current fields at completion time (`_maybeGenerateNextTaskOccurrence`), so editing one occurrence
before completing it already only affects that occurrence and everything after. No task-side
work is needed here.

## Data model

New columns on `cal_events`:

```sql
alter table public.cal_events
  add column if not exists recur_exceptions jsonb default '{}',
  add column if not exists color text;
```

`recur_exceptions` shape: `{"2026-08-20": {"title": "...", "time": "...", "cancelled": false}}`
— keyed by the occurrence's expanded date, values are whichever fields were overridden for that
date. `color` is a nullable per-event override; when unset, rendering falls back to the existing
Domain-derived color exactly as it does today.

## Components

- Edit-recurring-event modal gains an "Apply to:" choice — **This event** / **This and following
  events** / **All events** — shown only when editing an occurrence of an existing recurring
  series (not shown for a plain one-off event, and "This and following" is hidden if this is
  already the last possible occurrence of a bounded series).
- A "Cancel this occurrence" action, a convenience wrapper that writes
  `{cancelled:true}` via the same "This event" path.
- Color picker swatch added to the event edit modal, reusing the existing swatch-picker pattern
  already used elsewhere in the app (e.g. calendar filter dots).

## Data flow

- **This event**: write `{[date]: {...changedFields}}` into the parent row's `recur_exceptions`,
  `SB.upsert` the parent. Rendering (`expandRecurring`) checks `recur_exceptions[expandedDate]`
  for every virtual occurrence it generates — if `cancelled`, the occurrence is skipped entirely;
  otherwise the override fields are merged on top of the template before the occurrence is
  returned.
- **This and following events**: set the parent's `recur_end` to the day before the edited date
  (capping the original series), then create a *new* `cal_events` row starting at the edited date
  with the edited fields and the same recurrence pattern (`recur`, days-of-week, etc.) as the
  original — effectively splitting the series in two. Both rows are upserted.
- **All events**: edits the parent row's core fields directly — this is today's existing
  behavior, unchanged.
- **Color** rendering: an occurrence's color resolves as `exception.color ?? event.color ??
  domainColor(event.world)` — most specific wins.

## Error handling

- "This and following" is only offered when a later occurrence genuinely exists (i.e. the series
  isn't already bounded to end before or on this date) — checked before showing the option, so
  there's no dead-end choice that resolves to nothing.
- Concurrent edits from two devices to the same occurrence fall under the app's existing
  conflict-detection UI (already shipped this session) — this is a field-level edit on an
  existing table, no new conflict-handling mechanism is needed.

## Testing (manual)

- Create a weekly recurring event; edit one occurrence's time via "This event"; confirm sibling
  occurrences are unaffected in Day/Week/Month/Agenda views.
- Edit via "This and following"; confirm the original series correctly ends the day before, and
  a new series correctly starts at the edited date with the new fields.
- Cancel a single occurrence; confirm it disappears from all calendar views but siblings remain.
- Set a custom color on one event; confirm it renders with that color instead of the Domain
  color, and that clearing it falls back to the Domain color again.

## Out of scope for this phase

- No changes to recurring tasks (confirmed unnecessary — see Why)
- No occurrence-level attendee/location overrides beyond title/time/cancelled
- No UI to visualize "this series was split here" after the fact beyond the events themselves
  existing as two series
