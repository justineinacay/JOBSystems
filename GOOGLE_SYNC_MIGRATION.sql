-- ============================================================================
-- J.O.B Systems — Google Tasks / Calendar two-way sync columns
-- ============================================================================
-- Adds the mapping columns the app needs to know "this local task/event IS
-- this Google Task/Event" so sync can update instead of duplicate, and so
-- deletions on either side can be detected.
--
-- HOW TO RUN THIS: Supabase Dashboard → SQL Editor → paste → Run.
-- Idempotent (IF NOT EXISTS) — safe to re-run.
-- ============================================================================

alter table public.tasks
  add column if not exists google_task_id text;

alter table public.cal_events
  add column if not exists google_event_id text;

create index if not exists idx_tasks_google_task_id
  on public.tasks(google_task_id) where google_task_id is not null;

create index if not exists idx_cal_events_google_event_id
  on public.cal_events(google_event_id) where google_event_id is not null;
