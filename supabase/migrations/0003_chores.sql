-- ============================================================
-- What needs doing, and when each person could do it.
-- ============================================================

create table chores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households on delete cascade,
  -- NULL means the whole home. This retires the prototype's magic 'flat'
  -- string, which had to be special-cased in five places.
  room_id       uuid references rooms on delete set null,
  name          text not null check (length(trim(name)) between 1 and 200),
  mins          int not null check (mins > 0 and mins <= 600),
  cadence       text not null check (cadence in (
                  'daily', 'twice', 'weekly', 'fortnightly',
                  'monthly', 'quarterly', 'biannual', 'annual')),
  -- Not scheduled early or late: vacuuming, laundry.
  noisy         bool not null default false,
  -- Rotated between people rather than always landing on one: the WC, the bins.
  grim          bool not null default false,
  enabled       bool not null default true,
  -- Stable key from the starter list, so adding a job to the seed later never
  -- duplicates one a household already has.
  seed_key      text,
  -- Soft delete. A hard delete resurrects on the other device.
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (household_id, seed_key)
);

create index chores_household_idx on chores (household_id) where deleted_at is null;
create index chores_room_idx on chores (room_id);

create table availability (
  member_id  uuid not null references members on delete cascade,
  -- Monday = 0.
  dow        smallint not null check (dow between 0 and 6),
  -- Free time is tracked hourly from 06:00 to midnight.
  hour       smallint not null check (hour between 6 and 23),
  primary key (member_id, dow, hour)
);

-- ------------------------------------------------------------
-- Row-level security
-- ------------------------------------------------------------
alter table chores enable row level security;
alter table availability enable row level security;

create policy chore_select on chores for select to authenticated
  using (household_id in (select my_households()));

create policy chore_write on chores for all to authenticated
  using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

-- Either person may paint either grid. You set your hours sitting next to each
-- other, and locking a partner out of yours would make that a chore in itself.
create policy availability_select on availability for select to authenticated
  using (member_id in (select id from members where household_id in (select my_households())));

create policy availability_write on availability for all to authenticated
  using (member_id in (select id from members where household_id in (select my_households())))
  with check (member_id in (select id from members where household_id in (select my_households())));
