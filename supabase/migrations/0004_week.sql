-- ============================================================
-- The week.
--
-- The plan is derived, not authored — but it is frozen the first time it is
-- asked for and then left alone. buildPlan() is deterministic given its
-- inputs, and one of those inputs is the running total, which moves every time
-- somebody ticks a job off. Without a frozen row, two phones deriving the same
-- week minutes apart get two different plans, and a calendar event has nowhere
-- stable to point.
--
-- So: inputs and overrides remain the source of truth for regeneration; the
-- frozen row is the source of truth for identity.
-- ============================================================

create table week_plans (
  household_id  uuid not null references households on delete cascade,
  -- Always a Monday, in the household's local time.
  week_start    date not null,
  -- [{ key, choreId, memberId, day, at, mins, pinned, skipped }]
  plan          jsonb not null,
  -- { free, share, target, assigned, totalMins } for the Split tab.
  meta          jsonb not null,
  generated_at  timestamptz not null default now(),
  primary key (household_id, week_start)
);

create table overrides (
  household_id    uuid not null references households on delete cascade,
  week_start      date not null,
  -- 'k4#0' — the chore and which of its occurrences this week.
  occurrence_key  text not null,
  member_id       uuid references members on delete set null,
  day             smallint check (day between 0 and 6),
  at_minutes      int check (at_minutes between 0 and 1439),
  skipped         bool not null default false,
  -- Where the edit came from. A drag in Google Calendar is the same intent as
  -- a pin in the app, and both beat the scheduler.
  source          text not null default 'app' check (source in ('app', 'google')),
  updated_at      timestamptz not null default now(),
  primary key (household_id, week_start, occurrence_key)
);

create table completions (
  household_id    uuid not null references households on delete cascade,
  week_start      date not null,
  occurrence_key  text not null,
  chore_id        uuid references chores on delete set null,
  member_id       uuid not null references members on delete cascade,
  mins            int not null check (mins > 0),
  completed_at    timestamptz not null default now(),
  primary key (household_id, week_start, occurrence_key)
);

create index completions_member_idx on completions (member_id);
create index completions_chore_idx on completions (chore_id, completed_at desc);

-- ------------------------------------------------------------
-- The running total is an aggregate, never a counter.
--
-- `ledger[person] += mins` on every tick is a read-modify-write: two devices,
-- two lost updates, and the fairness correction quietly drifts. Ticking a job
-- is an insert here and un-ticking is a delete, so there is nothing to race.
-- ------------------------------------------------------------
create view ledger
with (security_invoker = true) as
  select household_id, member_id, sum(mins)::bigint as mins, count(*)::bigint as jobs
  from completions
  group by household_id, member_id;

-- Who last did each chore, so the grim ones keep rotating. Also derived.
create view last_done_by
with (security_invoker = true) as
  select distinct on (household_id, chore_id)
    household_id, chore_id, member_id, completed_at
  from completions
  where chore_id is not null
  order by household_id, chore_id, completed_at desc;

-- ------------------------------------------------------------
-- Row-level security
-- ------------------------------------------------------------
alter table week_plans enable row level security;
alter table overrides enable row level security;
alter table completions enable row level security;

create policy week_plan_select on week_plans for select to authenticated
  using (household_id in (select my_households()));
create policy week_plan_write on week_plans for all to authenticated
  using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

create policy override_select on overrides for select to authenticated
  using (household_id in (select my_households()));
create policy override_write on overrides for all to authenticated
  using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

create policy completion_select on completions for select to authenticated
  using (household_id in (select my_households()));
create policy completion_write on completions for all to authenticated
  using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

create trigger overrides_touch before update on overrides
  for each row execute function touch_updated_at();
