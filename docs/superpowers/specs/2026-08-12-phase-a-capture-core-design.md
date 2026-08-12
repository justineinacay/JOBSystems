# Phase A — Capture Core: Links, Universal Linking, Inbox, Tags

Status: approved for implementation planning
Depends on: nothing (foundational — other phases benefit from this existing)

## Why

Inspired by a comparison against trybrainee.app. J.O.B Systems organizes tasks/notes/events
by Domain, but has no way to (a) save a URL as a first-class item, (b) explicitly relate two
items of different types to each other, (c) capture something before deciding which Domain it
belongs to, or (d) label items with a lightweight cross-Domain tag. All four are additive —
nothing existing changes shape.

## Data model

New Supabase tables:

```sql
create table public.saved_links (
  id text not null,
  user_id uuid not null references auth.users(id),
  url text not null,
  title text,
  preview_image text,
  favicon text,
  world_id text,        -- nullable = sits in Inbox until assigned
  project_id text,       -- nullable, set once Phase C ships
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

create table public.item_links (
  id text not null,
  user_id uuid not null references auth.users(id),
  from_type text not null check (from_type in ('task','note','event','link')),
  from_id text not null,
  to_type text not null check (to_type in ('task','note','event','link')),
  to_id text not null,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);
```

New columns on existing tables: `tags text[] default '{}'` on `tasks`, `notes`, `cal_events`.
(`cal_events` also needs a nullable `world_id` column added — it doesn't have one today,
which is also required for the Inbox to work for events.)

Both new tables follow the existing RLS pattern used by every other table in this project
(select/insert/update/delete scoped to `auth.uid() = user_id`).

## Components

- **Links view** — new sidebar/rail entry (desktop) + mobile Domains-grid entry. List of
  `saved_links`, "+ Add Link" (paste URL → auto-fetch → editable preview → save), per-link
  refresh button (re-fetch metadata on demand), delete.
- **`fetch-link-metadata` Edge Function** — new, mirrors the existing push-notification
  function's shape. Input: `{url}`. Fetches the page server-side, parses `<title>`,
  `og:image`, favicon. Output: `{title, previewImage, favicon}`. Never throws on a bad/blocked
  URL — returns whatever it could parse, defaults `title` to the bare URL if nothing found.
- **"Related" section** — shared component added to the Task/Note/Event/Link edit modals.
  Shows linked-item chips + "+ Link item" button opening a search-and-pick overlay (reuses
  `smartSearch`, filtered to the 4 linkable types).
- **Inbox view** — new sidebar/rail entry. Computed list (see Data flow), each row has an
  inline "Assign to Domain" picker.
- **Tag input** — shared component added to the same 4 edit modals. Freeform text, autocomplete
  sourced from the union of `tags` already used across `tasks`/`notes`/`cal_events`/`saved_links`.
- **Search** — `smartSearch()` extended to index Notes (not currently searched — a pre-existing
  gap this closes as a side effect), Links, and tags. A `#tag` token in the search bar filters
  to that tag across all 4 types.

## Data flow

- **Save a link**: paste URL → POST to `fetch-link-metadata` → merge result into the draft →
  user can edit any field → `SB.upsert('saved_links', row, 'savedLinks')`.
- **Add a relation**: pick target in the Related picker → insert one `item_links` row →
  `SB.upsert('item_links', row, 'itemLinks')` → optimistic local push, re-render both items'
  Related sections (the relation reads as bidirectional even though it's stored as one row —
  querying checks both `from_*` and `to_*` sides for a given item).
- **Delete an item**: also delete every `item_links` row where the item appears on either side,
  before/alongside deleting the item itself.
- **Inbox**: computed, not stored — `DB.tasks.filter(t=>!t.world)` ∪ `DB.notes.filter(n=>!n.worldId)`
  ∪ `DB.calEvents.filter(e=>!e.worldId)` ∪ `DB.savedLinks.filter(l=>!l.world_id)`, merged and
  sorted newest-first. Quick-add (existing NL quick-add, "+Task/Note/Event/Link") defaults to
  no Domain when launched from Inbox or a new global "+" capture button, so new items land here
  automatically until triaged.

## Error handling

- Metadata fetch failure (bot-blocked, timeout, 404) never blocks saving — link saves with just
  the URL, title defaults to the URL string, user edits manually if they want.
- `item_links` write failures follow the app's existing pattern: save locally first, sync
  failure shows a toast, local edit is never lost (matches `SB.upsert`'s established behavior).
- Cascading `item_links` cleanup on item delete is best-effort, not transactional — consistent
  with how the rest of this app already handles Supabase failures (silent fallback, local state
  wins).

## Testing (manual — no test framework, single-file vanilla JS app)

Verify in-browser at the real device viewport, per this session's established pattern
(computed styles / DOM state, not just screenshots):
- Link save round-trip, including the metadata-fetch-failure fallback path
- Relation add/remove, and that deleting a linked item cleans up its `item_links` rows
- Inbox correctly excludes an item the moment it's assigned a Domain
- Tag autocomplete surfaces tags already used elsewhere
- Search now finds Notes (previously didn't) and Links, and `#tag` filtering works

## Out of scope for this phase

- No scheduled/background refresh of link previews (the refresh button is on-demand only)
- No tag management screen, no tag rename/merge tooling
- No bulk operations on Links (that's a Phase C pattern, not needed here)
