create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  purpose text not null default 'dashboard_assistant',
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ai_requests enable row level security;

revoke all on table public.ai_requests from anon;
grant select, insert on table public.ai_requests to authenticated;

drop policy if exists "ai_requests_select_own" on public.ai_requests;
create policy "ai_requests_select_own"
  on public.ai_requests for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_requests_insert_own" on public.ai_requests;
create policy "ai_requests_insert_own"
  on public.ai_requests for insert to authenticated
  with check ((select auth.uid()) = user_id);

create index if not exists idx_ai_requests_user_created
  on public.ai_requests(user_id, created_at desc);
