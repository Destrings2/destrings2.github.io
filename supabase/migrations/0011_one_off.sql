-- ============================================================
-- One-off jobs.
--
-- Everything on the list so far repeats; a flat also has jobs that happen
-- once and are then finished — bleed that one radiator, take the boxes to
-- the tip. They are ordinary jobs with a cadence of their own and a date
-- saying which week they are wanted in.
--
-- Being finished is the existing `enabled` flag: ticking a one-off turns it
-- off, which is what stops it coming back next week, and un-ticking turns it
-- on again.
-- ============================================================

alter table chores drop constraint if exists chores_cadence_check;
alter table chores add constraint chores_cadence_check check (cadence in (
  'once', 'daily', 'twice', 'weekly', 'fortnightly',
  'monthly', 'quarterly', 'biannual', 'annual'));

-- The week a one-off is wanted in. Null means "whenever", which is now.
-- Meaningless on anything that repeats, and simply ignored there.
alter table chores add column if not exists due_on date;

comment on column chores.due_on is
  'For a one-off, the week it is wanted in. Null means as soon as it fits.';
