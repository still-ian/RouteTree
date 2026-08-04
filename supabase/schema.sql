-- RouteTree.ai database schema
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run: it drops and recreates its own objects, but never touches auth.users.

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ---------- teams ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  owner_id uuid, -- set after profiles exists, see foreign key added below
  status text not null default 'inactive', -- inactive | active | past_due | canceled
  stripe_customer_id text,
  stripe_subscription_id text,
  seat_limit int not null default 10,
  created_at timestamptz not null default now()
);

-- ---------- profiles (one row per auth.users row) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Coach',
  theme_color text not null default '#C9A831',
  team_id uuid references public.teams(id) on delete set null,
  individual_status text not null default 'inactive', -- inactive | active | past_due | canceled
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.teams
  add constraint teams_owner_fk foreign key (owner_id) references public.profiles(id) on delete set null;

-- ---------- plays ----------
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade, -- null = personal play, set = shared with team
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- auto-create a profile row whenever someone signs up ----------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Coach'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- helper: look up a team by its join code without exposing the whole table ----------
create or replace function public.find_team_by_code(code text)
returns table(id uuid, name text, seat_limit int, status text)
security definer
as $$
  select t.id, t.name, t.seat_limit, t.status
  from public.teams t
  where t.join_code = upper(code)
$$ language sql;

-- ---------- helper: current member count of a team ----------
create or replace function public.team_member_count(t_id uuid)
returns int
security definer
as $$
  select count(*)::int from public.profiles where team_id = t_id;
$$ language sql;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.plays enable row level security;

-- profiles: everyone can read their own row and the rows of their teammates (for a roster view);
-- everyone can only update their own row.
drop policy if exists "profiles_select_own_or_team" on public.profiles;
create policy "profiles_select_own_or_team" on public.profiles
  for select using (
    id = auth.uid()
    or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- teams: members can read their own team row (includes the join code and seat count).
drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member" on public.teams
  for select using (
    id = (select p.team_id from public.profiles p where p.id = auth.uid())
  );

-- plays: owner or teammate can read; owner or teammate can write/delete team plays,
-- only the owner can write/delete a personal (team_id is null) play.
drop policy if exists "plays_select" on public.plays;
create policy "plays_select" on public.plays
  for select using (
    owner_id = auth.uid()
    or (team_id is not null and team_id = (select p.team_id from public.profiles p where p.id = auth.uid()))
  );

drop policy if exists "plays_insert" on public.plays;
create policy "plays_insert" on public.plays
  for insert with check (
    owner_id = auth.uid()
    and (
      team_id is null
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

drop policy if exists "plays_update" on public.plays;
create policy "plays_update" on public.plays
  for update using (
    owner_id = auth.uid()
    or (team_id is not null and team_id = (select p.team_id from public.profiles p where p.id = auth.uid()))
  );

drop policy if exists "plays_delete" on public.plays;
create policy "plays_delete" on public.plays
  for delete using (
    owner_id = auth.uid()
    or (team_id is not null and team_id = (select p.team_id from public.profiles p where p.id = auth.uid()))
  );
