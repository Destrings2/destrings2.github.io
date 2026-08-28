-- ============================================================
-- The table grants Supabase applies for you.
--
-- Row-level security decides which rows a role may see; these decide whether
-- it may reach the table at all. Run after the migrations, since they cover
-- tables the migrations created.
-- ============================================================

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on all tables in schema public to anon;
