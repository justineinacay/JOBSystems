-- ============================================================================
-- J.O.B Systems — Domains (Worlds) cloud sync
-- ============================================================================
-- Domains have never been synced to Supabase at all. Every save('worlds')
-- call site (29 of them) only ever wrote to localStorage. This is why
-- deleting/editing a domain on one device never showed up on another, and
-- why a deleted domain could reappear after a reload — there was nothing
-- in the cloud to reconcile against, each device just had its own drifting
-- local copy.
--
-- Domain objects are richer than a simple named category — beyond
-- id/label/icon/color, a domain can carry an arbitrary set of custom
-- module data (habits, goals, contacts, countdowns, links, a scratchpad,
-- even an embedded mini-database), and that set of fields has already grown
-- organically and will likely keep growing. Rather than enumerate every
-- field as its own typed column (and having to migrate again the next time
-- a new module type is added), this stores the full object as JSONB —
-- id/user_id stay as real columns for RLS and lookups, everything else
-- lives in `data`.
--
-- HOW TO RUN THIS: Supabase Dashboard → SQL Editor → paste → Run.
-- Idempotent, safe to re-run.
-- ============================================================================

create table if not exists public.worlds (
  id text not null,
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.worlds enable row level security;

drop policy if exists worlds_select_own on public.worlds;
drop policy if exists worlds_insert_own on public.worlds;
drop policy if exists worlds_update_own on public.worlds;
drop policy if exists worlds_delete_own on public.worlds;

create policy worlds_select_own on public.worlds
  for select to authenticated using (auth.uid() = user_id);
create policy worlds_insert_own on public.worlds
  for insert to authenticated with check (auth.uid() = user_id);
create policy worlds_update_own on public.worlds
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy worlds_delete_own on public.worlds
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists idx_worlds_user_id on public.worlds(user_id);
