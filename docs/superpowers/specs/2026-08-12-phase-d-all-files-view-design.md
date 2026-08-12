# Phase D — All Files View

Status: approved for implementation planning
Depends on: Phase A (indexes `saved_links` previews alongside existing attachment sources —
works without Phase A too, just with one fewer source type until it ships)

## Why

Inspired by trybrainee.app's Files content type. J.O.B Systems already attaches files via
Google Drive links on tasks/notes and via the Gallery domain module — arguably richer than
Brainee's local-device-only files — but there's no single place to see every attached file
across the whole app at once.

## Data model

None. This is a pure read-time aggregation over data that already exists:
- `tasks[].driveLink`
- Drive blocks inside `notes[].blocks`
- Gallery-module files stored in a Domain's module data (`DOMAIN_MODULE_*` gallery type)
- `saved_links[].preview_image` (once Phase A ships)

No new table, no new sync logic — nothing here is stored differently than it is today.

## Components

- New "All Files" sidebar/rail entry (desktop) + mobile Domains-grid entry.
- List/grid view: thumbnail (or a generic file-type icon when there's no image), the source
  item's name, a click-through back to that source item, and a Domain filter dropdown.

## Data flow

On view load, scan `DB.tasks`, `DB.notes`, `DB.worlds` (gallery module data), and
`DB.savedLinks` client-side; build one flat array of
`{name, url, thumbnail, sourceType, sourceId, worldId}`; render. Clicking an entry navigates to
and opens its source item (task modal, note editor, or the domain's gallery module). Nothing is
cached — the aggregation runs fresh on every view load, so it can never show a stale or
already-deleted file.

## Error handling

- Missing or broken thumbnail: falls back to a generic file-type icon, never a broken-image box.
- Source item deleted since last view: simply doesn't appear (freshly computed each time, not
  cached), so there's no dangling-reference state to handle.

## Testing (manual)

- Attach files via all three existing sources (task Drive link, note Drive block, Gallery
  module) plus a saved Link with a preview image; confirm all four surface in All Files.
- Filter by Domain; confirm only that Domain's files show.
- Click through from a file entry; confirm it opens the correct source item.
- Delete a source item; confirm its file no longer appears without needing a manual refresh.

## Out of scope for this phase

- No file upload/storage of its own — this only indexes files already attached elsewhere
- No bulk file operations (download-all, bulk delete)
- No file-type filtering (images vs PDFs vs docs) — Domain filter only, v1
