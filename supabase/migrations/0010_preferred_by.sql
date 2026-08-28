-- ============================================================
-- A job someone would rather do.
--
-- A lean, not an assignment. The planner gives the job to whoever prefers it
-- while the week is still even between them, and stops once doing so would
-- push them past their share — so a preference cannot quietly undo the split
-- the whole thing exists to keep.
--
-- Nulled rather than cascaded when a member leaves: the job stays, it simply
-- goes back to being nobody's preference.
-- ============================================================

alter table chores
  add column if not exists preferred_by uuid references members (id) on delete set null;

-- Only somebody actually in this household can be the one who prefers it.
create or replace function chore_preferrer_is_a_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.preferred_by is null then
    return new;
  end if;
  if not exists (
    select 1 from members
    where id = new.preferred_by and household_id = new.household_id
  ) then
    raise exception 'that person is not in this household';
  end if;
  return new;
end;
$$;

drop trigger if exists chore_preferrer_check on chores;
create trigger chore_preferrer_check
  before insert or update of preferred_by, household_id on chores
  for each row execute function chore_preferrer_is_a_member();
