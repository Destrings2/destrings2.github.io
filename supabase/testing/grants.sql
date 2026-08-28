-- ============================================================
-- Intentionally empty.
--
-- Table privileges are granted by `alter default privileges` in bootstrap.sql,
-- as the objects are created — which is how Supabase does it. Granting in a
-- sweep after the migrations instead would undo any revoke a migration
-- performs on its own table, and founder_invites depends on exactly that.
-- ============================================================
select 1;
