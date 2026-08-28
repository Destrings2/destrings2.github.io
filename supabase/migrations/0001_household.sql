-- ============================================================
-- Households, the people in them, and how someone joins one.
--
-- Everything else in the schema hangs off a household, and every policy in
-- every later migration reduces to the same question: is the caller a member
-- of the household this row belongs to?
-- ============================================================

create extension if not exists pgcrypto;

create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  -- Most work the planner will put into any one person-day.
  daily_cap   int not null default 90 check (daily_cap between 10 and 600),
  -- How the floor colours read: outstanding load, who owns it, or plain.
  tint        text not null default 'load' check (tint in ('load', 'who', 'plain')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  display_name  text not null check (length(trim(display_name)) between 1 and 60),
  -- Their colour everywhere: the plan, the timeline lanes, the room tint.
  colour        text not null check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  created_at    timestamptz not null default now(),
  unique (household_id, user_id)
);

create index members_user_idx on members (user_id);
create index members_household_idx on members (household_id);

create table household_invites (
  code          text primary key check (code ~ '^[A-Z0-9]{6,12}$'),
  household_id  uuid not null references households on delete cascade,
  created_by    uuid not null references members on delete cascade,
  expires_at    timestamptz not null,
  claimed_at    timestamptz,
  claimed_by    uuid references members on delete set null
);

create index household_invites_household_idx on household_invites (household_id);

-- ------------------------------------------------------------
-- The one helper every policy uses.
--
-- security definer so that reading `members` here does not itself go through
-- the `members` policy, which would consult this function, and so on. That
-- recursion is the standard way to lock yourself out of a Supabase schema.
-- ------------------------------------------------------------
create or replace function my_households()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select household_id from members where user_id = auth.uid()
$$;

revoke all on function my_households() from public;
grant execute on function my_households() to authenticated;

-- ------------------------------------------------------------
-- Row-level security
-- ------------------------------------------------------------
alter table households enable row level security;
alter table members enable row level security;
alter table household_invites enable row level security;

create policy household_select on households for select to authenticated
  using (id in (select my_households()));

create policy household_update on households for update to authenticated
  using (id in (select my_households()))
  with check (id in (select my_households()));

-- Creating a household is unrestricted; you become its first member in the
-- same transaction, via create_household().
create policy household_insert on households for insert to authenticated
  with check (true);

create policy member_select on members for select to authenticated
  using (household_id in (select my_households()));

create policy member_update on members for update to authenticated
  using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

-- You may only ever insert a row that is about you. Joining someone else's
-- household goes through join_household(), which checks the invite.
create policy member_insert on members for insert to authenticated
  with check (user_id = auth.uid());

create policy member_delete on members for delete to authenticated
  using (user_id = auth.uid());

-- Invites are readable by the household that issued them. Redeeming one is
-- done by join_household(), which runs as definer and does not need this.
create policy invite_select on household_invites for select to authenticated
  using (household_id in (select my_households()));

create policy invite_insert on household_invites for insert to authenticated
  with check (household_id in (select my_households()));

create policy invite_delete on household_invites for delete to authenticated
  using (household_id in (select my_households()));

-- ------------------------------------------------------------
-- updated_at, kept honest by the database rather than by every caller
-- ------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger households_touch before update on households
  for each row execute function touch_updated_at();
