-- J.E.L.I.X. scheduled briefs
-- Schedule labels are shown in Asia/Manila. pg_cron runs in UTC.

create table if not exists public.jelix_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_key text not null check (schedule_key in ('daily_brief', 'weekly_review')),
  label text not null,
  cron_expression text not null,
  timezone text not null default 'Asia/Manila',
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text check (last_status in ('completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, schedule_key)
);

create table if not exists public.jelix_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.jelix_schedules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_key text not null check (schedule_key in ('daily_brief', 'weekly_review')),
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  output text,
  error_message text,
  model text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists jelix_schedule_runs_user_created_idx
  on public.jelix_schedule_runs (user_id, created_at desc);

alter table public.jelix_schedules enable row level security;
alter table public.jelix_schedule_runs enable row level security;

grant select, update on public.jelix_schedules to authenticated;
grant select on public.jelix_schedule_runs to authenticated;

drop policy if exists "Users can read their JELIX schedules" on public.jelix_schedules;
create policy "Users can read their JELIX schedules"
  on public.jelix_schedules for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can pause their JELIX schedules" on public.jelix_schedules;
create policy "Users can pause their JELIX schedules"
  on public.jelix_schedules for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their JELIX schedule runs" on public.jelix_schedule_runs;
create policy "Users can read their JELIX schedule runs"
  on public.jelix_schedule_runs for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.jelix_schedules (user_id, schedule_key, label, cron_expression, timezone)
select id, 'daily_brief', 'Daily brief', '0 0 * * *', 'Asia/Manila'
from auth.users
on conflict (user_id, schedule_key) do nothing;

insert into public.jelix_schedules (user_id, schedule_key, label, cron_expression, timezone)
select id, 'weekly_review', 'Weekly review', '0 22 * * 0', 'Asia/Manila'
from auth.users
on conflict (user_id, schedule_key) do nothing;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'jelix-daily-brief') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'jelix-daily-brief';
  end if;
  if exists (select 1 from cron.job where jobname = 'jelix-weekly-review') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'jelix-weekly-review';
  end if;
end $$;

select cron.schedule(
  'jelix-daily-brief',
  '0 16 * * *',
  $cron$
    select net.http_post(
      url := 'https://ddxkmidantqgnxfxsrrz.supabase.co/functions/v1/jelix-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{"schedule_key":"daily_brief"}'::jsonb
    );
  $cron$
);

select cron.schedule(
  'jelix-weekly-review',
  '0 14 * * 0',
  $cron$
    select net.http_post(
      url := 'https://ddxkmidantqgnxfxsrrz.supabase.co/functions/v1/jelix-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{"schedule_key":"weekly_review"}'::jsonb
    );
  $cron$
);
