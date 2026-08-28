-- ============================================================
-- Tell Realtime which tables to broadcast.
--
-- New tables are not in the publication by default, so without this the
-- subscription connects, reports itself healthy, and never fires — the worst
-- kind of failure, because everything looks right.
--
-- Only the tables that change while both people are looking. Geometry and
-- rooms are edited rarely and never behind your back.
--
-- Idempotent: some projects already publish some tables, and `alter
-- publication ... add table` on one that is already there is an error.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'week_plans', 'overrides', 'completions',
    'chores', 'households', 'members', 'availability'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
