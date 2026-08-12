# Phase C — Projects Hierarchy: Sub-grouping, Bulk Move/Merge, Drag-to-Reassign

Status: approved for implementation planning
Depends on: nothing structurally, but is more useful once Phase A's linking exists (a Project's
items can be related to each other via the same `item_links` mechanism instead of needing their
own linking system)

## Why

Inspired by trybrainee.app's Area → Project → Folder hierarchy. J.O.B Systems' Domains are the
"Area" level, but everything inside a Domain (tasks, notes, events) is flat — a Domain like
VENTURE has no way to distinguish "TJC Partnership" work from "Investor Outreach" work except by
scrolling and reading titles. This is the largest structural change of the four phases.

## Data model

```sql
create table public.projects (
  id text not null,
  user_id uuid not null references auth.users(id),
  world_id text not null,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);
```

New nullable `project_id text` column on `tasks`, `notes`, `cal_events`. `null` means
"Unassigned" within that Domain — never means the item is invisible or orphaned.

## Components

- **Project management** — inline "+ New Project" (name + color) within a Domain's board/
  settings area; edit, delete, and merge actions on existing Projects.
- **Tasks board grouping** — new "Group by: Board / Status / Project" toggle. Selecting Project
  renders collapsible sections per Project (plus an "Unassigned" section), replacing the status
  columns for that view mode. Board and Status grouping remain exactly as they are today.
- **Project picker** — added to Task/Note/Event edit modals alongside the existing Domain
  picker, filtered to Projects belonging to whichever Domain is currently selected on that item.
- **Bulk action bar** — extends the existing multi-select checkboxes already present on the
  Tasks table. When 1+ tasks are selected, a "Move to Project" button appears alongside whatever
  bulk actions exist today.
- **Merge Projects** — pick a source and target Project (must be in the same Domain), confirm,
  execute.
- **Drag-to-reassign** — in the Project-grouped board view, dragging a task card from one
  Project's section to another updates its `project_id`. This extends the exact drag-and-drop
  mechanism the Kanban view already has for moving a task between status columns
  (`dragstart`/`dragover`/`drop` handlers already implemented) — new drop target, same pattern.

## Data flow

- **Create Project**: `SB.upsert('projects', row, 'projects')`.
- **Assign via picker**: set `project_id` on the item, `SB.upsert` as normal — no different from
  any other field edit in this app.
- **Bulk move**: iterate selected task IDs, `SB.upsert` each with the new `project_id`. (If
  `sbFetch` supports a batched `PATCH ... WHERE id IN (...)`, prefer that for efficiency;
  otherwise sequential upserts, consistent with how the rest of the app already batches.)
- **Merge**: `UPDATE tasks/notes/cal_events SET project_id = <target> WHERE project_id =
  <source> AND user_id = auth.uid()`, then delete the source `projects` row. Runs as one
  operation so a page refresh mid-merge can't leave items split across both.
- **Drag-to-reassign**: on drop, set `project_id` to the target section's Project, `SB.upsert`,
  matching the existing Kanban drop handler's shape.

## Error handling

- **Deleting a Project** with items still assigned: those items fall back to `project_id: null`
  ("Unassigned" within that Domain) — never silently deleted. This mirrors the fix already
  shipped this session for Domain deletion (deleting a Domain doesn't delete its tasks).
- **Merge race** (source Project deleted by another device mid-merge): not specially handled —
  acceptable for a single-user personal app, matches this project's existing risk tolerance for
  concurrent-edit edge cases elsewhere.

## Testing (manual)

- Create 2+ Projects in a Domain; assign tasks via picker and via drag; confirm both update
  `project_id` correctly and render in the right section.
- Bulk-select several tasks, move to a Project, confirm all update in one action.
- Merge two Projects; confirm every task/note/event from the source now shows the target
  Project, and the source Project is gone.
- Delete a Project with tasks assigned; confirm those tasks survive as "Unassigned", not deleted.

## Out of scope for this phase

- No Project-level progress bars, analytics, or completion percentage
- No nested sub-Projects (Brainee's "Folders" level) — one flat layer between Domain and item
- No cross-Domain Project moves (a Project's `world_id` is fixed at creation)
