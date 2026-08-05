-- ============================================================================
-- J.O.B Systems — Row Level Security hardening
-- ============================================================================
-- Context: every table currently has RLS "enabled" but every policy is
-- USING (true) / WITH CHECK (true) for the anon role — meaning RLS is on in
-- name only. Anyone holding the anon key (public, embedded in index.html,
-- and this repo has been public on GitHub) can read and write every row in
-- every table right now, no login required.
--
-- The client code already sets `user_id` on every insert (see the generic
-- save() helper and the agent_tasks/agent_log writers in index.html) in
-- anticipation of this fix — so the client side needs no changes. This
-- script only touches the database.
--
-- HOW TO RUN THIS:
--   1. Rotate your anon key FIRST (Supabase Dashboard → Settings → API →
--      JWT Settings → Generate new JWT secret). Any key that was ever in a
--      public repo must be treated as burned — this script alone does not
--      fix that; the key rotation does.
--   2. Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   3. Send Claude the new anon key so it can be dropped into index.html.
--
-- SAFE TO RE-RUN: every statement is idempotent (IF NOT EXISTS / IF EXISTS /
-- DROP POLICY IF EXISTS before CREATE), so running this twice does nothing
-- destructive.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'tasks','clients','cashflow','cal_events','journal','notes','venture',
    'faith','sides','memories','history','loans','accounts','collateral',
    'social_posts','creative_projects','pipeline','campaigns','influencers',
    'pricing','credentials','agent_tasks','agent_log'
  ];
  pol record;
begin
  foreach t in array tables loop

    -- 1. Make sure the table actually exists before touching it (skip
    --    silently if a name in the list above doesn't match your schema —
    --    check the NOTICE output after running for anything skipped).
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = t) then
      raise notice 'SKIPPED — table not found: %', t;
      continue;
    end if;

    -- 2. Ensure user_id exists so a policy can reference it. Nullable —
    --    do NOT backfill or delete old rows automatically; that's a data
    --    decision only you should make (see the NOTE at the bottom).
    execute format(
      'alter table public.%I add column if not exists user_id uuid references auth.users(id)',
      t
    );

    -- 3. Make sure RLS is actually enforced (it should already be, per
    --    SECURITY.md, but this is idempotent so it's safe to restate).
    execute format('alter table public.%I enable row level security', t);

    -- 4. Drop every existing policy on this table, whatever it's named —
    --    this is what actually removes the old USING (true) policies.
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    -- 5. Recreate strict, owner-scoped policies. Authenticated users only
    --    see/touch their own rows; the anon role gets nothing.
    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',
      t || '_delete_own', t
    );

    raise notice 'HARDENED: %', t;

  end loop;
end $$;

-- ============================================================================
-- NOTE — existing rows with a NULL user_id:
-- Every row written before this migration (i.e. everything currently in
-- the database) has user_id = NULL, because the old permissive policies
-- never required it. Under the new policies, NULL-owned rows are
-- invisible to everyone, including you — auth.uid() never equals NULL.
--
-- If this is a single-user app (just you), run this once, signed in as
-- yourself, to claim all existing rows — replace YOUR_USER_UUID with your
-- real auth.users.id (Supabase Dashboard → Authentication → Users):
--
--   do $$
--   declare t text;
--   begin
--     foreach t in array array[
--       'tasks','clients','cashflow','cal_events','journal','notes','venture',
--       'faith','sides','memories','history','loans','accounts','collateral',
--       'social_posts','creative_projects','pipeline','campaigns','influencers',
--       'pricing','credentials','agent_tasks','agent_log'
--     ] loop
--       if exists (select 1 from information_schema.tables
--                  where table_schema='public' and table_name=t) then
--         execute format(
--           'update public.%I set user_id = %L where user_id is null',
--           t, 'YOUR_USER_UUID'
--         );
--       end if;
--     end loop;
--   end $$;
-- ============================================================================
