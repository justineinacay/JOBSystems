create table if not exists public.sync_tombstones (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('tasks', 'cal_events')),
  record_id bigint not null,
  google_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz not null default now(),
  cleared_at timestamptz,
  unique (user_id, entity_type, record_id)
);

alter table public.sync_tombstones enable row level security;

revoke all on table public.sync_tombstones from anon;
grant select, insert, update, delete on table public.sync_tombstones to authenticated;

create policy "Users can read their sync tombstones"
on public.sync_tombstones for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their sync tombstones"
on public.sync_tombstones for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their sync tombstones"
on public.sync_tombstones for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their sync tombstones"
on public.sync_tombstones for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists sync_tombstones_user_google_idx
on public.sync_tombstones (user_id, entity_type, google_id)
where google_id is not null and active;

do $$
begin
  alter publication supabase_realtime add table public.sync_tombstones;
exception
  when duplicate_object then null;
end $$;

update public.tasks
set google_task_list_id = '@default'
where google_task_id is not null
  and coalesce(google_task_list_id, '') = '';

with ranked as (
  select id,
    row_number() over (
      partition by user_id, google_task_list_id, google_task_id
      order by created_at nulls last, id
    ) as row_number
  from public.tasks
  where google_task_id is not null
)
delete from public.tasks
where id in (select id from ranked where row_number > 1);

with ranked as (
  select id,
    row_number() over (
      partition by user_id, google_event_id
      order by created_at nulls last, id
    ) as row_number
  from public.cal_events
  where google_event_id is not null
)
delete from public.cal_events
where id in (select id from ranked where row_number > 1);

create unique index if not exists tasks_user_google_task_uidx
on public.tasks (user_id, google_task_list_id, google_task_id)
where google_task_id is not null;

create unique index if not exists cal_events_user_google_event_uidx
on public.cal_events (user_id, google_event_id)
where google_event_id is not null;
