alter table public.sync_tombstones
add column if not exists gmail_message_id text;

create index if not exists sync_tombstones_user_gmail_idx
on public.sync_tombstones (user_id, gmail_message_id)
where entity_type = 'tasks' and gmail_message_id is not null and active;

with deletion_windows as (
  select user_id,
    min(deleted_at) as first_deleted_at,
    max(deleted_at) as last_deleted_at
  from public.sync_tombstones
  where entity_type = 'tasks' and active
  group by user_id
  having count(*) >= 3
), resurrected_gmail_tasks as (
  select task.*
  from public.tasks as task
  join deletion_windows as deletion_window on deletion_window.user_id = task.user_id
  where task.gmail_message_id is not null
    and task.created_at >= deletion_window.first_deleted_at
    and task.created_at <= deletion_window.last_deleted_at + interval '5 minutes'
)
insert into public.sync_tombstones (
  id,
  user_id,
  entity_type,
  record_id,
  google_id,
  gmail_message_id,
  active,
  deleted_at,
  cleared_at
)
select
  task.user_id::text || ':tasks:' || task.id::text,
  task.user_id,
  'tasks',
  task.id,
  task.google_task_id,
  task.gmail_message_id,
  true,
  now(),
  null
from resurrected_gmail_tasks as task
on conflict (id) do update set
  gmail_message_id = excluded.gmail_message_id,
  active = true,
  deleted_at = excluded.deleted_at,
  cleared_at = null;

delete from public.tasks as task
using public.sync_tombstones as marker
where marker.user_id = task.user_id
  and marker.entity_type = 'tasks'
  and marker.active
  and marker.gmail_message_id is not null
  and marker.gmail_message_id = task.gmail_message_id;

with ranked as (
  select id,
    row_number() over (
      partition by user_id, gmail_message_id
      order by created_at nulls last, id
    ) as row_number
  from public.tasks
  where gmail_message_id is not null
)
delete from public.tasks
where id in (select id from ranked where row_number > 1);

create unique index if not exists tasks_user_gmail_message_uidx
on public.tasks (user_id, gmail_message_id)
where gmail_message_id is not null;
