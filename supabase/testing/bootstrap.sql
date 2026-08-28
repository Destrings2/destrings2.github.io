-- ============================================================
-- Enough of Supabase to run the migrations against a plain Postgres.
--
-- Supabase supplies the auth schema, auth.uid(), and the anon/authenticated/
-- service_role roles. None of that is in the migrations, so testing them
-- offline means standing it up first. Everything here mirrors what the hosted
-- platform provides; nothing here is part of the app's own schema.
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the subject claim out of the request's JWT. In tests the same
-- setting is written directly, which is what `become(user)` does.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Supabase creates this publication for you; Realtime broadcasts whatever is
-- in it. Created empty here so the migration that adds tables has something to
-- add them to.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- The whole claim set, which is where the caller's email lives. Supabase
-- reads it from the request's JWT; here it is written directly by `as()`.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants new objects to these roles as they are created, via default
-- privileges — not in a sweep afterwards. Modelling it the other way round
-- would silently undo any revoke a migration performs on its own table, which
-- is exactly what founder_invites relies on.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
