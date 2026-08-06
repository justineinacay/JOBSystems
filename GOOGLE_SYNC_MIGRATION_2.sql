-- ============================================================================
-- J.O.B Systems — Gmail-to-task sync + multi-list Google Tasks support
-- ============================================================================
-- Run in Supabase SQL Editor. Idempotent, safe to re-run.
-- ============================================================================

-- Starred Gmail messages that became PWA tasks — lets completing the task
-- archive/unstar the source email, and stops the same email from creating
-- a duplicate task on every sync poll.
alter table public.tasks
  add column if not exists gmail_message_id text;

-- Which Google Tasks list a synced task actually lives in — without this,
-- sync only ever sees/writes the "@default" list and silently ignores any
-- other list you have in Google Tasks.
alter table public.tasks
  add column if not exists google_task_list_id text;

create index if not exists idx_tasks_gmail_message_id
  on public.tasks(gmail_message_id) where gmail_message_id is not null;
