-- Comps: initial schema (Step 1)
-- Paste this whole file into the Supabase SQL editor and run it once on a fresh project.
-- Matches the data model in docs/ARCHITECTURE.md.

begin;

-- ---------------------------------------------------------------------------
-- profiles: one row per user, created automatically on signup
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  plan        text not null default 'free' check (plan in ('free', 'pro')),
  pro_since   timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- runs: one row per question. Usage limits are counted from this table.
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  question    text not null,
  answer      text,
  trace       jsonb not null default '[]'::jsonb,
  status      text not null check (status in ('success', 'failed')),
  created_at  timestamptz not null default now()
);

-- Speeds up "how many successful runs has this user had (today)?"
create index if not exists runs_user_id_created_at_idx
  on public.runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Create a profile automatically when someone signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for anyone who signed up before this migration ran.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row-level security: users can READ only their own rows.
-- There are deliberately no insert/update/delete policies, so only the server
-- (admin client with the secret key, which bypasses RLS) can write. That's what
-- stops a user from setting their own plan to 'pro'.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.runs enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can read their own runs" on public.runs;
create policy "Users can read their own runs"
  on public.runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Table privileges, as a second layer on top of RLS.
revoke all on public.profiles, public.runs from anon;
revoke insert, update, delete, truncate on public.profiles, public.runs from authenticated;
grant select on public.profiles, public.runs to authenticated;
grant all on public.profiles, public.runs to service_role;

commit;
